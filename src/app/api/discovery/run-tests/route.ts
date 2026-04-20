import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';
import { isAdminAccount } from '@/lib/entitlements';
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
  signals = await polishInsightsWithClaude(signals, profile, { timeoutMs: 8000 });
  const insertedInsights = await persistInsights(admin, siteId, runId, signals, competitors);

  // Recommendations (re-detect signals to keep signal_keys fresh; cheap)
  const freshSignals = detectInsightSignals(ctx);
  let drafts = draftRecommendations(freshSignals, ctx);
  drafts = await polishRecommendationsWithClaude(drafts, profile, { timeoutMs: 8000 });
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

  // Auth
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const isAdmin = isAdminAccount(user.email);

  const { data: site, error: siteErr } = await supabase
    .from('sites')
    .select('id, user_id')
    .eq('id', siteId)
    .maybeSingle();
  if (siteErr || !site) return NextResponse.json({ error: 'Site not found' }, { status: 404 });
  if (!isAdmin && site.user_id !== user.id) {
    return NextResponse.json({ error: 'Not authorized for this site' }, { status: 403 });
  }

  // Entitlement gate — teaser is free for all logged-in users; full requires can_view_core
  if (!isAdmin && tier === 'full') {
    const { data: entitlement } = await supabase
      .from('entitlements')
      .select('can_view_core')
      .eq('user_id', user.id)
      .eq('site_id', siteId)
      .single();
    if (!entitlement?.can_view_core) {
      return NextResponse.json({ error: 'Full discovery test requires a paid plan — try a teaser instead' }, { status: 403 });
    }
  }

  try {
    const run = await runDiscoveryTests({
      siteId,
      promptIds,
      triggeredBy: isAdmin ? 'admin' : 'user',
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
