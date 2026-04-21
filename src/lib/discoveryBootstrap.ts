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

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { clusterDistributionTargets } from '@/lib/discovery';
import { isBadBusinessName, formatDomainAsName } from '@/lib/scanner';
import { inferBusinessNameFromDomain } from '@/lib/classify';
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

  // Derive business name with defensive fallbacks. Scrapers hit interstitials
  // (Cloudflare "Just a moment…", captchas, 403s) and return garbage titles.
  // Order of preference:
  //   1. Clean homepage title (scraped, split on separators)
  //   2. Claude's inference from the bare domain (handles expansion like
  //      "candcair" → "C&C Air")
  //   3. Formatted-domain fallback ("candcair.com" → "Candcair")
  const domain = site.domain as string;
  const rawTitleName = (homepage?.title || '').split(/[—|\-·]/)[0].trim();
  let businessName = rawTitleName;
  if (isBadBusinessName(businessName)) {
    const inferred = await inferBusinessNameFromDomain(domain);
    if (inferred && !isBadBusinessName(inferred)) {
      businessName = inferred;
    } else {
      businessName = formatDomainAsName(domain) || domain;
    }
  }
  // Final sanity check — never persist a garbage name
  if (isBadBusinessName(businessName)) {
    businessName = formatDomainAsName(domain) || domain;
  }
  const vertical = (site.vertical as string | null) || 'other';
  const description = homepage?.meta_description || null;
  const h1 = homepage?.h1_text || null;
  const businessModel = inferBusinessModel(vertical);

  // Seed or update profile
  const { data: existingProfile } = await admin
    .from('discovery_profiles')
    .select('*')
    .eq('site_id', siteId)
    .maybeSingle();

  let profile = existingProfile as DiscoveryProfile | null;
  if (!profile) {
    const { data: inserted, error: insErr } = await admin
      .from('discovery_profiles')
      .insert({
        site_id: siteId,
        business_name: businessName,
        domain,
        primary_category: vertical,
        service_area: null,
        description,
        business_model: businessModel,
      })
      .select()
      .single();
    if (insErr) {
      console.error('[discoveryBootstrap] profile insert error:', insErr.message);
      throw new BootstrapError('profile_insert_failed', 'Failed to create discovery profile');
    }
    profile = inserted as DiscoveryProfile;
  } else if (force) {
    const { data: updated, error: updErr } = await admin
      .from('discovery_profiles')
      .update({
        business_name: businessName,
        domain,
        primary_category: vertical,
        description,
        business_model: businessModel,
        updated_at: new Date().toISOString(),
      })
      .eq('site_id', siteId)
      .select()
      .single();
    if (updErr) {
      console.error('[discoveryBootstrap] profile update error:', updErr.message);
    } else {
      profile = updated as DiscoveryProfile;
    }
  }

  // If existing active generated prompts and NOT force — return as-is
  const { data: existingGenerated } = await admin
    .from('discovery_prompts')
    .select('id')
    .eq('site_id', siteId)
    .eq('active', true)
    .eq('source', 'generated');
  if (!force && existingGenerated && existingGenerated.length > 0) {
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
  const serviceArea: string | null = (profile?.service_area as string | null) || null;
  const distLines = VALID_CLUSTERS.map(c => {
    const t = clusterDistributionTargets[c];
    return `  - ${c}: ${t.min}-${t.max} prompts`;
  }).join('\n');

  const systemPrompt = `You are generating an AI discovery prompt library for a business. These are the prompts a real buyer might type into ChatGPT, Claude, or Perplexity when researching products or services in this category.

Business:
- Name: ${businessName}
- Domain: ${domain}
- Category / vertical: ${vertical}${businessModel ? ` (${businessModel})` : ''}
- Service area: ${serviceArea || 'not specified'}
- Description: ${description || h1 || 'not specified'}
- Core services: ${services.length > 0 ? services.join(', ') : 'unknown'}

Generate roughly 18-28 prompts total across six clusters with this distribution:
${distLines}

Requirements:
- Phrase every prompt as a natural AI question a real buyer would type. No keyword-stuffed phrases.
- Prioritize commercial / buying intent over purely informational.
- For 'brand' cluster, include "${businessName}" (or the domain) in the prompt text.
- For 'comparison' cluster, frame with "vs", "best", "alternatives", or name real competitor types.
- For 'core' cluster, write the direct "I want to buy / find / hire X" style.
- For 'problem' cluster, write problem-first questions that a solution-seeker would ask before they know product names.
- For 'long_tail' cluster, get specific: service-line detail, feature detail, niche use cases.
- For 'adjacent' cluster, cover related needs this business could plausibly serve.
${businessModel === 'local_service' ? '- Mix local intent ("near me", city names if service area is known) and general discovery intent.' : ''}
- No duplicates. No near-duplicates. No generic filler.
- Assign priority: 'high' for prompts with strongest commercial intent, 'medium' for secondary discovery, 'low' for longer-tail or adjacent.
- service_line_tag: if the prompt relates to a specific service line, tag it; otherwise null.
- rationale: one short sentence on why this prompt matters.

Return ONLY valid JSON in this exact shape (no markdown, no backticks):
{
  "prompts": [
    { "prompt_text": "...", "cluster": "core", "priority": "high", "service_line_tag": null, "rationale": "..." }
  ]
}`;

  let claudeText = '';
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 3000, messages: [{ role: 'user', content: systemPrompt }] }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error('[discoveryBootstrap] Claude API error:', { status: res.status, body: errBody.slice(0, 300) });
      throw new BootstrapError('claude_failed', 'Prompt generation failed');
    }
    const data = await res.json();
    claudeText = data.content?.[0]?.text || '';
  } catch (err) {
    if (err instanceof BootstrapError) throw err;
    console.error('[discoveryBootstrap] Claude fetch error:', err instanceof Error ? err.message : err);
    throw new BootstrapError('claude_failed', 'Prompt generation failed');
  }

  let generatedPrompts: GeneratedPrompt[] = [];
  try {
    const cleaned = claudeText.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const arr = Array.isArray(parsed?.prompts) ? parsed.prompts : (Array.isArray(parsed) ? parsed : []);
    generatedPrompts = arr
      .map((p: Record<string, unknown>): GeneratedPrompt | null => {
        const promptText = typeof p.prompt_text === 'string' ? p.prompt_text.trim() : '';
        const cluster = String(p.cluster || '') as DiscoveryCluster;
        if (!promptText || !VALID_CLUSTERS.includes(cluster)) return null;
        const priority: DiscoveryPriority = VALID_PRIORITIES.includes(p.priority as DiscoveryPriority)
          ? (p.priority as DiscoveryPriority)
          : 'medium';
        return {
          prompt_text: promptText,
          cluster,
          priority,
          service_line_tag: typeof p.service_line_tag === 'string' && p.service_line_tag.trim().length > 0
            ? p.service_line_tag.trim()
            : null,
          rationale: typeof p.rationale === 'string' ? p.rationale.trim() : '',
        };
      })
      .filter((p: GeneratedPrompt | null): p is GeneratedPrompt => p !== null);
  } catch (err) {
    console.error('[discoveryBootstrap] parse failed:', err instanceof Error ? err.message : err);
    throw new BootstrapError('claude_parse_failed', 'Failed to parse generated prompts');
  }

  // Dedupe
  const seen = new Set<string>();
  const deduped: GeneratedPrompt[] = [];
  for (const p of generatedPrompts) {
    const key = p.prompt_text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(p);
  }

  // Cap per cluster
  const perClusterCount: Record<DiscoveryCluster, number> = {
    core: 0, problem: 0, comparison: 0, long_tail: 0, brand: 0, adjacent: 0,
  };
  const finalPrompts: GeneratedPrompt[] = [];
  for (const p of deduped) {
    const max = clusterDistributionTargets[p.cluster].max;
    if (perClusterCount[p.cluster] >= max) continue;
    perClusterCount[p.cluster]++;
    finalPrompts.push(p);
  }

  if (finalPrompts.length === 0) {
    throw new BootstrapError('no_prompts_generated', 'No valid prompts generated');
  }

  // On force, soft-delete existing generated prompts (preserve custom/edited)
  if (force) {
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
