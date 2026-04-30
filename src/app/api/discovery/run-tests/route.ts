import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireDiscoveryAccess } from '@/lib/discoveryAccess';
import { runDiscoveryTests } from '@/lib/discoveryRunner';
import {
  detectInsightSignals,
  persistInsights,
  polishInsightsWithClaude,
  type InsightSignal,
} from '@/lib/discoveryInsights';
import {
  draftRecommendations,
  persistRecommendations,
  polishRecommendationsWithClaude,
  type RecommendationDraft,
} from '@/lib/discoveryRecommendations';
import { autoPopulateCompetitorsForRun } from '@/lib/discoveryCompetitorAutoPopulate';
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

export interface PostRunStatus {
  insights: 'ok' | 'drafts_only' | 'failed';
  recommendations: 'ok' | 'drafts_only' | 'failed';
  competitors: 'ok' | 'skipped' | 'failed';
}

export interface PostRunOutcome {
  insightsCount: number;
  recommendationsCount: number;
  competitorsInserted: number;
  competitorsTotal: number;
  status: PostRunStatus;
}

/**
 * Multi-phase post-run hook. Each phase is an INDEPENDENT try/catch — a
 * failure in one phase never prevents later phases. Every phase logs a
 * single structured line with outcome + duration.
 *
 * Phases:
 *   A. detect + persist DRAFT insights (unpolished)
 *   B. polish insights with Claude
 *   C. re-persist polished insights (overwrites A for this run_id)
 *   D. draft + persist DRAFT recommendations (unpolished)
 *   E. polish recommendations with Claude
 *   F. re-persist polished recommendations
 *   G. auto-populate discovery_competitors for this run
 */
export async function runPostRunHook(
  siteId: string,
  runId: string,
  tier: DiscoveryTier,
  results: DiscoveryResult[],
  onProgress?: (message: string) => void,
): Promise<PostRunOutcome> {
  const admin = getAdminClient();
  const logTag = `site=${siteId.slice(0, 8)} run=${runId.slice(0, 8)}`;
  // Best-effort progress notifications. Wrapped so a misbehaving callback
  // can never break the actual hook work.
  const tellProgress = (msg: string): void => {
    if (!onProgress) return;
    try { onProgress(msg); } catch { /* swallow */ }
  };

  const outcome: PostRunOutcome = {
    insightsCount: 0,
    recommendationsCount: 0,
    competitorsInserted: 0,
    competitorsTotal: 0,
    status: { insights: 'failed', recommendations: 'failed', competitors: 'skipped' },
  };

  // Load profile + competitors (shared context for insights + recs)
  let profile: DiscoveryProfile | null = null;
  let competitors: DiscoveryCompetitor[] = [];
  try {
    const [{ data: compRows }, { data: profileRow }] = await Promise.all([
      admin.from('discovery_competitors').select('*').eq('site_id', siteId).eq('active', true),
      admin.from('discovery_profiles').select('*').eq('site_id', siteId).maybeSingle(),
    ]);
    competitors = (compRows || []) as DiscoveryCompetitor[];
    profile = profileRow as DiscoveryProfile | null;
  } catch (err) {
    console.error(`[PostRun] phase=loadContext ${logTag} status=failed error=${err instanceof Error ? err.message : err}`);
  }
  if (!profile) {
    console.error(`[PostRun] phase=loadContext ${logTag} status=failed reason=profile_missing — skipping all post-run phases`);
    return outcome;
  }

  const ctx = { results, competitors, profile, tier };

  tellProgress('Analyzing visibility patterns…');

  // --- Phase A: persist DRAFT insights ---
  let rawSignals: InsightSignal[] = [];
  {
    const t0 = Date.now();
    try {
      rawSignals = detectInsightSignals(ctx);
      await persistInsights(admin, siteId, runId, rawSignals, competitors);
      outcome.insightsCount = rawSignals.length;
      outcome.status.insights = 'drafts_only';
      console.log(`[PostRun] phase=insights.persistDrafts ${logTag} status=ok count=${rawSignals.length} duration_ms=${Date.now() - t0}`);
    } catch (err) {
      console.error(`[PostRun] phase=insights.persistDrafts ${logTag} status=failed duration_ms=${Date.now() - t0} error=${err instanceof Error ? err.message : err}`);
    }
  }

  // --- Phase B + C: polish + re-persist polished insights ---
  if (rawSignals.length > 0) {
    const t0 = Date.now();
    try {
      const before = rawSignals;
      const polished = await polishInsightsWithClaude(rawSignals, profile, { timeoutMs: 12000 });
      const polishedOk = polished !== before;
      if (polishedOk) {
        try {
          await persistInsights(admin, siteId, runId, polished, competitors);
          outcome.insightsCount = polished.length;
          outcome.status.insights = 'ok';
          console.log(`[PostRun] phase=insights.polish ${logTag} status=success count=${polished.length} duration_ms=${Date.now() - t0}`);
        } catch (persistErr) {
          console.error(`[PostRun] phase=insights.repersistPolished ${logTag} status=failed duration_ms=${Date.now() - t0} error=${persistErr instanceof Error ? persistErr.message : persistErr}`);
          // drafts already persisted — leave status=drafts_only
        }
      } else {
        console.log(`[PostRun] phase=insights.polish ${logTag} status=fallback duration_ms=${Date.now() - t0}`);
      }
    } catch (err) {
      console.error(`[PostRun] phase=insights.polish ${logTag} status=failed duration_ms=${Date.now() - t0} error=${err instanceof Error ? err.message : err}`);
    }
  }

  tellProgress('Drafting strategic recommendations…');

  // --- Phase D: draft + persist DRAFT recommendations ---
  // CRITICAL: runs regardless of insights phase outcome.
  let rawDrafts: RecommendationDraft[] = [];
  {
    const t0 = Date.now();
    try {
      const freshSignals = detectInsightSignals(ctx);
      rawDrafts = draftRecommendations(freshSignals, ctx);
      await persistRecommendations(admin, siteId, runId, rawDrafts, competitors);
      outcome.recommendationsCount = rawDrafts.length;
      outcome.status.recommendations = 'drafts_only';
      console.log(`[PostRun] phase=recs.persistDrafts ${logTag} status=ok count=${rawDrafts.length} duration_ms=${Date.now() - t0}`);
    } catch (err) {
      console.error(`[PostRun] phase=recs.persistDrafts ${logTag} status=failed duration_ms=${Date.now() - t0} error=${err instanceof Error ? err.message : err}`);
    }
  }

  // --- Phase E + F: polish + re-persist polished recs ---
  if (rawDrafts.length > 0) {
    const t0 = Date.now();
    try {
      const before = rawDrafts;
      const polished = await polishRecommendationsWithClaude(rawDrafts, profile, { timeoutMs: 12000 });
      const polishedOk = polished !== before;
      if (polishedOk) {
        try {
          await persistRecommendations(admin, siteId, runId, polished, competitors);
          outcome.recommendationsCount = polished.length;
          outcome.status.recommendations = 'ok';
          console.log(`[PostRun] phase=recs.polish ${logTag} status=success count=${polished.length} duration_ms=${Date.now() - t0}`);
        } catch (persistErr) {
          console.error(`[PostRun] phase=recs.repersistPolished ${logTag} status=failed duration_ms=${Date.now() - t0} error=${persistErr instanceof Error ? persistErr.message : persistErr}`);
        }
      } else {
        console.log(`[PostRun] phase=recs.polish ${logTag} status=fallback duration_ms=${Date.now() - t0}`);
      }
    } catch (err) {
      console.error(`[PostRun] phase=recs.polish ${logTag} status=failed duration_ms=${Date.now() - t0} error=${err instanceof Error ? err.message : err}`);
    }
  }

  tellProgress('Mapping the competitive landscape…');

  // --- Phase G: auto-populate competitors ---
  {
    const t0 = Date.now();
    try {
      const autoResult = await autoPopulateCompetitorsForRun(admin, siteId, runId);
      outcome.competitorsInserted = autoResult.inserted;
      outcome.competitorsTotal = autoResult.total;
      outcome.status.competitors = 'ok';
      console.log(`[PostRun] phase=competitors.autoPopulate ${logTag} status=ok inserted=${autoResult.inserted} updated=${autoResult.updated} total=${autoResult.total} duration_ms=${Date.now() - t0}`);
    } catch (err) {
      outcome.status.competitors = 'failed';
      console.error(`[PostRun] phase=competitors.autoPopulate ${logTag} status=failed duration_ms=${Date.now() - t0} error=${err instanceof Error ? err.message : err}`);
    }
  }

  return outcome;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const siteId = typeof body.siteId === 'string' ? body.siteId : null;
  const promptIds = Array.isArray(body.promptIds)
    ? (body.promptIds as unknown[]).filter((x): x is string => typeof x === 'string')
    : undefined;
  // Phase 1.5a: teaser killed. Always full.
  const tier: DiscoveryTier = 'full';
  if (!siteId) {
    return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
  }

  // Auth + ownership
  const auth = await requireDiscoveryAccess(request, siteId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // Entitlement gate
  if (!auth.isAdmin && !auth.isPaid) {
    return NextResponse.json({ error: 'Discovery requires a paid plan' }, { status: 403 });
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

    // Post-run hook: insights + recommendations + auto-competitors. The hook
    // never throws — each phase handles its own errors and logs structured
    // lines — but we still catch defensively in case something unexpected slips.
    let insightsCount = 0;
    let recommendationsCount = 0;
    let postRunStatus: PostRunStatus = {
      insights: 'failed',
      recommendations: 'failed',
      competitors: 'skipped',
    };
    let competitorsInserted = 0;
    try {
      const hookResult = await runPostRunHook(siteId, run.runId, tier, run.results);
      insightsCount = hookResult.insightsCount;
      recommendationsCount = hookResult.recommendationsCount;
      postRunStatus = hookResult.status;
      competitorsInserted = hookResult.competitorsInserted;
    } catch (hookErr) {
      console.error('[discovery/run-tests] post-run hook unexpected error:', hookErr instanceof Error ? hookErr.message : hookErr);
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
        competitorsInserted,
      },
      postRunStatus,
      resultsCount: run.results.length,
      errorsCount: run.errors.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[discovery/run-tests] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
