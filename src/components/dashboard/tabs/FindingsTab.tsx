'use client';

import { useMemo, useState } from 'react';
import SeverityRow from '../SeverityRow';
import { severityColor } from '@/lib/dashboardColors';
import { clusterLabel } from '@/lib/discovery';
import type {
  DiscoveryCluster,
  DiscoveryInsight,
  DiscoveryResult,
  DiscoveryScoreSnapshot,
} from '@/lib/types';

interface FindingsTabProps {
  snapshot: DiscoveryScoreSnapshot;
  insights: DiscoveryInsight[];
  results: DiscoveryResult[];
  onPromptDrilldown: (cluster: DiscoveryCluster) => void;
}

type SeverityFilter = 'all' | 'high' | 'medium' | 'low';
type SortBy = 'severity' | 'cluster';

export default function FindingsTab(props: FindingsTabProps): React.ReactElement {
  const [filter, setFilter] = useState<SeverityFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('severity');

  const filteredFindings = useMemo(() => {
    let out = [...props.insights];
    if (filter !== 'all') out = out.filter((i) => i.severity === filter);
    if (sortBy === 'severity') {
      out.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
    } else {
      out.sort((a, b) => (a.linked_cluster || '').localeCompare(b.linked_cluster || ''));
    }
    return out;
  }, [props.insights, filter, sortBy]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Cluster bars */}
      <section
        className="rounded-xl border p-6"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <h2
          className="text-sm font-bold uppercase tracking-wider mb-4"
          style={{ color: 'var(--text-primary)' }}
        >
          How you score by question type
        </h2>
        <div className="space-y-3">
          {clusterEntries(props.snapshot).map(([cluster, score]) => (
            <ClusterBar
              key={cluster}
              cluster={cluster as DiscoveryCluster}
              score={score}
              promptCount={countPromptsInCluster(props.results, cluster as DiscoveryCluster)}
              onClick={() => props.onPromptDrilldown(cluster as DiscoveryCluster)}
            />
          ))}
        </div>
      </section>

      {/* Findings list */}
      <section
        className="rounded-xl border p-6"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2
            className="text-sm font-bold uppercase tracking-wider"
            style={{ color: 'var(--text-primary)' }}
          >
            All findings ({filteredFindings.length})
          </h2>
          <div className="flex items-center gap-2 text-xs">
            <FilterDropdown
              value={filter}
              onChange={(v) => setFilter(v as SeverityFilter)}
              options={[
                { value: 'all', label: 'All severities' },
                { value: 'high', label: 'High only' },
                { value: 'medium', label: 'Medium only' },
                { value: 'low', label: 'Low only' },
              ]}
            />
            <FilterDropdown
              value={sortBy}
              onChange={(v) => setSortBy(v as SortBy)}
              options={[
                { value: 'severity', label: 'Sort: Severity' },
                { value: 'cluster', label: 'Sort: Cluster' },
              ]}
            />
          </div>
        </div>
        {filteredFindings.length === 0 ? (
          <p className="text-sm py-8 text-center" style={{ color: 'var(--text-tertiary)' }}>
            No findings match your filters.
          </p>
        ) : (
          filteredFindings.map((f) => (
            <SeverityRow
              key={f.id || f.title}
              severity={(f.severity || 'medium') as 'high' | 'medium' | 'low'}
              label={f.linked_cluster ? clusterLabel(f.linked_cluster) : undefined}
              title={f.title}
              subtitle={f.description}
              onClick={
                f.linked_cluster
                  ? () => props.onPromptDrilldown(f.linked_cluster as DiscoveryCluster)
                  : undefined
              }
            />
          ))
        )}
      </section>
    </div>
  );
}

function ClusterBar({
  cluster,
  score,
  promptCount,
  onClick,
}: {
  cluster: DiscoveryCluster;
  score: number | null;
  promptCount: number;
  onClick: () => void;
}): React.ReactElement {
  const fill = score === null ? 0 : score;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left grid grid-cols-[150px,1fr,60px,80px] gap-3 items-center py-2 hover:bg-black/5 rounded transition"
    >
      <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
        {clusterLabel(cluster)}
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${fill}%`, background: severityColor(score) }}
        />
      </div>
      <div
        className="text-sm text-right tabular-nums"
        style={{ color: severityColor(score), fontFamily: 'var(--font-mono)' }}
      >
        {score === null ? '—' : score}
      </div>
      <div className="text-xs text-right" style={{ color: 'var(--text-tertiary)' }}>
        {promptCount} prompts
      </div>
    </button>
  );
}

function FilterDropdown({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}): React.ReactElement {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-2 py-1 rounded border text-xs cursor-pointer"
      style={{
        background: 'var(--background)',
        borderColor: 'var(--border)',
        color: 'var(--text-secondary)',
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function clusterEntries(snapshot: DiscoveryScoreSnapshot): Array<[string, number | null]> {
  const all: DiscoveryCluster[] = ['core', 'problem', 'comparison', 'long_tail', 'brand', 'adjacent'];
  const cs = snapshot.cluster_scores || {};
  return all.map((c) => {
    const v = cs[c];
    return [c, typeof v === 'number' ? v : null];
  });
}

function countPromptsInCluster(results: DiscoveryResult[], cluster: DiscoveryCluster): number {
  return results.filter((r) => r.prompt_cluster === cluster).length;
}

function severityRank(s: string | null | undefined): number {
  if (s === 'high') return 0;
  if (s === 'medium') return 1;
  return 2;
}
