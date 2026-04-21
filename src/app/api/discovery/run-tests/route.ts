import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireDiscoveryAccess } from '@/lib/discoveryAccess';
import { runDiscoveryTests } from '@/lib/discoveryRunner';
import {
  detectInsightSignals,
  persistInsights,
  polishInsightsWithClaude,
} from '@/lib/discoveryInsights';
import {
  draftRecommendations,
  persistRecommendations,
  polishRecommendationsWithClaude,
} from '@/lib/discoveryRecommendations';
import type {
  DiscoveryCompetitor,
  DiscoveryProfile,
  DiscoveryResult,
  DiscoveryTier,
} from '@/lib/types';

export const maxDuration = 300;

function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface PostRunArtifacts {
  insightsCount: number;
  recommendationsCount: number;
}

async function runPostRunHook(
  siteId: string,
  runId: string,
  tier: DiscoveryTier,
  results: DiscoveryResult[],
): Promise<PostRunArtifacts> {
  const admin = getAdminClient();

  const [{ data: compRows }, { data: profileRow }] = await Promise.all([
    admin.from('discovery_competitors').select('*').eq('site_id', siteId).eq('active', true),
    admin.from('discovery_profiles').select('*').eq('site_id', siteId).maybeSingle(),
  ]);
  const competitors = (compRows || []) as DiscoveryCompetitor[];
  const profile = profileRow as DiscoveryProfile | null;
  if (!profile) {
    throw new Error('Discovery profile missing — cannot derive insights/recommendations');
  }

  const ctx = { results, competitors, profile, tier };

  // Insights
  let signals = detectInsightSignals(ctx);
  signals = await polishInsightsWithClaude(signals, profile, { timeoutMs: 12000 });
  const insertedInsights = await persistInsights(admin, siteId, runId, signals, competitors);

  // Recommendations (re-detect signals to keep signal_keys fresh; cheap)
  const freshSignals = detectInsightSignals(ctx);
  let drafts = draftRecommendations(freshSignals, ctx);
  drafts = await polishRecommendationsWithClaude(drafts, profile, { timeoutMs: 12000 });
  const insertedRecs = await persistRecommendations(admin, siteId, runId, drafts, competitors);

  return {
    insightsCount: insertedInsights.length,
    recommendationsCount: insertedRecs.length,
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const siteId = typeof body.siteId === 'string' ? body.siteId : null;
  const promptIds = Array.isArray(body.promptIds)
    ? (body.promptIds as unknown[]).filter((x): x is string => typeof x === 'string')
    : undefined;
  const tier: DiscoveryTier = body.tier === 'teaser' ? 'teaser' : 'full';
  if (!siteId) {
    return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
  }

  // Auth + ownership (teaser is always allowed; full gate below)
  const auth = await requireDiscoveryAccess(request, siteId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // Entitlement gate — teaser is free for all logged-in users; full requires paid
  if (tier === 'full' && !auth.isAdmin && !auth.isPaid) {
    return NextResponse.json({ error: 'Full discovery requires a paid plan' }, { status: 403 });
  }

  // Server-side idempotency: if a discovery run for this site landed in the
  // last 30 seconds, return the existing run's summary instead of kicking off
  // a duplicate. Guards against client-side double-fire (React StrictMode,
  // double-clicks, effect loops) on top of the ref-based client guard.
  {
    const idempotencyClient = getAdminClient();
    const { data: recent } = await idempotencyClient
      .from('discovery_score_snapshots')
      .select('run_id, overall_score, cluster_scores, prompt_count, strong_count, partial_count, absent_count, competitor_dominant_count, snapshot_date')
      .eq('site_id', siteId)
      .gt('snapshot_date', new Date(Date.now() - 30_000).toISOString())
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recent?.run_id) {
      console.warn(`[discovery/run-tests] idempotency: returning existing run ${String(recent.run_id).slice(0, 8)} (${recent.snapshot_date}) for site ${siteId.slice(0, 8)} — duplicate within 30s window`);
      const { count: insightsCount } = await idempotencyClient
        .from('discovery_insights')
        .select('id', { count: 'exact', head: true })
        .eq('site_id', siteId)
        .eq('run_id', recent.run_id);
      const { count: recsCount } = await idempotencyClient
        .from('discovery_recommendations')
        .select('id', { count: 'exact', head: true })
        .eq('site_id', siteId)
        .eq('run_id', recent.run_id);
      const { count: resultsCount } = await idempotencyClient
        .from('discovery_results')
        .select('id', { count: 'exact', head: true })
        .eq('site_id', siteId)
        .eq('run_id', recent.run_id);
      return NextResponse.json({
        runId: recent.run_id,
        tier,
        summary: {
          overall_score: recent.overall_score,
          cluster_scores: recent.cluster_scores,
          counts: {
            prompt_count: recent.prompt_count,
            strong_count: recent.strong_count,
            partial_count: recent.partial_count,
            absent_count: recent.absent_count,
            competitor_dominant_count: recent.competitor_dominant_count,
          },
          insightsCount: insightsCount || 0,
          recommendationsCount: recsCount || 0,
        },
        resultsCount: resultsCount || 0,
        errorsCount: 0,
        idempotent: true,
      });
    }
  }

  try {
    const run = await runDiscoveryTests({
      siteId,
      promptIds,
      triggeredBy: auth.isAdmin ? 'admin' : 'user',
      tier,
    });

    // Post-run hook: insights + recommendations. Wrapped so failures don't affect the test run.
    let insightsCount = 0;
    let recommendationsCount = 0;
    try {
      const hookResult = await runPostRunHook(siteId, run.runId, tier, run.results);
      insightsCount = hookResult.insightsCount;
      recommendationsCount = hookResult.recommendationsCount;
    } catch (hookErr) {
      console.error('[discovery/run-tests] post-run hook failed:', hookErr instanceof Error ? hookErr.message : hookErr);
    }

    return NextResponse.json({
      runId: run.runId,
      tier,
      summary: {
        overall_score: run.snapshot.overall_score,
        cluster_scores: run.snapshot.cluster_scores,
        counts: {
          prompt_count: run.snapshot.prompt_count,
          strong_count: run.snapshot.strong_count,
          partial_count: run.snapshot.partial_count,
          absent_count: run.snapshot.absent_count,
          competitor_dominant_count: run.snapshot.competitor_dominant_count,
        },
        insightsCount,
        recommendationsCount,
      },
      resultsCount: run.results.length,
      errorsCount: run.errors.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[discovery/run-tests] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
