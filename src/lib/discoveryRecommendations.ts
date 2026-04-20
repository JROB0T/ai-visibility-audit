// ============================================================
// AI Discovery — recommendations engine
//
// Pure draft() + persist/polish helpers.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { InsightSignal, InsightDetectionContext } from '@/lib/discoveryInsights';
import type {
  DiscoveryCluster,
  DiscoveryCompetitor,
  DiscoveryProfile,
  DiscoveryRecommendation,
} from '@/lib/types';

const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

export type RecommendationDraft = {
  title: string;
  description: string;
  why_it_matters: string;
  category: string;
  priority: 'high' | 'medium' | 'low';
  owner_type: 'developer' | 'marketer' | 'business_owner';
  impact_estimate: 'high' | 'medium' | 'low';
  difficulty_estimate: 'high' | 'medium' | 'low';
  suggested_timeline: string;
  linked_prompt_clusters: DiscoveryCluster[];
  linked_competitor_names: string[];
  source_signal_keys: string[];
};

const PRIORITY_RANK: Record<RecommendationDraft['priority'], number> = { high: 0, medium: 1, low: 2 };
const FULL_MAX = 12;
const TEASER_MAX = 1;

// ============================================================
// Title-based classifier — maps each InsightSignal title into drafts.
// Uses startsWith matching against the insight title so polished copy
// doesn't break detection (drafts should always be built from raw signals).
// ============================================================

function draftsForSignal(signal: InsightSignal): RecommendationDraft[] {
  const clusters: DiscoveryCluster[] = signal.linked_cluster ? [signal.linked_cluster] : [];
  const comps: string[] = signal.linked_competitor_name ? [signal.linked_competitor_name] : [];
  const sourceKeys = [signal.signal_key];

  // Weak visibility in core/problem
  if (signal.title.startsWith('Weak visibility in')) {
    if (signal.linked_cluster === 'core' || signal.linked_cluster === 'problem') {
      return [{
        title: `Build out ${signal.linked_cluster === 'core' ? 'core service' : 'problem-solving'} pages`,
        description: `Create dedicated pages that directly answer the ${signal.linked_cluster === 'core' ? 'buying-intent' : 'problem-first'} questions buyers ask in this cluster.`,
        why_it_matters: 'AI assistants pull from pages that clearly match the question. Without focused pages, they surface competitors instead.',
        category: 'service_page_creation',
        priority: 'high',
        owner_type: 'marketer',
        impact_estimate: 'high',
        difficulty_estimate: 'medium',
        suggested_timeline: '2-4 weeks',
        linked_prompt_clusters: clusters,
        linked_competitor_names: comps,
        source_signal_keys: sourceKeys,
      }];
    }
    if (signal.linked_cluster === 'long_tail') {
      // handled below by its own signal too
      return [{
        title: 'Add deeper service-detail content',
        description: 'Publish long-tail subpages covering specific service variants, pricing, timelines, and edge cases.',
        why_it_matters: 'Detailed pages let AI cite you for specific questions instead of sending readers to generic directories.',
        category: 'service_page_creation',
        priority: 'medium',
        owner_type: 'marketer',
        impact_estimate: 'medium',
        difficulty_estimate: 'medium',
        suggested_timeline: '2-4 weeks',
        linked_prompt_clusters: clusters,
        linked_competitor_names: comps,
        source_signal_keys: sourceKeys,
      }];
    }
  }

  // Absent from a large share
  if (signal.title.startsWith('Absent from a large share')) {
    return [
      {
        title: 'Make core pages more AI-readable',
        description: 'Rewrite homepage and top service pages with clear, specific answers to buyer questions in plain language.',
        why_it_matters: 'If AI can\'t extract a clean answer from your pages, it won\'t cite you.',
        category: 'ai_readable_content',
        priority: 'high',
        owner_type: 'developer',
        impact_estimate: 'high',
        difficulty_estimate: 'medium',
        suggested_timeline: '2-4 weeks',
        linked_prompt_clusters: clusters,
        linked_competitor_names: comps,
        source_signal_keys: sourceKeys,
      },
      {
        title: 'Add structured data to key pages',
        description: 'Implement JSON-LD schema (Organization, Service, LocalBusiness, FAQPage as applicable).',
        why_it_matters: 'Schema gives AI systems a machine-readable version of your pages, boosting citation likelihood.',
        category: 'schema_structured_data',
        priority: 'high',
        owner_type: 'developer',
        impact_estimate: 'high',
        difficulty_estimate: 'low',
        suggested_timeline: '1-2 weeks',
        linked_prompt_clusters: clusters,
        linked_competitor_names: comps,
        source_signal_keys: sourceKeys,
      },
    ];
  }

  // Missing on priority prompt
  if (signal.title.startsWith('Missing on priority prompt')) {
    return [{
      title: 'Create a page targeting this specific prompt',
      description: `Publish a dedicated page that directly answers the question: ${signal.title.replace(/^Missing on priority prompt: /, '')}`,
      why_it_matters: 'Prompts you\'re absent from are exact queries real buyers are asking — one focused page can flip the answer in your favor.',
      category: 'service_page_creation',
      priority: 'high',
      owner_type: 'marketer',
      impact_estimate: 'high',
      difficulty_estimate: 'medium',
      suggested_timeline: '1-2 weeks',
      linked_prompt_clusters: clusters,
      linked_competitor_names: comps,
      source_signal_keys: sourceKeys,
    }];
  }

  // Weak brand-to-category association
  if (signal.title.startsWith('Weak brand-to-category association')) {
    return [
      {
        title: 'Tighten brand-category language',
        description: 'Use consistent category language (e.g. "we are a __ in __") across homepage, About, and meta tags.',
        why_it_matters: 'AI systems build brand associations from repeated, consistent phrasing. Inconsistency weakens recognition.',
        category: 'brand_association',
        priority: 'medium',
        owner_type: 'marketer',
        impact_estimate: 'medium',
        difficulty_estimate: 'low',
        suggested_timeline: '1-2 weeks',
        linked_prompt_clusters: ['brand'],
        linked_competitor_names: comps,
        source_signal_keys: sourceKeys,
      },
      {
        title: 'Strengthen internal links between brand and category pages',
        description: 'Link from your homepage and brand pages to each core category/service page with descriptive anchor text.',
        why_it_matters: 'Internal links reinforce which categories your brand covers — both for AI and for search engines.',
        category: 'internal_linking',
        priority: 'medium',
        owner_type: 'marketer',
        impact_estimate: 'medium',
        difficulty_estimate: 'low',
        suggested_timeline: '1 week',
        linked_prompt_clusters: ['brand'],
        linked_competitor_names: comps,
        source_signal_keys: sourceKeys,
      },
    ];
  }

  // Competitor appears consistently
  if (signal.title.startsWith('Competitor ') && signal.title.includes('appears consistently where you don')) {
    return [{
      title: `Publish a direct comparison vs ${signal.linked_competitor_name ?? 'this competitor'}`,
      description: 'Create a fair side-by-side comparison covering pricing, differentiators, and fit.',
      why_it_matters: 'Comparison content is heavily cited by AI for "X vs Y" and "best X" queries.',
      category: 'comparison_content',
      priority: 'high',
      owner_type: 'marketer',
      impact_estimate: 'high',
      difficulty_estimate: 'medium',
      suggested_timeline: '2-4 weeks',
      linked_prompt_clusters: clusters,
      linked_competitor_names: comps,
      source_signal_keys: sourceKeys,
    }];
  }

  // Competitors dominate best-of comparisons
  if (signal.title.startsWith('Competitors dominate best-of comparisons')) {
    return [{
      title: 'Create best-of / comparison content for your category',
      description: 'Publish editorial-style pages covering top options in your category — include yourself honestly with differentiators.',
      why_it_matters: 'Buyers ask AI for "best X" answers. If you don\'t show up in comparisons, competitors own those answers.',
      category: 'comparison_content',
      priority: 'high',
      owner_type: 'marketer',
      impact_estimate: 'high',
      difficulty_estimate: 'medium',
      suggested_timeline: '2-4 weeks',
      linked_prompt_clusters: ['comparison'],
      linked_competitor_names: comps,
      source_signal_keys: sourceKeys,
    }];
  }

  // Directory sites are dominating
  if (signal.title.startsWith('Directory sites are dominating')) {
    return [
      {
        title: 'Build authority signals on your own site',
        description: 'Add reviews/testimonials, press mentions, and credentials to your site so AI has first-party trust data to cite.',
        why_it_matters: 'When directories are cited, it\'s because they have more trust signals than you do. Move those signals on-site.',
        category: 'authority_trust',
        priority: 'high',
        owner_type: 'developer',
        impact_estimate: 'high',
        difficulty_estimate: 'medium',
        suggested_timeline: 'this month',
        linked_prompt_clusters: clusters,
        linked_competitor_names: comps,
        source_signal_keys: sourceKeys,
      },
      {
        title: 'Add LocalBusiness / Organization schema',
        description: 'Ensure your site has structured data equivalent to what directories provide (hours, ratings, address, services).',
        why_it_matters: 'AI will prefer cleanly-structured first-party data over directory aggregations if both exist.',
        category: 'schema_structured_data',
        priority: 'high',
        owner_type: 'developer',
        impact_estimate: 'high',
        difficulty_estimate: 'low',
        suggested_timeline: 'this month',
        linked_prompt_clusters: clusters,
        linked_competitor_names: comps,
        source_signal_keys: sourceKeys,
      },
    ];
  }

  // Named but not cited
  if (signal.title.startsWith("You're named but your website isn't being cited")) {
    return [
      {
        title: 'Fix internal linking to make citation obvious',
        description: 'Ensure every page has a clear canonical URL, consistent sitewide nav, and deep links from authoritative pages.',
        why_it_matters: 'AI mentions you but cites elsewhere when your site\'s structure makes it harder to link to than third parties.',
        category: 'internal_linking',
        priority: 'medium',
        owner_type: 'developer',
        impact_estimate: 'medium',
        difficulty_estimate: 'low',
        suggested_timeline: '1-2 weeks',
        linked_prompt_clusters: clusters,
        linked_competitor_names: comps,
        source_signal_keys: sourceKeys,
      },
      {
        title: 'Clean up AI-readable content blocks',
        description: 'Add clear H1/H2 structure and concise paragraph answers near the top of each key page.',
        why_it_matters: 'AI prefers to cite pages where the answer is visible in the first 500 characters.',
        category: 'ai_readable_content',
        priority: 'medium',
        owner_type: 'developer',
        impact_estimate: 'medium',
        difficulty_estimate: 'low',
        suggested_timeline: '1-2 weeks',
        linked_prompt_clusters: clusters,
        linked_competitor_names: comps,
        source_signal_keys: sourceKeys,
      },
    ];
  }

  // Service-detail questions answered by others
  if (signal.title.startsWith('Service-detail questions are being answered by others')) {
    return [{
      title: 'Publish deeper service subpages',
      description: 'Break each service into its own page with specifics: process, pricing, timelines, edge cases.',
      why_it_matters: 'Detailed subpages let AI cite you for specific long-tail questions instead of generic overviews elsewhere.',
      category: 'service_page_creation',
      priority: 'medium',
      owner_type: 'marketer',
      impact_estimate: 'medium',
      difficulty_estimate: 'medium',
      suggested_timeline: '2-4 weeks',
      linked_prompt_clusters: ['long_tail'],
      linked_competitor_names: comps,
      source_signal_keys: sourceKeys,
    }];
  }

  // Adjacent service opportunity
  if (signal.title.startsWith('Adjacent service opportunity')) {
    return [{
      title: 'Expand coverage into an adjacent service',
      description: 'Evaluate adjacent services where competitors surface but you don\'t — consider publishing coverage if plausible.',
      why_it_matters: 'Adjacent coverage protects revenue you\'d otherwise lose to competitors buyers discover via AI.',
      category: 'product_service_descriptions',
      priority: 'low',
      owner_type: 'business_owner',
      impact_estimate: 'medium',
      difficulty_estimate: 'medium',
      suggested_timeline: 'this quarter',
      linked_prompt_clusters: ['adjacent'],
      linked_competitor_names: comps,
      source_signal_keys: sourceKeys,
    }];
  }

  // Problem-based close to breaking through
  if (signal.title.startsWith('Problem-based queries are close')) {
    return [{
      title: 'Add a focused FAQ / Q&A block to problem pages',
      description: 'Publish a short FAQ or Q&A section answering the problem-first questions buyers ask before product-specific ones.',
      why_it_matters: 'Problem-cluster prompts tip to strong visibility when the literal buyer question appears in your content.',
      category: 'faq_qa',
      priority: 'medium',
      owner_type: 'marketer',
      impact_estimate: 'medium',
      difficulty_estimate: 'low',
      suggested_timeline: 'this month',
      linked_prompt_clusters: ['problem'],
      linked_competitor_names: comps,
      source_signal_keys: sourceKeys,
    }];
  }

  // Wins never produce recommendations
  return [];
}

// ============================================================
// Dedupe / merge
// ============================================================

function mergeDrafts(drafts: RecommendationDraft[]): RecommendationDraft[] {
  const keyed = new Map<string, RecommendationDraft>();
  for (const d of drafts) {
    const clusterKey = d.linked_prompt_clusters[0] || '';
    const key = `${d.category}::${clusterKey}`;
    const existing = keyed.get(key);
    if (!existing) {
      keyed.set(key, { ...d });
      continue;
    }
    // Merge source_signal_keys
    const mergedKeys = Array.from(new Set([...existing.source_signal_keys, ...d.source_signal_keys]));
    // Take max priority
    const priority = PRIORITY_RANK[d.priority] < PRIORITY_RANK[existing.priority] ? d.priority : existing.priority;
    // Merge competitor names
    const mergedComps = Array.from(new Set([...existing.linked_competitor_names, ...d.linked_competitor_names]));
    keyed.set(key, { ...existing, priority, source_signal_keys: mergedKeys, linked_competitor_names: mergedComps });
  }
  return Array.from(keyed.values());
}

// ============================================================
// Public: draftRecommendations
// ============================================================

export function draftRecommendations(
  signals: InsightSignal[],
  ctx: InsightDetectionContext,
): RecommendationDraft[] {
  // Skip win signals entirely
  const actionable = signals.filter(s => s.category !== 'wins');
  const raw: RecommendationDraft[] = [];
  for (const s of actionable) {
    raw.push(...draftsForSignal(s));
  }
  const merged = mergeDrafts(raw);

  // Sort by priority (high → low), then by number of source signals (more = higher)
  merged.sort((a, b) => {
    const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (p !== 0) return p;
    return b.source_signal_keys.length - a.source_signal_keys.length;
  });

  if (ctx.tier === 'teaser') {
    return merged.slice(0, TEASER_MAX);
  }
  return merged.slice(0, FULL_MAX);
}

// ============================================================
// Persist
// ============================================================

export async function persistRecommendations(
  serviceRoleClient: SupabaseClient,
  siteId: string,
  runId: string,
  drafts: RecommendationDraft[],
  competitors: DiscoveryCompetitor[],
): Promise<DiscoveryRecommendation[]> {
  await serviceRoleClient
    .from('discovery_recommendations')
    .delete()
    .eq('site_id', siteId)
    .eq('run_id', runId);

  if (drafts.length === 0) return [];

  const compByName = new Map<string, string>();
  for (const c of competitors) {
    if (c.name) compByName.set(c.name.toLowerCase(), c.id);
  }

  const rows = drafts.map(d => {
    const linkedIds = d.linked_competitor_names
      .map(n => compByName.get(n.toLowerCase()))
      .filter((x): x is string => typeof x === 'string');
    return {
      site_id: siteId,
      run_id: runId,
      title: d.title,
      description: d.description,
      why_it_matters: d.why_it_matters,
      category: d.category,
      priority: d.priority,
      owner_type: d.owner_type,
      impact_estimate: d.impact_estimate,
      difficulty_estimate: d.difficulty_estimate,
      suggested_timeline: d.suggested_timeline,
      linked_prompt_clusters: d.linked_prompt_clusters,
      linked_competitor_ids: linkedIds,
      edited_by_admin: false,
    };
  });

  const { data, error } = await serviceRoleClient
    .from('discovery_recommendations')
    .insert(rows)
    .select();
  if (error) {
    console.error('[persistRecommendations] insert error:', error.message);
    throw new Error(`Failed to insert recommendations: ${error.message}`);
  }
  return (data || []) as DiscoveryRecommendation[];
}

// ============================================================
// Claude polish
// ============================================================

export async function polishRecommendationsWithClaude(
  drafts: RecommendationDraft[],
  profile: DiscoveryProfile,
  options?: { timeoutMs?: number },
): Promise<RecommendationDraft[]> {
  if (drafts.length === 0) return drafts;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return drafts;

  const timeoutMs = options?.timeoutMs ?? 8000;
  const businessName = profile.business_name || profile.domain || 'this business';

  const systemPrompt = `You are rewriting AI-visibility recommendation titles, descriptions, and why_it_matters fields in a premium, consultative tone for a business owner. Keep them specific, grounded, and non-technical. Do not add hype. Do not invent new facts. Preserve the exact number of items and their order.

Business: ${businessName}

You will receive a JSON array of recommendations. For each item, rewrite "title", "description", and "why_it_matters" only. Return a JSON array of the same length, preserving every other field EXACTLY (category, priority, owner_type, impact_estimate, difficulty_estimate, suggested_timeline, linked_prompt_clusters, linked_competitor_names, source_signal_keys).

Return ONLY the JSON array — no markdown fences, no commentary.`;

  const userPrompt = JSON.stringify(drafts);

  const callClaude = async (): Promise<RecommendationDraft[]> => {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 2500,
        temperature: 0.3,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    if (!res.ok) throw new Error(`Claude ${res.status}`);
    const data = await res.json();
    const text = Array.isArray(data.content)
      ? data.content.filter((b: { type?: string }) => b?.type === 'text').map((b: { text?: string }) => b.text || '').join('\n')
      : '';
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed) || parsed.length !== drafts.length) {
      throw new Error('Claude response shape mismatch');
    }
    return drafts.map((original, i) => {
      const polished = parsed[i] as Record<string, unknown>;
      const newTitle = typeof polished.title === 'string' && polished.title.trim().length > 0 ? polished.title.trim() : original.title;
      const newDesc = typeof polished.description === 'string' && polished.description.trim().length > 0 ? polished.description.trim() : original.description;
      const newWhy = typeof polished.why_it_matters === 'string' && polished.why_it_matters.trim().length > 0 ? polished.why_it_matters.trim() : original.why_it_matters;
      return { ...original, title: newTitle, description: newDesc, why_it_matters: newWhy };
    });
  };

  try {
    const timeoutPromise = new Promise<RecommendationDraft[]>((_, reject) => {
      setTimeout(() => reject(new Error('polish timeout')), timeoutMs);
    });
    return await Promise.race([callClaude(), timeoutPromise]);
  } catch (err) {
    console.warn('[polishRecommendationsWithClaude] fallback to drafts:', err instanceof Error ? err.message : err);
    return drafts;
  }
}

