// ============================================================
// AI Discovery — insights engine
//
// Deterministic pattern detection on a run's results. Claude is used
// only as an optional polisher (see polishInsightsWithClaude).
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { clusterLabel } from '@/lib/discovery';
import { claudeFetchWithRetry } from '@/lib/claudeRetry';
import { clusterDistribution, visibilityDistribution } from '@/lib/discoveryScoring';
import type {
  DiscoveryCluster,
  DiscoveryCompetitor,
  DiscoveryInsight,
  DiscoveryProfile,
  DiscoveryResult,
  DiscoveryTier,
} from '@/lib/types';

const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

export type InsightSignal = {
  category: 'wins' | 'gaps' | 'competitor_advantages' | 'content_issues' | 'opportunities';
  title: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  linked_cluster?: DiscoveryCluster;
  linked_competitor_id?: string;
  linked_competitor_name?: string;
  signal_key: string;
};

export type InsightDetectionContext = {
  results: DiscoveryResult[];
  competitors: DiscoveryCompetitor[];
  profile: DiscoveryProfile;
  tier: DiscoveryTier;
};

const SEVERITY_RANK: Record<InsightSignal['severity'], number> = { high: 0, medium: 1, low: 2 };
const CATEGORY_RANK_NEGATIVE: InsightSignal['category'][] = ['gaps', 'competitor_advantages', 'content_issues', 'opportunities', 'wins'];

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + '…';
}

function active(results: DiscoveryResult[]): DiscoveryResult[] {
  return results.filter(r => !r.suppressed);
}

// ============================================================
// Detection
// ============================================================

export function detectInsightSignals(ctx: InsightDetectionContext): InsightSignal[] {
  const results = active(ctx.results);
  const signals: InsightSignal[] = [];

  if (results.length === 0) {
    return signals;
  }

  const distribution = clusterDistribution(results);
  const visibility = visibilityDistribution(results);
  const total = results.length;

  // WINS -------------------------------------------------------
  for (const row of distribution) {
    if (row.count >= 3 && row.avgScore !== null && row.avgScore >= 80) {
      signals.push({
        category: 'wins',
        title: `Strong visibility in ${clusterLabel(row.cluster)}`,
        description: `Your site is performing well on ${row.count} prompts in this cluster with an average score of ${row.avgScore}.`,
        severity: 'medium',
        linked_cluster: row.cluster,
        signal_key: `win:cluster_strong:${row.cluster}`,
      });
    }
  }

  // Top individual prompts
  const topResults = results
    .filter(r => (r.prompt_score ?? 0) >= 90 && r.visibility_status === 'strong_presence')
    .sort((a, b) => (b.prompt_score ?? 0) - (a.prompt_score ?? 0))
    .slice(0, 3);
  for (const r of topResults) {
    signals.push({
      category: 'wins',
      title: `You're the top recommendation for "${truncate(r.prompt_text, 60)}"`,
      description: `AI answers to this prompt surface your business prominently.`,
      severity: 'low',
      linked_cluster: r.prompt_cluster ?? undefined,
      signal_key: `win:top_prompt:${r.id}`,
    });
  }

  const citedCount = results.filter(r => r.business_cited).length;
  if (citedCount / total >= 0.4) {
    signals.push({
      category: 'wins',
      title: 'Your domain is being cited directly in AI answers',
      description: `${Math.round((citedCount / total) * 100)}% of tested prompts cite your website directly — a strong trust signal.`,
      severity: 'medium',
      signal_key: 'win:citation_rate_high',
    });
  }

  // GAPS -------------------------------------------------------
  for (const row of distribution) {
    if (row.count >= 3 && row.avgScore !== null && row.avgScore < 40) {
      const severity: InsightSignal['severity'] = (row.cluster === 'core' || row.cluster === 'problem') ? 'high' : 'medium';
      signals.push({
        category: 'gaps',
        title: `Weak visibility in ${clusterLabel(row.cluster)}`,
        description: `Average score is ${row.avgScore} across ${row.count} tested prompts — this cluster needs attention.`,
        severity,
        linked_cluster: row.cluster,
        signal_key: `gap:cluster_weak:${row.cluster}`,
      });
    }
  }

  if (visibility.absent / total > 0.4) {
    signals.push({
      category: 'gaps',
      title: 'Absent from a large share of tested prompts',
      description: `Your business was not mentioned in ${visibility.absent} of ${total} prompts (${Math.round((visibility.absent / total) * 100)}%).`,
      severity: 'high',
      signal_key: 'gap:absent_rate_high',
    });
  }

  const missedHighPriority = results
    .filter(r => ['absent', 'competitor_dominant', 'directory_dominant'].includes(r.visibility_status ?? ''))
    .slice(0, 5);
  for (const r of missedHighPriority) {
    signals.push({
      category: 'gaps',
      title: `Missing on priority prompt: "${truncate(r.prompt_text, 60)}"`,
      description: `This prompt returned ${r.visibility_status?.replace(/_/g, ' ')} — your business did not appear.`,
      severity: 'high',
      linked_cluster: r.prompt_cluster ?? undefined,
      signal_key: `gap:priority_miss:${r.id}`,
    });
  }

  const brandRow = distribution.find(d => d.cluster === 'brand');
  if (brandRow && brandRow.count >= 2 && brandRow.avgScore !== null && brandRow.avgScore < 60) {
    signals.push({
      category: 'gaps',
      title: 'Weak brand-to-category association',
      description: `Brand-cluster prompts average ${brandRow.avgScore}. AI systems aren't confidently associating your name with your category.`,
      severity: 'medium',
      linked_cluster: 'brand',
      signal_key: 'gap:brand_weak',
    });
  }

  // COMPETITOR_ADVANTAGES --------------------------------------
  for (const comp of ctx.competitors) {
    const compNameLower = (comp.name || '').toLowerCase();
    const compDomainLower = (comp.domain || '').toLowerCase();
    if (!compNameLower && !compDomainLower) continue;
    let count = 0;
    for (const r of results) {
      const names = (r.competitor_names_detected || []).map(s => s.toLowerCase());
      const domains = (r.competitor_domains_detected || []).map(s => s.toLowerCase());
      const compPresent = names.includes(compNameLower) || (compDomainLower && domains.includes(compDomainLower));
      if (compPresent && !r.business_mentioned) count++;
    }
    if (count >= 3) {
      signals.push({
        category: 'competitor_advantages',
        title: `Competitor ${comp.name} appears consistently where you don't`,
        description: `${comp.name} surfaced in ${count} prompts where your business was absent.`,
        severity: count >= 5 ? 'high' : 'medium',
        linked_competitor_id: comp.id,
        linked_competitor_name: comp.name,
        signal_key: `comp_adv:dominant:${comp.id}`,
      });
    }
  }

  const comparisonResults = results.filter(r => r.prompt_cluster === 'comparison');
  if (comparisonResults.length >= 3) {
    const compMentionRate = comparisonResults.filter(r => r.competitor_mentioned).length / comparisonResults.length;
    const bizMentionRate = comparisonResults.filter(r => r.business_mentioned).length / comparisonResults.length;
    if (compMentionRate > 0.5 && bizMentionRate < 0.3) {
      signals.push({
        category: 'competitor_advantages',
        title: 'Competitors dominate best-of comparisons',
        description: `In ${Math.round(compMentionRate * 100)}% of comparison prompts a competitor appears — and your business only appears in ${Math.round(bizMentionRate * 100)}%.`,
        severity: 'high',
        linked_cluster: 'comparison',
        signal_key: 'comp_adv:comparison_dominant',
      });
    }
  }

  // CONTENT_ISSUES ---------------------------------------------
  if (visibility.directory_dominant >= 3) {
    signals.push({
      category: 'content_issues',
      title: 'Directory sites are dominating answers',
      description: `${visibility.directory_dominant} prompts returned directory-heavy answers. Directories are filling the gap left by your site.`,
      severity: 'high',
      signal_key: 'content:directory_dominance',
    });
  }

  const mentionedNotCited = results.filter(r => r.business_mentioned && !r.business_cited).length;
  if (mentionedNotCited >= 3) {
    signals.push({
      category: 'content_issues',
      title: "You're named but your website isn't being cited",
      description: `${mentionedNotCited} prompts mention your business without linking to your site — AI isn't routing readers to you.`,
      severity: 'medium',
      signal_key: 'content:mentioned_not_cited',
    });
  }

  const longTailRow = distribution.find(d => d.cluster === 'long_tail');
  if (longTailRow && longTailRow.count >= 3 && longTailRow.avgScore !== null && longTailRow.avgScore < 40) {
    signals.push({
      category: 'content_issues',
      title: 'Service-detail questions are being answered by others',
      description: `Long-tail prompts average ${longTailRow.avgScore}. Deeper content on your site would close this gap.`,
      severity: 'medium',
      linked_cluster: 'long_tail',
      signal_key: 'content:long_tail_weak',
    });
  }

  // OPPORTUNITIES ----------------------------------------------
  const adjacentOpportunity = results.some(r =>
    r.prompt_cluster === 'adjacent' && r.competitor_mentioned && !r.business_mentioned,
  );
  if (adjacentOpportunity) {
    signals.push({
      category: 'opportunities',
      title: 'Adjacent service opportunity where competitors appear',
      description: 'Competitors are surfacing for adjacent services you could plausibly offer. Consider expanding coverage.',
      severity: 'medium',
      linked_cluster: 'adjacent',
      signal_key: 'opp:adjacent',
    });
  }

  const problemRow = distribution.find(d => d.cluster === 'problem');
  if (problemRow && problemRow.count >= 3 && problemRow.avgScore !== null && problemRow.avgScore >= 40 && problemRow.avgScore <= 70) {
    signals.push({
      category: 'opportunities',
      title: 'Problem-based queries are close to breaking through',
      description: `Problem-cluster prompts average ${problemRow.avgScore}. Targeted FAQ/problem-solving content could tip these into strong visibility.`,
      severity: 'low',
      linked_cluster: 'problem',
      signal_key: 'opp:problem_close',
    });
  }

  // TEASER TRIM ------------------------------------------------
  if (ctx.tier === 'teaser') {
    const negative = signals.filter(s => s.category !== 'wins');
    const source = negative.length > 0 ? negative : signals;
    const ranked = source.slice().sort((a, b) => {
      const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (sev !== 0) return sev;
      const ca = CATEGORY_RANK_NEGATIVE.indexOf(a.category);
      const cb = CATEGORY_RANK_NEGATIVE.indexOf(b.category);
      return ca - cb;
    });
    const trimmed = ranked.slice(0, 2);
    if (trimmed.length === 0) {
      // Fallback synthetic win
      return [{
        category: 'wins',
        title: 'Your AI discovery presence is strong across tested prompts',
        description: 'No significant gaps surfaced in the teaser sample. Run a full test for deeper analysis.',
        severity: 'low',
        signal_key: 'win:teaser_clean',
      }];
    }
    return trimmed;
  }

  return signals;
}

// ============================================================
// Persist
// ============================================================

export async function persistInsights(
  serviceRoleClient: SupabaseClient,
  siteId: string,
  runId: string,
  signals: InsightSignal[],
  competitors: DiscoveryCompetitor[],
): Promise<DiscoveryInsight[]> {
  // Dedupe in memory by signal_key
  const seen = new Set<string>();
  const unique: InsightSignal[] = [];
  for (const s of signals) {
    if (seen.has(s.signal_key)) continue;
    seen.add(s.signal_key);
    unique.push(s);
  }

  // Delete existing for (site_id, run_id)
  await serviceRoleClient
    .from('discovery_insights')
    .delete()
    .eq('site_id', siteId)
    .eq('run_id', runId);

  if (unique.length === 0) return [];

  const compByName = new Map<string, string>();
  for (const c of competitors) {
    if (c.name) compByName.set(c.name.toLowerCase(), c.id);
  }

  const rows = unique.map(s => {
    const linkedId = s.linked_competitor_id
      ?? (s.linked_competitor_name ? compByName.get(s.linked_competitor_name.toLowerCase()) : undefined)
      ?? null;
    return {
      site_id: siteId,
      run_id: runId,
      category: s.category,
      title: s.title,
      description: s.description,
      severity: s.severity,
      linked_cluster: s.linked_cluster ?? null,
      linked_competitor_id: linkedId,
    };
  });

  const { data, error } = await serviceRoleClient
    .from('discovery_insights')
    .insert(rows)
    .select();
  if (error) {
    console.error('[persistInsights] insert error:', error.message);
    throw new Error(`Failed to insert insights: ${error.message}`);
  }
  return (data || []) as DiscoveryInsight[];
}

// ============================================================
// Claude polish
// ============================================================

export async function polishInsightsWithClaude(
  signals: InsightSignal[],
  profile: DiscoveryProfile,
  options?: { timeoutMs?: number },
): Promise<InsightSignal[]> {
  if (signals.length === 0) return signals;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return signals;

  const timeoutMs = options?.timeoutMs ?? 8000;
  const businessName = profile.business_name || profile.domain || 'this business';

  const systemPrompt = `You are rewriting AI-visibility insight titles and descriptions in a premium, consultative tone for a business owner. Keep them specific, grounded, and non-technical. Do not add hype. Do not invent new facts. Preserve the exact number of items and their order.

Business: ${businessName}

You will receive a JSON array of insights. For each item, rewrite "title" and "description" only. Return a JSON array of the same length, preserving every other field EXACTLY (category, severity, signal_key, linked_cluster, linked_competitor_name, linked_competitor_id).

Return ONLY the JSON array — no markdown fences, no commentary.`;

  const userPrompt = JSON.stringify(signals);

  const callClaude = async (): Promise<InsightSignal[]> => {
    const res = await claudeFetchWithRetry(
      () => fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 1500,
          temperature: 0.3,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      }),
      { label: 'polishInsightsWithClaude' },
    );
    if (!res.ok) throw new Error(`Claude ${res.status}`);
    const data = await res.json();
    const text = Array.isArray(data.content)
      ? data.content.filter((b: { type?: string }) => b?.type === 'text').map((b: { text?: string }) => b.text || '').join('\n')
      : '';
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed) || parsed.length !== signals.length) {
      throw new Error('Claude response shape mismatch');
    }
    return signals.map((original, i) => {
      const polished = parsed[i] as Record<string, unknown>;
      const newTitle = typeof polished.title === 'string' && polished.title.trim().length > 0 ? polished.title.trim() : original.title;
      const newDesc = typeof polished.description === 'string' && polished.description.trim().length > 0 ? polished.description.trim() : original.description;
      return { ...original, title: newTitle, description: newDesc };
    });
  };

  try {
    const timeoutPromise = new Promise<InsightSignal[]>((_, reject) => {
      setTimeout(() => reject(new Error('polish timeout')), timeoutMs);
    });
    return await Promise.race([callClaude(), timeoutPromise]);
  } catch (err) {
    console.warn('[polishInsightsWithClaude] fallback to drafts:', err instanceof Error ? err.message : err);
    return signals;
  }
}
