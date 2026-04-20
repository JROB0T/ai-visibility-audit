import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireDiscoveryAccess, requireFullDiscoveryAccess } from '@/lib/discoveryAccess';
import type { DiscoveryVisibilityStatus } from '@/lib/types';

export const maxDuration = 30;

const VALID_STATUSES: DiscoveryVisibilityStatus[] = [
  'strong_presence', 'partial_presence', 'indirect_presence',
  'absent', 'competitor_dominant', 'directory_dominant', 'unclear',
];

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const siteId = request.nextUrl.searchParams.get('siteId');
  if (!siteId) {
    return NextResponse.json({ error: 'siteId query param required' }, { status: 400 });
  }
  let runId = request.nextUrl.searchParams.get('runId');
  const includesSuppressed = request.nextUrl.searchParams.get('includesSuppressed') === 'true';

  const auth = await requireDiscoveryAccess(request, siteId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getAdminClient();

  // If no runId, find the latest for this site
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
    return NextResponse.json({ runId: null, results: [], snapshot: null });
  }

  let resultsQuery = admin
    .from('discovery_results')
    .select('*')
    .eq('site_id', siteId)
    .eq('run_id', runId)
    .order('prompt_cluster', { ascending: true })
    .order('prompt_score', { ascending: false });
  if (!includesSuppressed) {
    resultsQuery = resultsQuery.eq('suppressed', false);
  }
  const { data: results, error: resultsErr } = await resultsQuery;
  if (resultsErr) {
    console.error('[discovery/results GET] results error:', resultsErr.message);
    return NextResponse.json({ error: 'Failed to fetch results' }, { status: 500 });
  }

  const { data: snapshot } = await admin
    .from('discovery_score_snapshots')
    .select('*')
    .eq('site_id', siteId)
    .eq('run_id', runId)
    .maybeSingle();

  return NextResponse.json({ runId, results: results || [], snapshot: snapshot || null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const id = typeof body.id === 'string' ? body.id : null;
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const admin = getAdminClient();
  const { data: existing, error: findErr } = await admin
    .from('discovery_results')
    .select('id, site_id')
    .eq('id', id)
    .maybeSingle();
  if (findErr || !existing) {
    return NextResponse.json({ error: 'Result not found' }, { status: 404 });
  }
  const auth = await requireFullDiscoveryAccess(request, existing.site_id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const updates: Record<string, unknown> = {};
  let manualEdit = false;

  if (typeof body.reviewed === 'boolean') updates.reviewed = body.reviewed;
  if (typeof body.suppressed === 'boolean') updates.suppressed = body.suppressed;
  if ('internal_notes' in body) {
    updates.internal_notes = typeof body.internal_notes === 'string' ? body.internal_notes : null;
  }
  if ('normalized_response_summary' in body) {
    updates.normalized_response_summary = typeof body.normalized_response_summary === 'string'
      ? body.normalized_response_summary
      : null;
  }
  if (typeof body.visibility_status === 'string' && VALID_STATUSES.includes(body.visibility_status as DiscoveryVisibilityStatus)) {
    updates.visibility_status = body.visibility_status;
    manualEdit = true;
  }
  if (typeof body.prompt_score === 'number' && body.prompt_score >= 0 && body.prompt_score <= 100) {
    updates.prompt_score = Math.round(body.prompt_score);
    manualEdit = true;
  }

  // Manual edits to visibility/score flip reviewed=true unless caller explicitly set otherwise
  if (manualEdit && !('reviewed' in body)) {
    updates.reviewed = true;
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await admin
    .from('discovery_results')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('[discovery/results PATCH] error:', error.message);
    return NextResponse.json({ error: 'Failed to update result' }, { status: 500 });
  }
  return NextResponse.json({ result: data });
}
