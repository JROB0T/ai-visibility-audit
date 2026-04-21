// ============================================================
// Discovery profile + prompt library bootstrap.
//
// Extracted from /api/discovery/generate-prompts so it can be reused by
// runDiscoveryTests (for auto-seed on first run) without going through HTTP.
//
// This module handles:
//   - Loading the most recent completed audit for the site
//   - Seeding discovery_profiles if missing (or updating on force=true)
//   - Generating the prompt library via Claude Haiku if no active
//     generated prompts exist (or force=true)
//
// It does NOT auth or parse requests — callers do that. Throws specific
// Error instances on failure; the route handler maps those to HTTP errors.
// ============================================================
//
// ---------------------------------------------------------------------------
// DATA CLEANUP (Ticket 7.5) — DOCUMENTATION ONLY, DO NOT EXECUTE FROM CODE
// ---------------------------------------------------------------------------
// If a site got seeded with a garbage business_name (e.g. "Just a moment...")
// from a Cloudflare/interstitial-blocked scrape, its generated prompts are
// unusable. To clean up, run this in the Supabase SQL Editor (one site at a
// time). After cleanup, the user should click "Run Full AI Discovery" on
// that site — the bootstrap will re-derive a correct business name using the
// new interstitial-aware path and regenerate the prompt library.
//
//   BEGIN;
//   DELETE FROM discovery_results WHERE site_id = '<site_id>';
//   DELETE FROM discovery_score_snapshots WHERE site_id = '<site_id>';
//   DELETE FROM discovery_insights WHERE site_id = '<site_id>';
//   DELETE FROM discovery_recommendations WHERE site_id = '<site_id>';
//   DELETE FROM discovery_prompts WHERE site_id = '<site_id>';
//   DELETE FROM discovery_competitors WHERE site_id = '<site_id>';
//   DELETE FROM discovery_profiles WHERE site_id = '<site_id>';
//   COMMIT;
//
// Quick query to find affected sites:
//   SELECT dp.site_id, dp.business_name, s.domain
//   FROM discovery_profiles dp JOIN sites s ON s.id = dp.site_id
//   WHERE dp.business_name ILIKE 'just a moment%'
//      OR dp.business_name ILIKE '%attention required%'
//      OR dp.business_name ILIKE 'please wait%'
//      OR length(trim(dp.business_name)) < 3;
// ---------------------------------------------------------------------------
//
// ---------------------------------------------------------------------------
// MIGRATION PLAN AFTER TICKET 7.6 DEPLOYS
// ---------------------------------------------------------------------------
// 1) Apply supabase/migrations/003_discovery_context.sql in the Supabase SQL
//    Editor (adds service_area_city, service_area_region columns).
//
// 2) Wipe existing discovery data for sites with a stale / thin profile so
//    the next "Run Full AI Discovery" click triggers a fresh enrichment +
//    prompt regeneration. (The bootstrap already detects stale profiles and
//    re-enriches on its own, but wiping the stale results/snapshots is still
//    required so the new runner starts fresh.)
//
//    BEGIN;
//    WITH stale AS (
//      SELECT site_id FROM discovery_profiles
//      WHERE service_area IS NULL
//         OR core_services = '[]'::jsonb
//         OR jsonb_array_length(core_services) = 0
//         OR primary_category IS NULL
//         OR primary_category = 'other'
//    )
//    DELETE FROM discovery_results WHERE site_id IN (SELECT site_id FROM stale);
//    WITH stale AS (SELECT site_id FROM discovery_profiles WHERE service_area IS NULL OR jsonb_array_length(core_services) = 0 OR primary_category IS NULL OR primary_category = 'other')
//    DELETE FROM discovery_score_snapshots WHERE site_id IN (SELECT site_id FROM stale);
//    WITH stale AS (SELECT site_id FROM discovery_profiles WHERE service_area IS NULL OR jsonb_array_length(core_services) = 0 OR primary_category IS NULL OR primary_category = 'other')
//    DELETE FROM discovery_insights WHERE site_id IN (SELECT site_id FROM stale);
//    WITH stale AS (SELECT site_id FROM discovery_profiles WHERE service_area IS NULL OR jsonb_array_length(core_services) = 0 OR primary_category IS NULL OR primary_category = 'other')
//    DELETE FROM discovery_recommendations WHERE site_id IN (SELECT site_id FROM stale);
//    WITH stale AS (SELECT site_id FROM discovery_profiles WHERE service_area IS NULL OR jsonb_array_length(core_services) = 0 OR primary_category IS NULL OR primary_category = 'other')
//    DELETE FROM discovery_prompts WHERE site_id IN (SELECT site_id FROM stale) AND source = 'generated';
//    COMMIT;
//
// 3) On each affected site, click "Run Full AI Discovery". The bootstrap will
//    call enrichBusinessProfile (Haiku + web_search), re-populate the profile
//    fields, regenerate a location-anchored prompt library, then the runner
//    will execute with the new multi-turn record_analysis forcing.
//
// 4) Validate via browser console or Supabase:
//    - null_summary < 5%        (normalized_response_summary on most rows)
//    - unclear < 10%            (discovery_results.visibility_status)
//    - avg_confidence >= 0.75   (discovery_results.confidence_score)
//    - First few prompts contain service_area_city or service_area_region
// ---------------------------------------------------------------------------

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { clusterDistributionTargets } from '@/lib/discovery';
import { isBadBusinessName, formatDomainAsName } from '@/lib/scanner';
import { inferBusinessNameFromDomain, enrichBusinessProfile, type EnrichedBusinessProfile } from '@/lib/classify';
import type {
  DiscoveryBusinessModel,
  DiscoveryCluster,
  DiscoveryPriority,
  DiscoveryProfile,
  DiscoveryPrompt,
} from '@/lib/types';

const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

const VALID_CLUSTERS: DiscoveryCluster[] = ['core', 'problem', 'comparison', 'long_tail', 'brand', 'adjacent'];
const VALID_PRIORITIES: DiscoveryPriority[] = ['high', 'medium', 'low'];

export type BootstrapInput = {
  siteId: string;
  auditId?: string;
  force?: boolean;
};

export type BootstrapResult = {
  profile: DiscoveryProfile;
  prompts: DiscoveryPrompt[];
  generated: boolean;
};

interface GeneratedPrompt {
  prompt_text: string;
  cluster: DiscoveryCluster;
  priority: DiscoveryPriority;
  service_line_tag: string | null;
  rationale: string;
}

/**
 * Known bootstrap failure reasons. Route handlers can pattern-match on this to
 * produce the right HTTP status without parsing free-form error messages.
 */
export class BootstrapError extends Error {
  code: 'site_not_found' | 'no_audit' | 'profile_insert_failed' | 'claude_failed' | 'claude_parse_failed' | 'no_prompts_generated' | 'prompt_insert_failed' | 'missing_api_key';
  constructor(code: BootstrapError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function inferBusinessModel(vertical: string | null | undefined): DiscoveryBusinessModel | null {
  switch (vertical) {
    case 'local_service':
    case 'restaurant':
      return 'local_service';
    case 'ecommerce':
      return 'ecommerce';
    case 'saas':
    case 'professional_services':
    case 'law_firm':
    case 'healthcare':
      return 'professional_services';
    case 'other':
      return 'other';
    default:
      return null;
  }
}

export async function ensureDiscoveryProfileAndPrompts(input: BootstrapInput): Promise<BootstrapResult> {
  const { siteId, auditId, force } = input;
  const admin = getAdminClient();

  // Load site
  const { data: site, error: siteErr } = await admin
    .from('sites')
    .select('id, domain, vertical, url')
    .eq('id', siteId)
    .maybeSingle();
  if (siteErr || !site) {
    throw new BootstrapError('site_not_found', 'Site not found');
  }

  // Load audit (specific or most recent completed)
  let audit: Record<string, unknown> | null = null;
  if (auditId) {
    const { data } = await admin.from('audits').select('*').eq('id', auditId).maybeSingle();
    audit = data;
  } else {
    const { data } = await admin
      .from('audits')
      .select('*')
      .eq('site_id', siteId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    audit = data;
  }
  if (!audit) {
    throw new BootstrapError('no_audit', 'No completed audit found for this site');
  }

  // Pull homepage page data for description / h1 / meta
  const { data: pages } = await admin
    .from('audit_pages')
    .select('page_type, title, meta_description, h1_text')
    .eq('audit_id', audit.id as string);
  const homepage = (pages || []).find(p => p.page_type === 'homepage') || (pages || [])[0] || null;

  // ============================================================
  // Ticket 7.6 — enrichment-first profile seeding.
  //
  // The scraper rarely captures service_area, description, or core_services
  // (especially on Cloudflare-blocked sites). We now ALWAYS call the Haiku
  // enrichment classifier (with web_search) to fill these fields. Scraped
  // data is passed as context; Haiku is trusted to synthesize a complete
  // profile using its world knowledge when the scrape is thin.
  // ============================================================
  const domain = site.domain as string;
  const vertical = (site.vertical as string | null) || 'other';
  const businessModel = inferBusinessModel(vertical);

  // Check for existing profile first — we need to know whether this is a
  // fresh seed OR a stale profile that should be re-enriched.
  const { data: existingProfile } = await admin
    .from('discovery_profiles')
    .select('*')
    .eq('site_id', siteId)
    .maybeSingle();

  const existingTyped = existingProfile as DiscoveryProfile | null;
  const isProfileStale = (p: DiscoveryProfile | null): boolean => {
    if (!p) return true;
    if (!p.service_area || p.service_area.trim().length === 0) return true;
    if (!Array.isArray(p.core_services) || p.core_services.length === 0) return true;
    if (!p.primary_category || p.primary_category === 'other') return true;
    return false;
  };
  const shouldEnrich = !existingTyped || force || isProfileStale(existingTyped);

  // Scraped fallbacks — used when enrichment skips or returns null.
  const rawTitleName = (homepage?.title || '').split(/[—|\-·]/)[0].trim();
  let fallbackName = rawTitleName;
  if (isBadBusinessName(fallbackName)) {
    const inferred = await inferBusinessNameFromDomain(domain);
    fallbackName = (inferred && !isBadBusinessName(inferred))
      ? inferred
      : (formatDomainAsName(domain) || domain);
  }
  if (isBadBusinessName(fallbackName)) {
    fallbackName = formatDomainAsName(domain) || domain;
  }

  let enriched: EnrichedBusinessProfile | null = null;
  if (shouldEnrich) {
    enriched = await enrichBusinessProfile({
      domain,
      scrapedTitle: homepage?.title || null,
      scrapedH1: homepage?.h1_text || null,
      scrapedDescription: homepage?.meta_description || null,
      scrapedBodySnippet: homepage?.meta_description || homepage?.h1_text || null,
      pageUrls: [],
      schemaTypes: [],
      interstitialBlocked: false,
    });
    console.log(
      `[discoveryBootstrap] enrichment for site=${siteId.slice(0, 8)}`,
      `name=${enriched?.business_name || '(null)'}`,
      `category=${enriched?.primary_category || '(null)'}`,
      `city=${enriched?.service_area_city || '(null)'}`,
      `services=${(enriched?.core_services || []).length}`,
    );
  }

  // Resolve each field: prefer enrichment, fall back to scraped/inferred.
  const businessName: string = (enriched?.business_name && !isBadBusinessName(enriched.business_name))
    ? enriched.business_name
    : fallbackName;
  const primaryCategory: string = enriched?.primary_category || vertical;
  const description: string | null = enriched?.description || homepage?.meta_description || null;
  const serviceArea: string | null = enriched?.service_area || null;
  const serviceAreaCity: string | null = enriched?.service_area_city || null;
  const serviceAreaRegion: string | null = enriched?.service_area_region || null;
  const coreServices: string[] = enriched?.core_services || [];
  const brandedTerms: string[] = (enriched?.branded_terms && enriched.branded_terms.length > 0)
    ? enriched.branded_terms
    : [businessName];
  const targetCustomers: string[] = enriched?.target_customer ? [enriched.target_customer] : [];

  let profile = existingTyped;
  if (!profile) {
    const { data: inserted, error: insErr } = await admin
      .from('discovery_profiles')
      .insert({
        site_id: siteId,
        business_name: businessName,
        domain,
        primary_category: primaryCategory,
        service_area: serviceArea,
        service_area_city: serviceAreaCity,
        service_area_region: serviceAreaRegion,
        description,
        core_services: coreServices,
        target_customers: targetCustomers,
        branded_terms: brandedTerms,
        business_model: businessModel,
      })
      .select()
      .single();
    if (insErr) {
      console.error('[discoveryBootstrap] profile insert error:', insErr.message);
      throw new BootstrapError('profile_insert_failed', 'Failed to create discovery profile');
    }
    profile = inserted as DiscoveryProfile;
  } else if (shouldEnrich) {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    // Only overwrite fields that enrichment improved. Preserve existing manual
    // edits where enrichment returned null / empty.
    if (!isBadBusinessName(businessName)) updates.business_name = businessName;
    if (primaryCategory && primaryCategory !== 'other') updates.primary_category = primaryCategory;
    if (serviceArea) updates.service_area = serviceArea;
    if (serviceAreaCity) updates.service_area_city = serviceAreaCity;
    if (serviceAreaRegion) updates.service_area_region = serviceAreaRegion;
    if (description) updates.description = description;
    if (coreServices.length > 0) updates.core_services = coreServices;
    if (targetCustomers.length > 0) updates.target_customers = targetCustomers;
    if (brandedTerms.length > 0) updates.branded_terms = brandedTerms;
    updates.business_model = businessModel;
    updates.domain = domain;
    const { data: updated, error: updErr } = await admin
      .from('discovery_profiles')
      .update(updates)
      .eq('site_id', siteId)
      .select()
      .single();
    if (updErr) {
      console.error('[discoveryBootstrap] profile update error:', updErr.message);
    } else {
      profile = updated as DiscoveryProfile;
    }
  }

  // If existing active generated prompts and NOT force AND the profile wasn't
  // just re-enriched — return as-is. When the profile was stale (shouldEnrich
  // was true), the old prompts were built from stale context and must be
  // regenerated alongside the refreshed profile.
  const { data: existingGenerated } = await admin
    .from('discovery_prompts')
    .select('id')
    .eq('site_id', siteId)
    .eq('active', true)
    .eq('source', 'generated');
  if (!force && !shouldEnrich && existingGenerated && existingGenerated.length > 0) {
    const { data: allPrompts } = await admin
      .from('discovery_prompts')
      .select('*')
      .eq('site_id', siteId)
      .order('cluster', { ascending: true });
    return {
      profile: profile as DiscoveryProfile,
      prompts: (allPrompts || []) as DiscoveryPrompt[],
      generated: false,
    };
  }

  // Need to generate — require API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new BootstrapError('missing_api_key', 'ANTHROPIC_API_KEY not configured');
  }

  const services: string[] = Array.isArray(profile?.core_services) ? (profile!.core_services as unknown as string[]) : [];
  const profileServiceArea: string | null = (profile?.service_area as string | null) || null;
  const profileCity: string | null = (profile?.service_area_city as string | null) || serviceAreaCity;
  const profileRegion: string | null = (profile?.service_area_region as string | null) || serviceAreaRegion;
  const profileTarget: string | null = Array.isArray(profile?.target_customers) && (profile!.target_customers as unknown as string[]).length > 0
    ? (profile!.target_customers as unknown as string[])[0]
    : null;
  const locationAnchor: string | null = profileCity || profileRegion;
  const locationEnforced = !!locationAnchor;

  if (!locationEnforced) {
    console.warn(`[discoveryBootstrap] WARNING: no service_area_city or service_area_region for site ${siteId.slice(0, 8)} — local-intent enforcement disabled`);
  }

  // Validation: enforce that local-intent prompts include a real geography.
  const LOCATION_BAN_RE = /\bnear me\b|\blocally\b|\bin my area\b|\bnear my\b/i;
  const DOMAIN_BASE = domain.replace(/\.[a-z]{2,}$/i, '').toLowerCase();
  const promptReferencesDomain = (text: string): boolean => {
    const lower = text.toLowerCase();
    if (lower.includes(domain.toLowerCase())) return true;
    if (DOMAIN_BASE.length > 4 && lower.includes(DOMAIN_BASE)) return true;
    return false;
  };
  const locationRegex = locationAnchor
    ? new RegExp(locationAnchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    : null;

  const validatePrompt = (p: GeneratedPrompt): { ok: true } | { ok: false; reason: string } => {
    const text = p.prompt_text.trim();
    if (text.length < 8) return { ok: false, reason: 'too_short' };
    if (LOCATION_BAN_RE.test(text)) return { ok: false, reason: 'uses_near_me' };
    if (promptReferencesDomain(text)) return { ok: false, reason: 'references_domain' };
    // Brand cluster MUST contain the business name (not the domain).
    if (p.cluster === 'brand') {
      if (!new RegExp(businessName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text)) {
        return { ok: false, reason: 'brand_missing_name' };
      }
    }
    // Local clusters must contain location when we have an anchor.
    if (locationEnforced && locationRegex) {
      if (['core', 'problem', 'comparison', 'long_tail'].includes(p.cluster)) {
        const alt = locationAnchor && locationAnchor !== profileCity && profileRegion
          ? new RegExp(profileRegion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
          : null;
        if (!locationRegex.test(text) && !(alt && alt.test(text))) {
          return { ok: false, reason: 'missing_location' };
        }
      }
    }
    return { ok: true };
  };

  // Claude tool schema for prompt generation.
  const RECORD_PROMPTS_TOOL = {
    name: 'record_prompts',
    description: 'Record the generated prompt library. Call EXACTLY ONCE with the full array.',
    input_schema: {
      type: 'object',
      required: ['prompts'],
      properties: {
        prompts: {
          type: 'array',
          items: {
            type: 'object',
            required: ['prompt_text', 'cluster', 'priority', 'service_line_tag', 'rationale'],
            properties: {
              prompt_text: { type: 'string', description: 'The real-buyer question. Must follow the rules in the system prompt.' },
              cluster: { type: 'string', enum: VALID_CLUSTERS as unknown as string[] },
              priority: { type: 'string', enum: VALID_PRIORITIES as unknown as string[] },
              service_line_tag: { type: ['string', 'null'], description: 'Service line this prompt relates to, if any.' },
              rationale: { type: 'string', description: 'One short sentence on why this prompt matters.' },
            },
          },
        },
      },
    },
  };

  const distLines = VALID_CLUSTERS.map(c => {
    const t = clusterDistributionTargets[c];
    return `  - ${c}: ${t.min}-${t.max} prompts`;
  }).join('\n');

  const locationLine = locationAnchor
    ? `- Primary service location (REQUIRED in every core/problem/comparison/long_tail prompt): "${locationAnchor}"${profileRegion && profileRegion !== locationAnchor ? ` (you may substitute "${profileRegion}" when phrasing naturally)` : ''}`
    : `- Service location unknown — skip location enforcement, but keep prompts commercial and concrete`;

  const categoryForExamples = (primaryCategory || vertical || 'local_service').replace(/_/g, ' ');
  const exampleCity = locationAnchor || '[city]';

  const buildSystemPrompt = (focusCluster?: DiscoveryCluster): string => `You are generating a realistic buyer-intent AI-query library to test a specific local business's AI discoverability. A downstream tester will run each prompt through an AI assistant with web search — the prompts need to be things REAL BUYERS actually type.

Business:
- Name: ${businessName}
- Category: ${primaryCategory || vertical || '(unknown)'}
${locationLine}
- Region: ${profileRegion || '(unknown)'}
- Service-area summary: ${profileServiceArea || '(unknown)'}
- Target customer: ${profileTarget || 'both'}
- Core services: ${services.length > 0 ? services.join(', ') : '(unknown)'}
- Description: ${description || homepage?.h1_text || '(none)'}

${focusCluster ? `⚠ FOCUSED RE-REQUEST: generate ONLY prompts for the '${focusCluster}' cluster this time. Minimum ${clusterDistributionTargets[focusCluster].min}, maximum ${clusterDistributionTargets[focusCluster].max}. Strictly follow every rule below.` : `Distribution across six clusters (total ~20-28):\n${distLines}`}

ABSOLUTE RULES — any prompt violating these will be rejected:
1. NEVER reference the domain name ("${domain}" or "${DOMAIN_BASE}") in any prompt text. Use the business name instead.
2. NEVER use "near me", "locally", "in my area", or any vague geography substitute.
3. NEVER ask about specific pricing that can't be verified ("free estimates?", "cheapest X?").
4. NEVER produce generic educational / how-to prompts ("do companies offer...", "what is...", "how do I choose..."). Every prompt is a commercial-intent real buyer question.
${locationEnforced ? `5. Prompts in the 'core', 'problem', 'comparison', and 'long_tail' clusters MUST include "${locationAnchor}" (or "${profileRegion}" where it reads naturally). This is non-negotiable.` : '5. (Location enforcement disabled — service area unknown.)'}
6. 'brand' cluster prompts MUST include the business name "${businessName}" verbatim (not the domain).
7. 'adjacent' cluster prompts cover related services the business MIGHT plausibly offer but doesn't clearly advertise, using the core services as a starting point.
8. No duplicates. No near-duplicates.

CLUSTER GUIDANCE with examples for this business:
- core: direct commercial intent like "best ${categoryForExamples} in ${exampleCity}" or "emergency ${categoryForExamples} ${exampleCity}".
- problem: problem-first queries like "${services[0] ? services[0] + ' not working' : 'urgent ' + categoryForExamples + ' problem'} ${exampleCity}".
- comparison: "best ${categoryForExamples} in ${exampleCity} for small businesses" or "top-rated ${categoryForExamples} ${profileRegion || exampleCity}".
- long_tail: specific service detail like "${services[1] || services[0] || categoryForExamples} installation cost ${exampleCity}" or "who does weekend ${categoryForExamples} service in ${exampleCity}".
- brand: "${businessName} reviews", "is ${businessName} good for residential ${categoryForExamples}", "${businessName} service areas".
- adjacent: related services the business could reasonably serve.

Priorities: 'high' for strongest commercial intent (someone ready to buy), 'medium' for secondary discovery, 'low' for long-tail/adjacent.

You MUST call record_prompts exactly once with the full array. Do not respond in plain text.`;

  interface GeneratedPromptsResponse {
    prompts: GeneratedPrompt[];
  }

  async function callClaudeForPrompts(systemPrompt: string): Promise<GeneratedPrompt[]> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey!, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 3500,
        temperature: 0.4,
        system: systemPrompt,
        tools: [RECORD_PROMPTS_TOOL],
        tool_choice: { type: 'tool', name: 'record_prompts' },
        messages: [{ role: 'user', content: 'Generate the prompt library now.' }],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('[discoveryBootstrap] Claude API error:', { status: res.status, body: body.slice(0, 300) });
      throw new BootstrapError('claude_failed', 'Prompt generation failed');
    }
    const data = await res.json();
    let toolInput: Record<string, unknown> | null = null;
    if (Array.isArray(data.content)) {
      for (const block of data.content) {
        if (block?.type === 'tool_use' && block.name === 'record_prompts' && block.input && typeof block.input === 'object') {
          toolInput = block.input as Record<string, unknown>;
          break;
        }
      }
    }
    if (!toolInput) {
      throw new BootstrapError('claude_parse_failed', 'Prompt generation did not emit record_prompts');
    }
    // Bridge through unknown before narrowing to a typed shape — direct
    // Record<string, unknown> → GeneratedPromptsResponse fails TS strict.
    const toolInputShape = (toolInput as unknown) as GeneratedPromptsResponse;
    const arr: unknown[] = Array.isArray(toolInputShape?.prompts) ? toolInputShape.prompts : [];
    const normalized: GeneratedPrompt[] = [];
    for (const raw of arr) {
      const r = raw as Record<string, unknown>;
      const promptText = typeof r.prompt_text === 'string' ? r.prompt_text.trim() : '';
      const cluster = String(r.cluster || '') as DiscoveryCluster;
      if (!promptText || !VALID_CLUSTERS.includes(cluster)) continue;
      const priority: DiscoveryPriority = VALID_PRIORITIES.includes(r.priority as DiscoveryPriority)
        ? (r.priority as DiscoveryPriority)
        : 'medium';
      normalized.push({
        prompt_text: promptText,
        cluster,
        priority,
        service_line_tag: typeof r.service_line_tag === 'string' && r.service_line_tag.trim().length > 0 ? r.service_line_tag.trim() : null,
        rationale: typeof r.rationale === 'string' ? r.rationale.trim() : '',
      });
    }
    return normalized;
  }

  // Turn 1: full generation.
  let rawPrompts: GeneratedPrompt[] = await callClaudeForPrompts(buildSystemPrompt());

  // Dedupe + validate
  const acceptPrompts = (inputList: GeneratedPrompt[], existing: Set<string>): GeneratedPrompt[] => {
    const kept: GeneratedPrompt[] = [];
    for (const p of inputList) {
      const key = p.prompt_text.toLowerCase();
      if (existing.has(key)) continue;
      const v = validatePrompt(p);
      if (!v.ok) continue;
      existing.add(key);
      kept.push(p);
    }
    return kept;
  };

  const seen = new Set<string>();
  const accepted = acceptPrompts(rawPrompts, seen);

  // Cap per-cluster at max
  const perClusterCount: Record<DiscoveryCluster, number> = {
    core: 0, problem: 0, comparison: 0, long_tail: 0, brand: 0, adjacent: 0,
  };
  const finalPrompts: GeneratedPrompt[] = [];
  for (const p of accepted) {
    const max = clusterDistributionTargets[p.cluster].max;
    if (perClusterCount[p.cluster] >= max) continue;
    perClusterCount[p.cluster]++;
    finalPrompts.push(p);
  }

  // Cluster re-request loop: any cluster under its min gets up to 2 focused retries.
  let regenerationsUsed = 0;
  const MAX_REGENERATIONS = 2;
  for (const cluster of VALID_CLUSTERS) {
    while (perClusterCount[cluster] < clusterDistributionTargets[cluster].min && regenerationsUsed < MAX_REGENERATIONS) {
      regenerationsUsed++;
      console.log(`[discoveryBootstrap] cluster '${cluster}' below min (${perClusterCount[cluster]}/${clusterDistributionTargets[cluster].min}) — focused regeneration ${regenerationsUsed}/${MAX_REGENERATIONS}`);
      try {
        rawPrompts = await callClaudeForPrompts(buildSystemPrompt(cluster));
      } catch (err) {
        console.warn('[discoveryBootstrap] focused regeneration failed:', err instanceof Error ? err.message : err);
        break;
      }
      const extra = acceptPrompts(rawPrompts.filter(p => p.cluster === cluster), seen);
      for (const p of extra) {
        const max = clusterDistributionTargets[p.cluster].max;
        if (perClusterCount[p.cluster] >= max) continue;
        perClusterCount[p.cluster]++;
        finalPrompts.push(p);
      }
      if (extra.length === 0) break; // Claude didn't add anything useful; don't loop
    }
  }

  console.log(
    `[discoveryBootstrap] prompts generated site=${siteId.slice(0, 8)}`,
    `total=${finalPrompts.length}`,
    `by_cluster=${VALID_CLUSTERS.map(c => `${c}:${perClusterCount[c]}`).join(' ')}`,
    `location_enforced=${locationEnforced}`,
  );

  if (finalPrompts.length === 0) {
    throw new BootstrapError('no_prompts_generated', 'No valid prompts generated');
  }

  // On force OR stale-profile re-enrichment, soft-delete existing generated
  // prompts (preserve custom/edited). Stale-driven regeneration is the common
  // case after the 7.6 enrichment rollout.
  if (force || shouldEnrich) {
    await admin
      .from('discovery_prompts')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('site_id', siteId)
      .eq('source', 'generated')
      .eq('active', true);
  }

  const insertRows = finalPrompts.map(p => ({
    site_id: siteId,
    prompt_text: p.prompt_text,
    cluster: p.cluster,
    priority: p.priority,
    service_line_tag: p.service_line_tag,
    notes: p.rationale || null,
    source: 'generated' as const,
    active: true,
  }));

  const { error: insertErr } = await admin.from('discovery_prompts').insert(insertRows);
  if (insertErr) {
    console.error('[discoveryBootstrap] insert error:', insertErr.message);
    throw new BootstrapError('prompt_insert_failed', 'Failed to save generated prompts');
  }

  const { data: allPrompts } = await admin
    .from('discovery_prompts')
    .select('*')
    .eq('site_id', siteId)
    .order('cluster', { ascending: true });

  return {
    profile: profile as DiscoveryProfile,
    prompts: (allPrompts || []) as DiscoveryPrompt[],
    generated: true,
  };
}
