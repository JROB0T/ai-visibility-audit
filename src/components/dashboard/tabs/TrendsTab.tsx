'use client';

import { useMemo, useState } from 'react';
import SeverityRow from '../SeverityRow';
import TrendChart from '@/lib/charts/TrendChart';
import Sparkline from '@/lib/charts/Sparkline';
import { clusterLabel } from '@/lib/discovery';
import type { DiscoveryCluster, DiscoveryScoreSnapshot } from '@/lib/types';

const ALL_CLUSTERS: DiscoveryCluster[] = ['core', 'problem', 'comparison', 'long_tail', 'brand', 'adjacent'];

interface TrendsTabProps {
  currentSnapshot: DiscoveryScoreSnapshot | null;
  history: DiscoveryScoreSnapshot[];
}

type Range = 'all' | '6m' | '3m';

export default function TrendsTab(props: TrendsTabProps): React.ReactElement {
  const [range, setRange] = useState<Range>('all');

  const filteredHistory = useMemo(() => filterByRange(props.history, range), [props.history, range]);

  const clusterDeltas = useMemo(() => computeClusterDeltas(props.history), [props.history]);

  const overallTrend = filteredHistory.map((s) => ({
    date: s.snapshot_date,
    score: s.overall_score,
  }));

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Big trend line */}
      <section
        className="rounded-xl border p-6"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2
            className="text-sm font-bold uppercase tracking-wider"
            style={{ color: 'var(--text-primary)' }}
          >
            AI visibility over time
          </h2>
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as Range)}
            className="px-2 py-1 rounded border text-xs cursor-pointer"
            style={{
              background: 'var(--background)',
              borderColor: 'var(--border)',
              color: 'var(--text-secondary)',
            }}
          >
            <option value="all">All time</option>
            <option value="6m">Last 6 months</option>
            <option value="3m">Last 3 months</option>
          </select>
        </div>
        <TrendChart history={overallTrend} />
      </section>

      {/* What moved this month */}
      <section
        className="rounded-xl border p-6"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <h2
          className="text-sm font-bold uppercase tracking-wider mb-4"
          style={{ color: 'var(--text-primary)' }}
        >
          What moved since last run
        </h2>
        {clusterDeltas.length === 0 ? (
          <p className="text-sm py-4" style={{ color: 'var(--text-tertiary)' }}>
            No prior run to compare against — this is your baseline.
          </p>
        ) : (
          clusterDeltas.map((d) => (
            <SeverityRow
              key={d.cluster}
              severity={d.delta === null || d.delta === 0 ? 'low' : d.delta > 0 ? 'low' : 'high'}
              label={clusterLabel(d.cluster)}
              title={titleForDelta(d.cluster, d.delta)}
              subtitle={subtitleForDelta(d.cluster, d.delta)}
              rightLabel={formatDelta(d.delta)}
            />
          ))
        )}
      </section>

      {/* Per-cluster sparklines */}
      <section
        className="rounded-xl border p-6"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <h2
          className="text-sm font-bold uppercase tracking-wider mb-4"
          style={{ color: 'var(--text-primary)' }}
        >
          By cluster
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {ALL_CLUSTERS.map((c) => {
            const values = filteredHistory.map((s) => {
              const v = s.cluster_scores?.[c];
              return typeof v === 'number' ? v : null;
            });
            const latest = values.filter((v): v is number => typeof v === 'number').slice(-1)[0];
            return (
              <div
                key={c}
                className="rounded-lg border p-3"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="flex items-baseline justify-between mb-2">
                  <span
                    className="text-xs uppercase tracking-wider font-medium"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    {clusterLabel(c)}
                  </span>
                  <span
                    className="text-sm tabular-nums"
                    style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}
                  >
                    {latest === undefined ? '—' : latest}
                  </span>
                </div>
                <Sparkline values={values} width={220} height={36} />
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

interface ClusterDelta {
  cluster: DiscoveryCluster;
  delta: number | null;
}

function computeClusterDeltas(history: DiscoveryScoreSnapshot[]): ClusterDelta[] {
  if (history.length < 2) return [];
  const sorted = [...history].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
  const current = sorted[sorted.length - 1];
  const previous = sorted[sorted.length - 2];
  return ALL_CLUSTERS.map((c) => {
    const cur = current.cluster_scores?.[c];
    const prev = previous.cluster_scores?.[c];
    if (typeof cur !== 'number' || typeof prev !== 'number') {
      return { cluster: c, delta: null };
    }
    return { cluster: c, delta: cur - prev };
  });
}

function filterByRange(history: DiscoveryScoreSnapshot[], range: Range): DiscoveryScoreSnapshot[] {
  if (range === 'all') return history;
  const now = Date.now();
  const monthsBack = range === '6m' ? 6 : 3;
  const cutoff = now - monthsBack * 30 * 24 * 60 * 60 * 1000;
  return history.filter((s) => {
    const t = new Date(s.snapshot_date).getTime();
    return !isNaN(t) && t >= cutoff;
  });
}

function titleForDelta(cluster: DiscoveryCluster, delta: number | null): string {
  if (delta === null) return `${clusterLabel(cluster)} — no data`;
  if (delta === 0) return `${clusterLabel(cluster)} held steady`;
  return delta > 0 ? `${clusterLabel(cluster)} improved` : `${clusterLabel(cluster)} slipped`;
}

function subtitleForDelta(_cluster: DiscoveryCluster, delta: number | null): string | undefined {
  if (delta === null) return 'No comparable data in the previous run.';
  if (delta === 0) return 'No measurable change since last run.';
  if (delta > 0) return 'Trending up — keep doing what you’re doing.';
  return 'Worth a closer look on the Findings tab.';
}

function formatDelta(delta: number | null): string {
  if (delta === null) return '—';
  if (delta === 0) return '±0';
  return delta > 0 ? `+${delta}` : `${delta}`;
}
