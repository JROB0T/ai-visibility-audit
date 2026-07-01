// ============================================================
// buildReportExportPayload — assembles the ReportExportPayload for
// a (siteId, runId) pair. Extracted from /api/discovery/export-report
// (WO2 Task 0) so the SEVIS repair script and any future offline
// re-render tooling use the exact same assembly as the live route.
//
// Relative imports only — runs under `npx tsx scripts/*.ts` outside
// the Next.js resolver.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { clusterScore, visibilityDistribution } from '../discoveryScoring';
import type {
  DiscoveryCluster,
  DiscoveryCompetitor,
  DiscoveryInsight,
  DiscoveryProfile,
  DiscoveryRecommendation,
  DiscoveryResult,
  DiscoveryScoreSnapshot,
  DiscoveryTier,
  DiscoveryVisibilityStatus,
} from '../types';
import type { ReportExportPayload } from '../reportNarrative';

const ALL_CLUSTERS: DiscoveryCluster[] = ['core', 'problem', 'comparison', 'long_tail', 'brand', 'adjacent'];

export function scoreToGrade(score: number): string {
  if (score >= 97) return 'A+';
  if (score >= 93) return 'A';
  if (score >= 90) return 'A-';
  if (score >= 87) return 'B+';
  if (score >= 83) return 'B';
  if (score >= 80) return 'B-';
  if (score >= 77) return 'C+';
  if (score >= 73) return 'C';
  if (score >= 70) return 'C-';
  if (score >= 67) return 'D+';
  if (score >= 63) return 'D';
  if (score >= 60) return 'D-';
  return 'F';
}

function inferTier(results: DiscoveryResult[]): DiscoveryTier {
  const first = results[0];
  if (first && typeof first.internal_notes === 'string' && first.internal_notes.startsWith('tier:teaser')) {
    return 'teaser_legacy';
  }
  return 'full';
}

export async function buildReportExportPayload(
  admin: SupabaseClient,
  siteId: string,
  runId: string,
  runSnapshot: DiscoveryScoreSnapshot,
): Promise<ReportExportPayload> {
  const [
    { data: profileRow },
    { data: resultRows },
    { data: compRows },
    { data: insightRows },
    { data: recRows },
    { data: history },
  ] = await Promise.all([
    admin.from('discovery_profiles').select('*').eq('site_id', siteId).maybeSingle(),
    admin.from('discovery_results').select('*').eq('site_id', siteId).eq('run_id', runId).eq('suppressed', false),
    admin.from('discovery_competitors').select('*').eq('site_id', siteId),
    admin.from('discovery_insights').select('*').eq('site_id', siteId).eq('run_id', runId),
    admin.from('discovery_recommendations').select('*').eq('site_id', siteId).eq('run_id', runId),
    admin.from('discovery_score_snapshots').select('*').eq('site_id', siteId).order('snapshot_date', { ascending: true }),
  ]);

  const profile = profileRow as DiscoveryProfile | null;
  const results = (resultRows || []) as DiscoveryResult[];
  const competitors = (compRows || []) as DiscoveryCompetitor[];
  const insights = (insightRows || []) as DiscoveryInsight[];
  const recommendations = (recRows || []) as DiscoveryRecommendation[];
  const snapshotHistory = (history || []) as DiscoveryScoreSnapshot[];

  const tier = inferTier(results);
  const overall = runSnapshot.overall_score ?? 0;

  const clusterScores: Record<DiscoveryCluster, number | null> = {
    core: null, problem: null, comparison: null, long_tail: null, brand: null, adjacent: null,
  };
  for (const c of ALL_CLUSTERS) {
    const stored = (runSnapshot.cluster_scores || {})[c];
    if (typeof stored === 'number') {
      clusterScores[c] = stored;
    } else {
      clusterScores[c] = clusterScore(results, c);
    }
  }
  const visibility = visibilityDistribution(results);

  const promptsTested = results.map(r => ({
    id: r.id,
    prompt_text: r.prompt_text,
    cluster: (r.prompt_cluster || 'core') as DiscoveryCluster,
    priority: 'medium' as 'high' | 'medium' | 'low', // hydrated from discovery_prompts below
    score: r.prompt_score ?? 0,
    visibility_status: (r.visibility_status || 'unclear') as DiscoveryVisibilityStatus,
    business_position_type: r.business_position_type,
    business_mentioned: r.business_mentioned,
    business_cited: r.business_cited,
    result_type_summary: r.result_type_summary,
    normalized_response_summary: r.normalized_response_summary,
    raw_response_excerpt: r.raw_response_excerpt,
    competitor_names_detected: r.competitor_names_detected || [],
    competitor_domains_detected: r.competitor_domains_detected || [],
    directories_detected: r.directories_detected || [],
    marketplaces_detected: r.marketplaces_detected || [],
    confidence_score: r.confidence_score,
  }));

  const promptIds = Array.from(new Set(results.map(r => r.prompt_id).filter((x): x is string => typeof x === 'string')));
  if (promptIds.length > 0) {
    const { data: promptRows } = await admin
      .from('discovery_prompts')
      .select('id, priority')
      .in('id', promptIds);
    const priorityById = new Map<string, string>();
    for (const p of (promptRows || [])) {
      if (p.id && p.priority) priorityById.set(p.id as string, p.priority as string);
    }
    for (let i = 0; i < promptsTested.length; i++) {
      const r = results[i];
      if (r.prompt_id && priorityById.has(r.prompt_id)) {
        (promptsTested[i] as { priority: string }).priority = priorityById.get(r.prompt_id) as string;
      }
    }
  }

  const competitorsPayload = competitors.map(c => {
    const nameLower = (c.name || '').toLowerCase();
    const domainLower = (c.domain || '').toLowerCase();
    let timesAppeared = 0;
    let timesBeatUs = 0;
    const wonIn: { prompt_text: string; cluster: DiscoveryCluster; visibility_status: DiscoveryVisibilityStatus }[] = [];
    for (const r of results) {
      const names = (r.competitor_names_detected || []).map(s => s.toLowerCase());
      const domains = (r.competitor_domains_detected || []).map(s => s.toLowerCase());
      const present = (nameLower && names.includes(nameLower)) || (domainLower && domains.includes(domainLower));
      if (!present) continue;
      timesAppeared++;
      if (!r.business_mentioned) {
        timesBeatUs++;
        if (wonIn.length < 5) {
          wonIn.push({
            prompt_text: r.prompt_text,
            cluster: (r.prompt_cluster || 'core') as DiscoveryCluster,
            visibility_status: (r.visibility_status || 'unclear') as DiscoveryVisibilityStatus,
          });
        }
      }
    }
    return {
      id: c.id,
      name: c.name,
      domain: c.domain,
      times_appeared: timesAppeared,
      times_beat_us: timesBeatUs,
      prompts_where_they_won: wonIn,
    };
  });

  const compById = new Map<string, string>();
  for (const c of competitors) compById.set(c.id, c.name);
  const insightsPayload = insights.map(ins => ({
    category: ins.category,
    title: ins.title,
    description: ins.description || '',
    severity: ins.severity,
    linked_cluster: ins.linked_cluster,
    linked_competitor_name: ins.linked_competitor_id ? (compById.get(ins.linked_competitor_id) || null) : null,
  }));

  const recsPayload = recommendations.map(r => ({
    title: r.title,
    description: r.description || '',
    why_it_matters: r.why_it_matters || '',
    category: r.category || '',
    priority: (r.priority || 'medium') as 'high' | 'medium' | 'low',
    owner_type: r.owner_type || '',
    impact_estimate: r.impact_estimate || '',
    difficulty_estimate: r.difficulty_estimate || '',
    suggested_timeline: r.suggested_timeline || '',
    linked_prompt_clusters: (r.linked_prompt_clusters || []) as DiscoveryCluster[],
    linked_competitor_names: (r.linked_competitor_ids || [])
      .map(id => compById.get(id))
      .filter((n): n is string => typeof n === 'string'),
  }));

  const history_ = snapshotHistory.map(s => {
    const cs: Record<DiscoveryCluster, number | null> = {
      core: null, problem: null, comparison: null, long_tail: null, brand: null, adjacent: null,
    };
    for (const c of ALL_CLUSTERS) {
      const v = (s.cluster_scores || {})[c];
      cs[c] = typeof v === 'number' ? v : null;
    }
    return {
      snapshot_date: s.snapshot_date,
      run_id: s.run_id,
      overall_score: s.overall_score ?? 0,
      cluster_scores: cs,
      prompt_count: s.prompt_count,
      strong_count: s.strong_count,
      partial_count: s.partial_count,
      absent_count: s.absent_count,
      competitor_dominant_count: s.competitor_dominant_count,
    };
  });

  const firstSnap = snapshotHistory[0];
  const prevSnap = snapshotHistory.length >= 2 ? snapshotHistory[snapshotHistory.length - 2] : null;
  const overallChangeFromFirst = firstSnap && snapshotHistory.length >= 2
    ? overall - (firstSnap.overall_score ?? 0)
    : null;
  const overallChangeFromPrevious = prevSnap
    ? overall - (prevSnap.overall_score ?? 0)
    : null;
  let clusterChangesFromPrevious: Record<DiscoveryCluster, number | null> | null = null;
  if (prevSnap) {
    clusterChangesFromPrevious = { core: null, problem: null, comparison: null, long_tail: null, brand: null, adjacent: null };
    for (const c of ALL_CLUSTERS) {
      const now = (runSnapshot.cluster_scores || {})[c];
      const before = (prevSnap.cluster_scores || {})[c];
      clusterChangesFromPrevious[c] = typeof now === 'number' && typeof before === 'number'
        ? now - before
        : null;
    }
  }

  return {
    meta: {
      site_id: siteId,
      run_id: runId,
      business_name: profile?.business_name || '',
      domain: profile?.domain || '',
      primary_category: profile?.primary_category || null,
      service_area: profile?.service_area || null,
      tier,
      snapshot_date: runSnapshot.snapshot_date,
      report_generated_at: new Date().toISOString(),
      prompt_count: runSnapshot.prompt_count,
    },
    scores: {
      overall_score: overall,
      overall_grade: scoreToGrade(overall),
      cluster_scores: clusterScores,
      visibility_distribution: visibility,
      counts: {
        prompt_count: runSnapshot.prompt_count,
        strong_count: runSnapshot.strong_count,
        partial_count: runSnapshot.partial_count,
        absent_count: runSnapshot.absent_count,
        competitor_dominant_count: runSnapshot.competitor_dominant_count,
      },
    },
    prompts_tested: promptsTested,
    competitors: competitorsPayload,
    insights: insightsPayload,
    recommendations: recsPayload,
    trend: {
      available: snapshotHistory.length >= 2,
      snapshots_count: snapshotHistory.length,
      history: history_,
      overall_change_from_first: overallChangeFromFirst,
      overall_change_from_previous: overallChangeFromPrevious,
      cluster_changes_from_previous: clusterChangesFromPrevious,
    },
  };
}
