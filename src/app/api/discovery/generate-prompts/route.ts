import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';
import { isAdminAccount } from '@/lib/entitlements';
import { clusterDistributionTargets } from '@/lib/discovery';
import type { DiscoveryCluster, DiscoveryPriority, DiscoveryBusinessModel } from '@/lib/types';

export const maxDuration = 60;

const VALID_CLUSTERS: DiscoveryCluster[] = ['core', 'problem', 'comparison', 'long_tail', 'brand', 'adjacent'];
const VALID_PRIORITIES: DiscoveryPriority[] = ['high', 'medium', 'low'];

interface GeneratedPrompt {
  prompt_text: string;
  cluster: DiscoveryCluster;
  priority: DiscoveryPriority;
  service_line_tag: string | null;
  rationale: string;
}

function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
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

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const siteId = typeof body.siteId === 'string' ? body.siteId : null;
  const auditIdInput = typeof body.auditId === 'string' ? body.auditId : null;
  const force = body.force === true;
  if (!siteId) {
    return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
  }

  // Auth + ownership (user-scoped client)
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const isAdmin = isAdminAccount(user.email);

  const { data: site, error: siteErr } = await supabase
    .from('sites')
    .select('id, user_id, domain, vertical, url')
    .eq('id', siteId)
    .maybeSingle();
  if (siteErr || !site) {
    return NextResponse.json({ error: 'Site not found' }, { status: 404 });
  }
  if (!isAdmin && site.user_id !== user.id) {
    return NextResponse.json({ error: 'Not authorized for this site' }, { status: 403 });
  }

  const admin = getAdminClient();

  // Load audit (specific or most recent completed)
  let audit: Record<string, unknown> | null = null;
  if (auditIdInput) {
    const { data } = await admin.from('audits').select('*').eq('id', auditIdInput).maybeSingle();
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
    return NextResponse.json({ error: 'No completed audit found for this site' }, { status: 404 });
  }

  // Pull homepage page data for description / h1 / meta
  const { data: pages } = await admin
    .from('audit_pages')
    .select('page_type, title, meta_description, h1_text')
    .eq('audit_id', audit.id as string);
  const homepage = (pages || []).find(p => p.page_type === 'homepage') || (pages || [])[0] || null;

  const businessName = (homepage?.title || '').split(/[—|\-·]/)[0].trim() || site.domain;
  const domain = site.domain as string;
  const vertical = (site.vertical as string | null) || 'other';
  const description = homepage?.meta_description || null;
  const h1 = homepage?.h1_text || null;
  const businessModel = inferBusinessModel(vertical);

  // Check for existing profile; seed or update
  const { data: existingProfile } = await admin
    .from('discovery_profiles')
    .select('*')
    .eq('site_id', siteId)
    .maybeSingle();

  let profile = existingProfile;
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
      console.error('[discovery/generate-prompts] profile insert error:', insErr.message);
      return NextResponse.json({ error: 'Failed to create discovery profile' }, { status: 500 });
    }
    profile = inserted;
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
      console.error('[discovery/generate-prompts] profile update error:', updErr.message);
    } else {
      profile = updated;
    }
  }

  // If existing active generated prompts and NOT force — return them as-is
  const { data: existingPrompts } = await admin
    .from('discovery_prompts')
    .select('*')
    .eq('site_id', siteId)
    .eq('active', true)
    .eq('source', 'generated');
  if (!force && existingPrompts && existingPrompts.length > 0) {
    const { data: allPrompts } = await admin
      .from('discovery_prompts')
      .select('*')
      .eq('site_id', siteId)
      .order('cluster', { ascending: true });
    return NextResponse.json({
      profile,
      prompts: allPrompts || [],
      generated: false,
      count: (allPrompts || []).length,
    });
  }

  // Build Claude prompt
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  const services: string[] = Array.isArray(profile?.core_services) ? (profile!.core_services as string[]) : [];
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
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 3000, messages: [{ role: 'user', content: systemPrompt }] }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error('[discovery/generate-prompts] Claude API error:', { status: res.status, body: errBody.slice(0, 300) });
      return NextResponse.json({ error: 'Prompt generation failed' }, { status: 500 });
    }
    const data = await res.json();
    claudeText = data.content?.[0]?.text || '';
  } catch (err) {
    console.error('[discovery/generate-prompts] Claude fetch error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Prompt generation failed' }, { status: 500 });
  }

  let generated: GeneratedPrompt[] = [];
  try {
    const cleaned = claudeText.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const arr = Array.isArray(parsed?.prompts) ? parsed.prompts : (Array.isArray(parsed) ? parsed : []);
    generated = arr
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
    console.error('[discovery/generate-prompts] parse failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Failed to parse generated prompts' }, { status: 500 });
  }

  // Dedupe by prompt_text (case-insensitive)
  const seen = new Set<string>();
  const deduped: GeneratedPrompt[] = [];
  for (const p of generated) {
    const key = p.prompt_text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(p);
  }

  // Cap each cluster at its max
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
    return NextResponse.json({ error: 'No valid prompts generated' }, { status: 500 });
  }

  // On force=true, soft-delete existing generated prompts first (preserve custom/edited)
  if (force) {
    await admin
      .from('discovery_prompts')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('site_id', siteId)
      .eq('source', 'generated')
      .eq('active', true);
  }

  // Insert new generated prompts
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
    console.error('[discovery/generate-prompts] insert error:', insertErr.message);
    return NextResponse.json({ error: 'Failed to save generated prompts' }, { status: 500 });
  }

  // Return all prompts for the site (including preserved custom/edited)
  const { data: allPrompts } = await admin
    .from('discovery_prompts')
    .select('*')
    .eq('site_id', siteId)
    .order('cluster', { ascending: true });

  return NextResponse.json({
    profile,
    prompts: allPrompts || [],
    generated: true,
    count: (allPrompts || []).length,
  });
}
