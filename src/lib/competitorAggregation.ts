// ============================================================
// Competitor presence aggregation.
//
// Counts, per cluster, how many prompts each entity appeared in.
// "Entity" = the user's business OR a tracked/detected competitor.
//
// We work entirely from string matching of competitor names against
// `competitor_names_detected[]` on each prompt result. Names are
// normalized (lowercased + trimmed + common-suffix-stripped) for
// comparison only — display uses the original casing from the
// tracked-competitor record or the most common occurrence in
// detection.
//
// Why string matching: result rows store names, not competitor IDs.
// A competitor's "presence" is the count of prompt rows whose
// `competitor_names_detected` contains a matching name. "ABC Plumbing"
// and "ABC Plumbing LLC" appear as separate rivals unless the tracked
// record's name happens to match the detection — in practice AI
// usually returns one form consistently per prompt so this works
// well enough.
// ============================================================

import type {
  DiscoveryCluster,
  DiscoveryCompetitor,
  DiscoveryResult,
} from './types';

export interface CompetitorMatrixRow {
  displayName: string;
  normalizedName: string;
  clusterCounts: Map<DiscoveryCluster, number>;
  isTracked: boolean;
  trackedId?: string;
  source?: DiscoveryCompetitor['source'];
}

export interface MatrixData {
  clusters: DiscoveryCluster[];
  yourPresenceByCluster: Map<DiscoveryCluster, { appeared: number; total: number }>;
  competitorRows: CompetitorMatrixRow[];
}

const CLUSTER_ORDER: DiscoveryCluster[] = [
  'core',
  'comparison',
  'problem',
  'long_tail',
  'brand',
  'adjacent',
];

function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+(llc|inc|corp|co|company|services?|plumbing|hvac)$/i, '')
    .trim();
}

/**
 * Aggregate results into matrix data.
 *
 * Limit: include only competitors who appeared in at least
 * `minAppearances` prompts (default 1) OR are tracked. Untracked
 * one-off mentions can drown the matrix and aren't a useful signal.
 */
export function buildCompetitorMatrix(
  results: DiscoveryResult[],
  trackedCompetitors: DiscoveryCompetitor[],
  options: { minAppearances?: number } = {},
): MatrixData {
  const minAppearances = options.minAppearances ?? 1;

  const trackedByNormName = new Map<string, DiscoveryCompetitor>();
  for (const tc of trackedCompetitors) {
    if (tc.name) trackedByNormName.set(normalizeName(tc.name), tc);
  }

  const counts = new Map<string, Map<DiscoveryCluster, number>>();
  const totalByName = new Map<string, number>();
  const displayCasings = new Map<string, Map<string, number>>();

  const yourPresence = new Map<DiscoveryCluster, { appeared: number; total: number }>();
  for (const c of CLUSTER_ORDER) yourPresence.set(c, { appeared: 0, total: 0 });

  for (const r of results) {
    if (r.suppressed) continue;
    const cluster = r.prompt_cluster;
    if (!cluster) continue;

    const yp = yourPresence.get(cluster);
    if (yp) {
      yp.total += 1;
      // "Appeared" = visibility_status anything except 'absent'.
      if (r.visibility_status && r.visibility_status !== 'absent') {
        yp.appeared += 1;
      }
    }

    for (const name of r.competitor_names_detected || []) {
      const norm = normalizeName(name);
      if (!norm) continue;

      let casings = displayCasings.get(norm);
      if (!casings) {
        casings = new Map();
        displayCasings.set(norm, casings);
      }
      casings.set(name, (casings.get(name) || 0) + 1);

      let perCluster = counts.get(norm);
      if (!perCluster) {
        perCluster = new Map();
        counts.set(norm, perCluster);
      }
      perCluster.set(cluster, (perCluster.get(cluster) || 0) + 1);

      totalByName.set(norm, (totalByName.get(norm) || 0) + 1);
    }
  }

  const rows: CompetitorMatrixRow[] = [];

  Array.from(totalByName.entries()).forEach(([norm, total]) => {
    if (total < minAppearances) return;
    const tracked = trackedByNormName.get(norm);

    const casings = displayCasings.get(norm) || new Map<string, number>();
    let bestCasing = norm;
    let bestCount = -1;
    Array.from(casings.entries()).forEach(([casing, count]) => {
      if (count > bestCount) {
        bestCasing = casing;
        bestCount = count;
      }
    });
    const displayName = tracked?.name || bestCasing;

    rows.push({
      displayName,
      normalizedName: norm,
      clusterCounts: counts.get(norm) || new Map(),
      isTracked: !!tracked,
      trackedId: tracked?.id,
      source: tracked?.source,
    });
  });

  // Tracked competitors with zero appearances still appear so the user
  // sees their tracked list reflected even when AI hasn't mentioned them.
  for (const tc of trackedCompetitors) {
    const norm = normalizeName(tc.name || '');
    if (!norm) continue;
    if (totalByName.has(norm)) continue;
    rows.push({
      displayName: tc.name,
      normalizedName: norm,
      clusterCounts: new Map(),
      isTracked: true,
      trackedId: tc.id,
      source: tc.source,
    });
  }

  rows.sort((a, b) => {
    if (a.isTracked && !b.isTracked) return -1;
    if (!a.isTracked && b.isTracked) return 1;
    if (a.isTracked && b.isTracked) return a.displayName.localeCompare(b.displayName);
    const aTotal = Array.from(a.clusterCounts.values()).reduce((s, n) => s + n, 0);
    const bTotal = Array.from(b.clusterCounts.values()).reduce((s, n) => s + n, 0);
    return bTotal - aTotal;
  });

  return {
    clusters: CLUSTER_ORDER,
    yourPresenceByCluster: yourPresence,
    competitorRows: rows,
  };
}

export interface LosingGroundEntry {
  cluster: DiscoveryCluster;
  competitorName: string;
  competitorAppearances: number;
  yourAppearances: number;
  totalPrompts: number;
}

/**
 * Identify (competitor, cluster) pairs where competitor count > user count.
 */
export function findLosingGround(matrix: MatrixData): LosingGroundEntry[] {
  const entries: LosingGroundEntry[] = [];
  for (const row of matrix.competitorRows) {
    for (const cluster of matrix.clusters) {
      const compCount = row.clusterCounts.get(cluster) || 0;
      const you = matrix.yourPresenceByCluster.get(cluster);
      if (!you || you.total === 0) continue;
      if (compCount > you.appeared) {
        entries.push({
          cluster,
          competitorName: row.displayName,
          competitorAppearances: compCount,
          yourAppearances: you.appeared,
          totalPrompts: you.total,
        });
      }
    }
  }
  entries.sort(
    (a, b) =>
      b.competitorAppearances -
      b.yourAppearances -
      (a.competitorAppearances - a.yourAppearances),
  );
  return entries;
}

export const CLUSTER_LABELS: Record<DiscoveryCluster, string> = {
  core: 'Core Purchase Intent',
  comparison: 'Comparison / Best-Of',
  problem: 'Problem-Based',
  long_tail: 'Service Detail / Long-Tail',
  brand: 'Brand & Category',
  adjacent: 'Adjacent Opportunity',
};

export const CLUSTER_LABELS_SHORT: Record<DiscoveryCluster, string> = {
  core: 'Core',
  comparison: 'Comparison',
  problem: 'Problem',
  long_tail: 'Long-tail',
  brand: 'Brand',
  adjacent: 'Adjacent',
};
