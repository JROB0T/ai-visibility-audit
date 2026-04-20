// ============================================================
// AI Discovery test runner
//
// Loops active prompts through Claude Haiku (with web_search),
// parses answers, detects presence of business/competitors/directories,
// scores each result, writes results + score snapshot.
//
// Safe to call from authenticated API routes AND from the cron job —
// always uses the service-role Supabase client for writes.
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  DIRECTORY_DOMAINS,
  MARKETPLACE_DOMAINS,
  normalizeDomain,
  DEFAULT_DISCOVERY_CLUSTER_WEIGHTS,
} from '@/lib/discovery';
import { ensureDiscoveryProfileAndPrompts, BootstrapError } from '@/lib/discoveryBootstrap';
import {
  countsForSnapshot,
  overallDiscoveryScore,
  clusterScore,
} from '@/lib/discoveryScoring';
import type {
  DiscoveryCluster,
  DiscoveryPositionType,
  DiscoveryPrompt,
  DiscoveryResult,
  DiscoveryScoreSnapshot,
  DiscoveryTier,
  DiscoveryVisibilityStatus,
} from '@/lib/types';

const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
const WEB_SEARCH_TOOL_TYPE = 'web_search_20250305';
const CONCURRENCY = 4;
const MAX_PROMPTS_PER_RUN = 40;
const ALL_CLUSTERS: DiscoveryCluster[] = ['core', 'problem', 'comparison', 'long_tail', 'brand', 'adjacent'];
const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

export type RunDiscoveryTestsInput = {
  siteId: string;
  promptIds?: string[];
  runLabel?: string;
  triggeredBy: 'user' | 'cron' | 'admin';
  tier?: DiscoveryTier;
  teaserPromptCount?: number;
};

export type RunDiscoveryTestsResult = {
  runId: string;
  results: DiscoveryResult[];
  snapshot: DiscoveryScoreSnapshot;
  errors: { promptId: string; error: string }[];
};

interface ClaudeAnalysis {
  businesses_mentioned: string[];
  domains_cited: string[];
  directories_cited: string[];
  marketplaces_cited: string[];
  answer_type: 'local_recommendation' | 'editorial_comparison' | 'directory_heavy' | 'marketplace_heavy' | 'educational' | 'mixed';
}

interface PerPromptOutcome {
  answer: string;
  analysis: ClaudeAnalysis | null;
  parseFailed: boolean;
}

// ============================================================
// Supabase client
// ============================================================

function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ============================================================
// UUID generation (crypto.randomUUID is available in Node 20+ and Edge runtime)
// ============================================================

function newRunId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Fallback (should not hit in prod)
  const rnd = (n: number) => Math.floor(Math.random() * n).toString(16);
  return `${rnd(0xffffffff)}-${rnd(0xffff)}-4${rnd(0xfff)}-${rnd(0xffff)}-${rnd(0xffffffff)}${rnd(0xffff)}`;
}

// ============================================================
// Concurrency pool (no deps)
// ============================================================

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function consume(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  const workers: Promise<void>[] = [];
  for (let w = 0; w < Math.min(limit, items.length); w++) {
    workers.push(consume());
  }
  await Promise.all(workers);
  return results;
}

// ============================================================
// Claude API call with web_search enabled
// ============================================================

const SYSTEM_PROMPT = `You are simulating an AI assistant answering a user's question by searching the web and providing a helpful, natural answer. Use the web_search tool freely to find current information.

After you finish your natural answer, emit this EXACT separator on its own line:
---ANALYSIS---

Then immediately after the separator, emit a single JSON object with these exact keys:
{
  "businesses_mentioned": string[],
  "domains_cited": string[],
  "directories_cited": string[],
  "marketplaces_cited": string[],
  "answer_type": "local_recommendation" | "editorial_comparison" | "directory_heavy" | "marketplace_heavy" | "educational" | "mixed"
}

Rules for the JSON:
- "businesses_mentioned": every company or business name that appears in your answer (deduplicated).
- "domains_cited": every domain or URL you referenced. Use bare hostnames like "example.com", not full URLs.
- "directories_cited": subset of domains_cited that are directory sites (yelp.com, yellowpages.com, angi.com, thumbtack.com, bbb.org, tripadvisor.com, houzz.com, bark.com, homeadvisor.com, trustpilot.com, g2.com, capterra.com).
- "marketplaces_cited": subset of domains_cited that are marketplaces (amazon.com, ebay.com, etsy.com, walmart.com, target.com, wayfair.com, homedepot.com, lowes.com).
- "answer_type": one of the six enum values describing the shape of your answer.

Do not wrap the JSON in markdown or backticks. Do not add commentary after the JSON.`;

async function callClaudeForPrompt(apiKey: string, promptText: string): Promise<PerPromptOutcome> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1500,
        temperature: 0,
        system: SYSTEM_PROMPT,
        tools: [{ type: WEB_SEARCH_TOOL_TYPE, name: 'web_search', max_uses: 1 }],
        messages: [{ role: 'user', content: promptText }],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Claude API error ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    // Concatenate all text blocks (web_search may interleave tool_use blocks)
    const textBlocks: string[] = [];
    if (Array.isArray(data.content)) {
      for (const block of data.content) {
        if (block?.type === 'text' && typeof block.text === 'string') {
          textBlocks.push(block.text);
        }
      }
    }
    const fullText = textBlocks.join('\n').trim();

    const sepIdx = fullText.indexOf('---ANALYSIS---');
    let answer = fullText;
    let analysisRaw = '';
    if (sepIdx >= 0) {
      answer = fullText.slice(0, sepIdx).trim();
      analysisRaw = fullText.slice(sepIdx + '---ANALYSIS---'.length).trim();
    }

    let analysis: ClaudeAnalysis | null = null;
    let parseFailed = false;
    if (analysisRaw.length > 0) {
      try {
        const cleaned = analysisRaw.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        analysis = {
          businesses_mentioned: Array.isArray(parsed.businesses_mentioned)
            ? parsed.businesses_mentioned.map((s: unknown) => String(s || '').trim()).filter((s: string) => s.length > 0)
            : [],
          domains_cited: Array.isArray(parsed.domains_cited)
            ? parsed.domains_cited.map((s: unknown) => normalizeDomain(String(s))).filter((s: string) => s.length > 0)
            : [],
          directories_cited: Array.isArray(parsed.directories_cited)
            ? parsed.directories_cited.map((s: unknown) => normalizeDomain(String(s))).filter((s: string) => s.length > 0)
            : [],
          marketplaces_cited: Array.isArray(parsed.marketplaces_cited)
            ? parsed.marketplaces_cited.map((s: unknown) => normalizeDomain(String(s))).filter((s: string) => s.length > 0)
            : [],
          answer_type: ['local_recommendation', 'editorial_comparison', 'directory_heavy', 'marketplace_heavy', 'educational', 'mixed'].includes(parsed.answer_type)
            ? parsed.answer_type
            : 'mixed',
        };
      } catch {
        parseFailed = true;
      }
    } else {
      parseFailed = true;
    }

    return { answer, analysis, parseFailed };
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  }
}

// ============================================================
// Detection helpers
// ============================================================

function containsInsensitive(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function appearsInFirstSentence(answer: string, name: string): boolean {
  if (!name) return false;
  const firstSentence = answer.split(/[.!?\n]/)[0] || '';
  return containsInsensitive(firstSentence, name);
}

function countBusinessesInList(businesses: string[]): number {
  // Dedupe case-insensitively
  const set = new Set(businesses.map(b => b.toLowerCase()).filter(b => b.length > 0));
  return set.size;
}

function derivePositionType(args: {
  businessMentioned: boolean;
  businessCited: boolean;
  businessNames: string[];
  domain: string;
  answer: string;
  businessesMentioned: string[];
  domainsCited: string[];
}): DiscoveryPositionType {
  const { businessMentioned, businessCited, businessNames, domain, answer, businessesMentioned, domainsCited } = args;

  if (!businessMentioned && !businessCited) {
    return 'not_present';
  }

  // Link-only citation: domain cited but name not mentioned
  if (businessCited && !businessMentioned) {
    return 'cited_as_source';
  }

  // Directly recommended: business appears in first sentence, or is the only business mentioned
  const uniqueBusinesses = countBusinessesInList(businessesMentioned);
  const nameInFirstSentence = businessNames.some(n => appearsInFirstSentence(answer, n))
    || (domain ? appearsInFirstSentence(answer, domain) : false)
    || (domainsCited.length > 0 && domainsCited[0] === domain);

  if (businessMentioned && (nameInFirstSentence || uniqueBusinesses <= 1)) {
    return 'directly_recommended';
  }

  if (businessMentioned && uniqueBusinesses >= 3) {
    return 'listed_among_options';
  }

  if (businessMentioned) {
    return 'mentioned_without_preference';
  }

  return 'implied_only';
}

function deriveVisibilityStatus(args: {
  businessMentioned: boolean;
  businessCited: boolean;
  competitorMentioned: boolean;
  competitorCount: number;
  directoriesCount: number;
  positionType: DiscoveryPositionType;
  uniqueBusinessCount: number;
  parseFailed: boolean;
}): DiscoveryVisibilityStatus {
  const { businessMentioned, businessCited, competitorMentioned, competitorCount, directoriesCount, positionType, uniqueBusinessCount, parseFailed } = args;

  if (parseFailed) return 'unclear';

  if (businessCited && (positionType === 'directly_recommended' || uniqueBusinessCount <= 2)) {
    return 'strong_presence';
  }
  if (businessCited && (positionType === 'listed_among_options' || positionType === 'mentioned_without_preference')) {
    return 'partial_presence';
  }
  if (businessMentioned && !businessCited) {
    return 'indirect_presence';
  }
  if (positionType === 'implied_only') {
    return 'indirect_presence';
  }
  if (!businessMentioned && competitorMentioned && competitorCount >= 2) {
    return 'competitor_dominant';
  }
  if (!businessMentioned && directoriesCount >= 2) {
    return 'directory_dominant';
  }
  if (!businessMentioned && !competitorMentioned) {
    return 'absent';
  }
  return 'unclear';
}

function resultTypeLabel(answerType: ClaudeAnalysis['answer_type']): string {
  switch (answerType) {
    case 'local_recommendation': return 'local business recommendation';
    case 'editorial_comparison': return 'editorial comparison';
    case 'directory_heavy': return 'directory-heavy answer';
    case 'marketplace_heavy': return 'marketplace-heavy answer';
    case 'educational': return 'educational answer';
    case 'mixed': return 'mixed answer';
  }
}

function computeConfidence(parseFailed: boolean, answerLen: number): number {
  if (!parseFailed && answerLen > 200) return 0.9;
  if (!parseFailed && answerLen <= 200) return 0.7;
  if (parseFailed && answerLen > 200) return 0.4;
  return 0.2;
}

function scoreFromStatus(status: DiscoveryVisibilityStatus, position: DiscoveryPositionType | null): number {
  // Mirrors promptScore() — kept inline here so we don't create an import cycle
  // with discoveryScoring.ts (which also depends on this module's output shape).
  switch (status) {
    case 'strong_presence':
      return position === 'listed_among_options' ? 90 : 100;
    case 'partial_presence':
      return position === 'cited_as_source' ? 80 : 75;
    case 'indirect_presence': return 50;
    case 'competitor_dominant': return 25;
    case 'directory_dominant': return 25;
    case 'absent': return 0;
    case 'unclear': return 50;
  }
}

// ============================================================
// Main entry
// ============================================================

export async function runDiscoveryTests(input: RunDiscoveryTestsInput): Promise<RunDiscoveryTestsResult> {
  const { siteId, promptIds, runLabel, triggeredBy } = input;
  const tier: DiscoveryTier = input.tier ?? 'full';
  const teaserPromptCount = Math.max(1, input.teaserPromptCount ?? 5);
  const runId = newRunId();
  const admin = getAdminClient();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  // 1. Load profile (auto-bootstrap if missing)
  let { data: profile } = await admin
    .from('discovery_profiles')
    .select('*')
    .eq('site_id', siteId)
    .maybeSingle();

  // 2. Load active prompts
  async function loadActivePrompts(): Promise<DiscoveryPrompt[]> {
    let q = admin.from('discovery_prompts').select('*').eq('site_id', siteId).eq('active', true);
    if (promptIds && promptIds.length > 0) {
      q = q.in('id', promptIds);
    }
    const { data, error } = await q;
    if (error) {
      throw new Error(`Failed to load prompts: ${error.message}`);
    }
    return (data || []) as DiscoveryPrompt[];
  }

  let allPrompts = await loadActivePrompts();

  // Determine if we need to bootstrap. When promptIds is supplied, allPrompts could be empty
  // because the filter matched nothing — check the unfiltered total instead.
  let shouldBootstrap = !profile;
  if (!shouldBootstrap) {
    if (promptIds && promptIds.length > 0) {
      const { count } = await admin
        .from('discovery_prompts')
        .select('id', { count: 'exact', head: true })
        .eq('site_id', siteId)
        .eq('active', true);
      shouldBootstrap = (count || 0) === 0;
    } else {
      shouldBootstrap = allPrompts.length === 0;
    }
  }

  if (shouldBootstrap) {
    console.log(`[discoveryRunner] auto-bootstrap starting for site=${siteId}`);
    try {
      const result = await ensureDiscoveryProfileAndPrompts({ siteId });
      console.log(
        `[discoveryRunner] auto-bootstrap complete for site=${siteId}`,
        `generated=${result.generated} promptCount=${result.prompts.length}`,
      );
    } catch (err) {
      if (err instanceof BootstrapError) {
        if (err.code === 'no_audit') {
          throw new Error('Run an AI visibility audit first — discovery needs an existing audit to personalize prompts.');
        }
        if (err.code === 'missing_api_key' || err.code === 'claude_failed' || err.code === 'claude_parse_failed' || err.code === 'no_prompts_generated') {
          throw new Error('Could not generate your discovery prompt library. Please try again in a moment.');
        }
        throw new Error('Could not prepare your discovery run. Please try again in a moment.');
      }
      throw err;
    }

    // Reload profile + prompts after bootstrap
    const reloaded = await admin
      .from('discovery_profiles')
      .select('*')
      .eq('site_id', siteId)
      .maybeSingle();
    profile = reloaded.data;
    allPrompts = await loadActivePrompts();
  }

  if (!profile) {
    throw new Error('Could not prepare your discovery profile. Please try again in a moment.');
  }

  const businessName: string = String(profile.business_name || '').trim();
  const businessDomain: string = normalizeDomain(String(profile.domain || ''));
  const brandedTerms: string[] = Array.isArray(profile.branded_terms)
    ? (profile.branded_terms as unknown[]).map(t => String(t || '').trim()).filter(t => t.length > 0)
    : [];
  const businessNames: string[] = Array.from(new Set([businessName, ...brandedTerms].filter(n => n.length > 0)));

  // Cost guardrail: sort by priority then created_at
  const sortedPrompts = allPrompts
    .slice()
    .sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 3;
      const pb = PRIORITY_ORDER[b.priority] ?? 3;
      if (pa !== pb) return pa - pb;
      return (a.created_at || '').localeCompare(b.created_at || '');
    });

  let prompts: DiscoveryPrompt[];
  if (tier === 'teaser') {
    // Teaser: pick a representative subset that covers as many clusters as possible,
    // then fill remaining slots by priority order. Try to ensure >=3 distinct clusters.
    const picked: DiscoveryPrompt[] = [];
    const seenClusters = new Set<DiscoveryCluster>();
    // Pass 1: one prompt per cluster in priority order
    for (const p of sortedPrompts) {
      if (picked.length >= teaserPromptCount) break;
      if (!seenClusters.has(p.cluster)) {
        picked.push(p);
        seenClusters.add(p.cluster);
      }
    }
    // Pass 2: fill any remaining slots with next-best by priority
    if (picked.length < teaserPromptCount) {
      const pickedIds = new Set(picked.map(p => p.id));
      for (const p of sortedPrompts) {
        if (picked.length >= teaserPromptCount) break;
        if (!pickedIds.has(p.id)) picked.push(p);
      }
    }
    prompts = picked;
  } else {
    prompts = sortedPrompts.slice(0, MAX_PROMPTS_PER_RUN);
  }

  console.log(
    `[discoveryRunner] tier=${tier} selected=${prompts.length}`,
    `clusters=${Array.from(new Set(prompts.map(p => p.cluster))).join(',')}`,
  );

  // 3. Load active competitors
  const { data: competitorRows } = await admin
    .from('discovery_competitors')
    .select('name, domain')
    .eq('site_id', siteId)
    .eq('active', true);
  const competitors = (competitorRows || []) as { name: string; domain: string | null }[];

  // 4. Run Claude for each prompt with concurrency cap
  const errors: { promptId: string; error: string }[] = [];
  type WorkOutcome = { prompt: DiscoveryPrompt; outcome: PerPromptOutcome | null };
  const outcomes = await runWithConcurrency<DiscoveryPrompt, WorkOutcome>(
    prompts,
    CONCURRENCY,
    async (prompt) => {
      try {
        const outcome = await callClaudeForPrompt(apiKey, prompt.prompt_text);
        return { prompt, outcome };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({ promptId: prompt.id, error: msg });
        return { prompt, outcome: null };
      }
    },
  );

  // 5. Detect + score + build insert rows
  // Tier tagging: teaser runs get 'tier:teaser' stamped into internal_notes for downstream filtering.
  const tierNote: string | null = tier === 'teaser' ? 'tier:teaser' : null;
  const resultInsertRows: Record<string, unknown>[] = [];
  for (const { prompt, outcome } of outcomes) {
    if (!outcome) {
      // Total Claude failure — insert an 'unclear' placeholder so the run has coverage
      resultInsertRows.push({
        site_id: siteId,
        prompt_id: prompt.id,
        run_id: runId,
        prompt_text: prompt.prompt_text,
        prompt_cluster: prompt.cluster,
        test_surface: 'claude_haiku_web',
        business_mentioned: false,
        business_cited: false,
        business_domain_detected: false,
        business_page_detected: null,
        business_position_type: 'not_present',
        competitor_mentioned: false,
        competitor_names_detected: [],
        competitor_domains_detected: [],
        directories_detected: [],
        marketplaces_detected: [],
        result_type_summary: null,
        visibility_status: 'unclear',
        prompt_score: 50,
        confidence_score: 0.2,
        normalized_response_summary: null,
        raw_response_excerpt: null,
        internal_notes: tierNote,
        recommendation_tags: [],
      });
      continue;
    }

    const { answer, analysis, parseFailed } = outcome;
    const answerLower = answer.toLowerCase();

    const businessesMentioned = analysis?.businesses_mentioned || [];
    const domainsCited = analysis?.domains_cited || [];

    // Business detection
    const businessMentioned = businessNames.some(name =>
      businessesMentioned.some(b => b.toLowerCase() === name.toLowerCase())
      || containsInsensitive(answerLower, name),
    );
    const businessDomainDetected = businessDomain.length > 0
      && domainsCited.some(d => normalizeDomain(d) === businessDomain);
    const businessCited = businessDomainDetected;

    // Competitor detection
    const competitorNamesDetected: string[] = [];
    const competitorDomainsDetected: string[] = [];
    for (const c of competitors) {
      const nameLower = (c.name || '').toLowerCase();
      if (nameLower.length > 0) {
        const inMentioned = businessesMentioned.some(b => b.toLowerCase() === nameLower);
        const inAnswer = containsInsensitive(answerLower, c.name);
        if (inMentioned || inAnswer) competitorNamesDetected.push(c.name);
      }
      const cDomain = normalizeDomain(c.domain || '');
      if (cDomain && domainsCited.some(d => normalizeDomain(d) === cDomain)) {
        competitorDomainsDetected.push(cDomain);
      }
    }
    // Dedupe
    const competitorNames = Array.from(new Set(competitorNamesDetected));
    const competitorDomains = Array.from(new Set(competitorDomainsDetected));
    const competitorMentioned = competitorNames.length > 0 || competitorDomains.length > 0;

    // Pass-through directory/marketplace lists from Claude. Also cross-reference against
    // our known domain lists and include any matches Claude may have missed.
    const directoriesDetected = Array.from(new Set([
      ...(analysis?.directories_cited || []).map(d => normalizeDomain(d)).filter(d => d.length > 0),
      ...domainsCited.map(d => normalizeDomain(d)).filter(d => DIRECTORY_DOMAINS.includes(d)),
    ]));
    const marketplacesDetected = Array.from(new Set([
      ...(analysis?.marketplaces_cited || []).map(d => normalizeDomain(d)).filter(d => d.length > 0),
      ...domainsCited.map(d => normalizeDomain(d)).filter(d => MARKETPLACE_DOMAINS.includes(d)),
    ]));

    const uniqueBusinessCount = countBusinessesInList(businessesMentioned);

    const positionType = derivePositionType({
      businessMentioned,
      businessCited,
      businessNames,
      domain: businessDomain,
      answer,
      businessesMentioned,
      domainsCited,
    });

    // Count unique competitors matched by name OR domain (de-duped across both signals)
    const matchedCompetitors = new Set<string>();
    for (const c of competitors) {
      const nameLower = (c.name || '').toLowerCase();
      const cDomain = normalizeDomain(c.domain || '');
      const matched = competitorNames.some(n => n.toLowerCase() === nameLower)
        || (cDomain && competitorDomains.includes(cDomain));
      if (matched) matchedCompetitors.add(nameLower || cDomain);
    }
    const uniqueCompetitorCount = matchedCompetitors.size;

    const visibilityStatus = deriveVisibilityStatus({
      businessMentioned,
      businessCited,
      competitorMentioned,
      competitorCount: uniqueCompetitorCount,
      directoriesCount: directoriesDetected.length,
      positionType,
      uniqueBusinessCount,
      parseFailed,
    });

    const score = scoreFromStatus(visibilityStatus, positionType);
    const confidence = computeConfidence(parseFailed, answer.length);
    const resultTypeSummary = analysis ? resultTypeLabel(analysis.answer_type) : null;
    const rawExcerpt = answer.slice(0, 400);
    const normalizedSummary = answer.replace(/\s+/g, ' ').trim().slice(0, 280);

    resultInsertRows.push({
      site_id: siteId,
      prompt_id: prompt.id,
      run_id: runId,
      prompt_text: prompt.prompt_text,
      prompt_cluster: prompt.cluster,
      test_surface: 'claude_haiku_web',
      business_mentioned: businessMentioned,
      business_cited: businessCited,
      business_domain_detected: businessDomainDetected,
      business_page_detected: null,
      business_position_type: positionType,
      competitor_mentioned: competitorMentioned,
      competitor_names_detected: competitorNames,
      competitor_domains_detected: competitorDomains,
      directories_detected: directoriesDetected,
      marketplaces_detected: marketplacesDetected,
      result_type_summary: resultTypeSummary,
      visibility_status: visibilityStatus,
      prompt_score: score,
      confidence_score: confidence,
      normalized_response_summary: normalizedSummary,
      raw_response_excerpt: rawExcerpt,
      internal_notes: tierNote,
      recommendation_tags: [],
    });
  }

  // 6. Insert results (one batch)
  let insertedResults: DiscoveryResult[] = [];
  if (resultInsertRows.length > 0) {
    const { data: inserted, error: insertErr } = await admin
      .from('discovery_results')
      .insert(resultInsertRows)
      .select();
    if (insertErr) {
      throw new Error(`Failed to insert discovery results: ${insertErr.message}`);
    }
    insertedResults = (inserted || []) as DiscoveryResult[];
  }

  // 7. Update last_tested_at on every tested prompt
  const testedPromptIds = prompts.map(p => p.id);
  if (testedPromptIds.length > 0) {
    await admin
      .from('discovery_prompts')
      .update({ last_tested_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .in('id', testedPromptIds);
  }

  // 8. Score snapshot
  const overall = overallDiscoveryScore(insertedResults, DEFAULT_DISCOVERY_CLUSTER_WEIGHTS);
  const clusterScores: Partial<Record<DiscoveryCluster, number>> = {};
  for (const cluster of ALL_CLUSTERS) {
    const s = clusterScore(insertedResults, cluster);
    if (s !== null) clusterScores[cluster] = s;
  }
  const counts = countsForSnapshot(insertedResults);

  const snapshotRow = {
    site_id: siteId,
    run_id: runId,
    overall_score: overall,
    cluster_scores: clusterScores,
    prompt_count: counts.promptCount,
    strong_count: counts.strongCount,
    partial_count: counts.partialCount,
    absent_count: counts.absentCount,
    competitor_dominant_count: counts.competitorDominantCount,
  };

  const { data: snapshotInserted, error: snapshotErr } = await admin
    .from('discovery_score_snapshots')
    .insert(snapshotRow)
    .select()
    .single();
  if (snapshotErr || !snapshotInserted) {
    throw new Error(`Failed to insert score snapshot: ${snapshotErr?.message || 'unknown error'}`);
  }

  console.log(
    `[discoveryRunner] site=${siteId} runId=${runId} tier=${tier} triggeredBy=${triggeredBy}${runLabel ? ` label=${runLabel}` : ''}`,
    `prompts=${prompts.length} results=${insertedResults.length} errors=${errors.length} overall=${overall}`,
  );

  return {
    runId,
    results: insertedResults,
    snapshot: snapshotInserted as DiscoveryScoreSnapshot,
    errors,
  };
}
