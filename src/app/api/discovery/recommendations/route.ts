import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireDiscoveryAccess, requireFullDiscoveryAccess } from '@/lib/discoveryAccess';
import type {
  DiscoveryOwnerType,
  DiscoveryPriority,
  DiscoveryResult,
  DiscoveryTier,
} from '@/lib/types';

export const maxDuration = 30;

const VALID_PRIORITIES: DiscoveryPriority[] = ['high', 'medium', 'low'];
const VALID_OWNER_TYPES: DiscoveryOwnerType[] = ['developer', 'marketer', 'business_owner'];
const VALID_IMPACT: DiscoveryPriority[] = ['high', 'medium', 'low'];

function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const siteId = request.nextUrl.searchParams.get('siteId');
  if (!siteId) return NextResponse.json({ error: 'siteId query param required' }, { status: 400 });
  const auth = await requireDiscoveryAccess(request, siteId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getAdminClient();
  let runId = request.nextUrl.searchParams.get('runId');
  if (!runId) {
    const { data: latest } = await admin
      .from('discovery_score_snapshots')
      .select('run_id')
      .eq('site_id', siteId)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    runId = latest?.run_id || null;
  }
  if (!runId) {
    return NextResponse.json({ recommendations: [], tier: 'full' });
  }

  const { data: recs, error } = await admin
    .from('discovery_recommendations')
    .select('*')
    .eq('site_id', siteId)
    .eq('run_id', runId)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[discovery/recommendations GET]', error.message);
    return NextResponse.json({ error: 'Failed to fetch recommendations' }, { status: 500 });
  }

  const { data: sampleResult } = await admin
    .from('discovery_results')
    .select('internal_notes')
    .eq('site_id', siteId)
    .eq('run_id', runId)
    .limit(1)
    .maybeSingle();
  const sample = (sampleResult || null) as Pick<DiscoveryResult, 'internal_notes'> | null;
  const tier: DiscoveryTier = sample && typeof sample.internal_notes === 'string' && sample.internal_notes.startsWith('tier:teaser')
    ? 'teaser'
    : 'full';

  return NextResponse.json({ recommendations: recs || [], tier, runId });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const id = typeof body.id === 'string' ? body.id : null;
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const admin = getAdminClient();
  const { data: existing } = await admin
    .from('discovery_recommendations')
    .select('id, site_id')
    .eq('id', id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: 'Recommendation not found' }, { status: 404 });
  const auth = await requireFullDiscoveryAccess(request, existing.site_id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const updates: Record<string, unknown> = { edited_by_admin: true };
  if (typeof body.title === 'string') updates.title = body.title.trim();
  if ('description' in body) updates.description = typeof body.description === 'string' ? body.description : null;
  if ('why_it_matters' in body) updates.why_it_matters = typeof body.why_it_matters === 'string' ? body.why_it_matters : null;
  if (typeof body.priority === 'string' && VALID_PRIORITIES.includes(body.priority as DiscoveryPriority)) {
    updates.priority = body.priority;
  }
  if (typeof body.owner_type === 'string' && VALID_OWNER_TYPES.includes(body.owner_type as DiscoveryOwnerType)) {
    updates.owner_type = body.owner_type;
  }
  if (typeof body.impact_estimate === 'string' && VALID_IMPACT.includes(body.impact_estimate as DiscoveryPriority)) {
    updates.impact_estimate = body.impact_estimate;
  }
  if (typeof body.difficulty_estimate === 'string' && VALID_IMPACT.includes(body.difficulty_estimate as DiscoveryPriority)) {
    updates.difficulty_estimate = body.difficulty_estimate;
  }
  if (typeof body.suggested_timeline === 'string') updates.suggested_timeline = body.suggested_timeline.trim();
  updates.updated_at = new Date().toISOString();

  const { data, error } = await admin
    .from('discovery_recommendations')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('[discovery/recommendations PATCH]', error.message);
    return NextResponse.json({ error: 'Failed to update recommendation' }, { status: 500 });
  }
  return NextResponse.json({ recommendation: data });
}
