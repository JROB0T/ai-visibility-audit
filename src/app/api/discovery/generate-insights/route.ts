import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireFullDiscoveryAccess } from '@/lib/discoveryAccess';
import { detectInsightSignals, persistInsights, polishInsightsWithClaude } from '@/lib/discoveryInsights';
import type { DiscoveryCompetitor, DiscoveryProfile, DiscoveryResult, DiscoveryTier } from '@/lib/types';

export const maxDuration = 60;

function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function inferTierFromResults(results: DiscoveryResult[]): DiscoveryTier {
  if (results.length === 0) return 'full';
  const first = results[0];
  if (typeof first.internal_notes === 'string' && first.internal_notes.startsWith('tier:teaser')) return 'teaser_legacy';
  return 'full';
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const siteId = typeof body.siteId === 'string' ? body.siteId : null;
  const runIdInput = typeof body.runId === 'string' ? body.runId : null;
  const polish = body.polish !== false;
  if (!siteId) {
    return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
  }

  const auth = await requireFullDiscoveryAccess(request, siteId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getAdminClient();

  // Resolve runId (latest if not provided)
  let runId = runIdInput;
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
    return NextResponse.json({ error: 'No run found for this site' }, { status: 404 });
  }

  // Load results, competitors, profile
  const [{ data: resultRows }, { data: compRows }, { data: profileRow }] = await Promise.all([
    admin.from('discovery_results').select('*').eq('site_id', siteId).eq('run_id', runId).eq('suppressed', false),
    admin.from('discovery_competitors').select('*').eq('site_id', siteId).eq('active', true),
    admin.from('discovery_profiles').select('*').eq('site_id', siteId).maybeSingle(),
  ]);

  const results = (resultRows || []) as DiscoveryResult[];
  const competitors = (compRows || []) as DiscoveryCompetitor[];
  const profile = profileRow as DiscoveryProfile | null;
  if (!profile) {
    return NextResponse.json({ error: 'Discovery profile not found' }, { status: 404 });
  }

  const tier = inferTierFromResults(results);

  let signals = detectInsightSignals({ results, competitors, profile, tier });
  let polished = false;
  if (polish && signals.length > 0) {
    const before = signals;
    signals = await polishInsightsWithClaude(signals, profile, { timeoutMs: 15000 });
    polished = signals !== before; // reference change means polish succeeded
  }

  try {
    const inserted = await persistInsights(admin, siteId, runId, signals, competitors);
    return NextResponse.json({
      insights: inserted,
      count: inserted.length,
      polished,
      tier,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
