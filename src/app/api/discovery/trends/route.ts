import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireDiscoveryAccess } from '@/lib/discoveryAccess';
import type { DiscoveryScoreSnapshot } from '@/lib/types';

export const maxDuration = 30;

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 24;

function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const siteId = request.nextUrl.searchParams.get('siteId');
  if (!siteId) return NextResponse.json({ error: 'siteId query param required' }, { status: 400 });
  const limitParam = request.nextUrl.searchParams.get('limit');
  let limit = DEFAULT_LIMIT;
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (!isNaN(parsed) && parsed > 0) {
      limit = Math.min(parsed, MAX_LIMIT);
    }
  }

  const auth = await requireDiscoveryAccess(request, siteId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getAdminClient();
  const { data, error } = await admin
    .from('discovery_score_snapshots')
    .select('*')
    .eq('site_id', siteId)
    .order('snapshot_date', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[discovery/trends GET]', error.message);
    return NextResponse.json({ error: 'Failed to fetch trends' }, { status: 500 });
  }

  // Reverse to ascending for chart rendering
  const snapshots = ((data || []) as DiscoveryScoreSnapshot[]).slice().reverse();
  return NextResponse.json({ snapshots, count: snapshots.length });
}
