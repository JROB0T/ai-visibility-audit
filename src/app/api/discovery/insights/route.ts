import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireDiscoveryAccess } from '@/lib/discoveryAccess';
import type { DiscoveryResult, DiscoveryTier } from '@/lib/types';

export const maxDuration = 30;

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
    return NextResponse.json({ insights: [], tier: 'full' });
  }

  const { data: insights, error } = await admin
    .from('discovery_insights')
    .select('*')
    .eq('site_id', siteId)
    .eq('run_id', runId)
    .order('severity', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[discovery/insights GET]', error.message);
    return NextResponse.json({ error: 'Failed to fetch insights' }, { status: 500 });
  }

  // Derive tier from a result in this run
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

  return NextResponse.json({ insights: insights || [], tier, runId });
}
