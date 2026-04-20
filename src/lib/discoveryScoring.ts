// ============================================================
// AI Discovery — pure scoring module
// No DB access, no API calls. Deterministic functions only.
// ============================================================

import { DEFAULT_DISCOVERY_CLUSTER_WEIGHTS } from '@/lib/discovery';
import type {
  DiscoveryCluster,
  DiscoveryClusterWeights,
  DiscoveryPositionType,
  DiscoveryResult,
  DiscoveryVisibilityStatus,
} from '@/lib/types';

const ALL_CLUSTERS: DiscoveryCluster[] = [
  'core',
  'problem',
  'comparison',
  'long_tail',
  'brand',
  'adjacent',
];

const ALL_VISIBILITY_STATUSES: DiscoveryVisibilityStatus[] = [
  'strong_presence',
  'partial_presence',
  'indirect_presence',
  'absent',
  'competitor_dominant',
  'directory_dominant',
  'unclear',
];

/**
 * Score table (0-100) by visibility_status, with position_type refinements:
 *
 *   strong_presence        → 100 if directly_recommended
 *                          →  90 if listed_among_options
 *                          → 100 otherwise
 *   partial_presence       →  80 if business_position_type === 'cited_as_source'
 *                          →  75 otherwise
 *   indirect_presence      →  50
 *   competitor_dominant    →  25
 *   directory_dominant     →  25
 *   absent                 →   0
 *   unclear                →  50 (neutral — flagged for manual review via `reviewed`)
 *
 * Rationale: position_type is a tiebreaker, not a primary axis. The caller is
 * responsible for setting `reviewed=false` on unclear rows so downstream insights
 * (Ticket 4) can surface them for admin review.
 */
export function promptScore(
  result: Pick<DiscoveryResult, 'visibility_status' | 'business_position_type'>,
): number {
  const status = result.visibility_status;
  const pos: DiscoveryPositionType | null = result.business_position_type ?? null;
  switch (status) {
    case 'strong_presence':
      if (pos === 'listed_among_options') return 90;
      return 100;
    case 'partial_presence':
      if (pos === 'cited_as_source') return 80;
      return 75;
    case 'indirect_presence':
      return 50;
    case 'competitor_dominant':
      return 25;
    case 'directory_dominant':
      return 25;
    case 'absent':
      return 0;
    case 'unclear':
      return 50;
    case null:
    case undefined:
      return 50;
    default:
      return 50;
  }
}

function activeResults(results: DiscoveryResult[]): DiscoveryResult[] {
  return results.filter(r => !r.suppressed);
}

/**
 * Average promptScore for non-suppressed results in the given cluster.
 * Returns null when the cluster has no results (so callers can distinguish
 * "no data" from "zero score").
 */
export function clusterScore(
  results: DiscoveryResult[],
  cluster: DiscoveryCluster,
): number | null {
  const inCluster = activeResults(results).filter(r => r.prompt_cluster === cluster);
  if (inCluster.length === 0) return null;
  const sum = inCluster.reduce((acc, r) => acc + promptScore(r), 0);
  return Math.round(sum / inCluster.length);
}

/**
 * Weighted average across clusters. Clusters with no results are dropped and
 * the remaining weights are renormalized so missing clusters don't unfairly
 * depress the overall score.
 */
export function overallDiscoveryScore(
  results: DiscoveryResult[],
  weights: DiscoveryClusterWeights = DEFAULT_DISCOVERY_CLUSTER_WEIGHTS,
): number {
  const contributions: { weight: number; score: number }[] = [];
  for (const cluster of ALL_CLUSTERS) {
    const s = clusterScore(results, cluster);
    if (s === null) continue;
    contributions.push({ weight: weights[cluster], score: s });
  }
  if (contributions.length === 0) return 0;
  const totalWeight = contributions.reduce((acc, c) => acc + c.weight, 0);
  if (totalWeight === 0) return 0;
  const weighted = contributions.reduce((acc, c) => acc + c.score * c.weight, 0);
  return Math.round(weighted / totalWeight);
}

export function clusterDistribution(
  results: DiscoveryResult[],
): { cluster: DiscoveryCluster; count: number; avgScore: number | null }[] {
  const active = activeResults(results);
  return ALL_CLUSTERS.map(cluster => {
    const inCluster = active.filter(r => r.prompt_cluster === cluster);
    const count = inCluster.length;
    const avgScore = count === 0
      ? null
      : Math.round(inCluster.reduce((acc, r) => acc + promptScore(r), 0) / count);
    return { cluster, count, avgScore };
  });
}

export function visibilityDistribution(
  results: DiscoveryResult[],
): Record<DiscoveryVisibilityStatus, number> {
  const out: Record<DiscoveryVisibilityStatus, number> = {
    strong_presence: 0,
    partial_presence: 0,
    indirect_presence: 0,
    absent: 0,
    competitor_dominant: 0,
    directory_dominant: 0,
    unclear: 0,
  };
  for (const r of activeResults(results)) {
    const status = r.visibility_status;
    if (status && ALL_VISIBILITY_STATUSES.includes(status)) {
      out[status]++;
    }
  }
  return out;
}

export function countsForSnapshot(
  results: DiscoveryResult[],
): {
  promptCount: number;
  strongCount: number;
  partialCount: number;
  absentCount: number;
  competitorDominantCount: number;
} {
  const active = activeResults(results);
  const dist = visibilityDistribution(active);
  return {
    promptCount: active.length,
    strongCount: dist.strong_presence,
    partialCount: dist.partial_presence + dist.indirect_presence,
    absentCount: dist.absent,
    competitorDominantCount: dist.competitor_dominant,
  };
}
