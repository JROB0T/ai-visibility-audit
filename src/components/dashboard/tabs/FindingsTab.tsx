'use client';

// ============================================================
// FindingsTab — unified action list across BOTH score sources.
//
// 2026-06-30 consolidation:
//   - Merges AI Visibility findings (DiscoveryInsight) with Site
//     Readiness findings (AuditFinding) into a single ranked list.
//   - Sortable: Importance (default), Severity high→low /
//     low→high, AI Visibility first, Site Readiness first.
//   - Filterable by severity.
//   - The cluster-bar overview ("How you score by question type")
//     stays at the top — it's the most useful at-a-glance summary
//     and only applies to AI Visibility findings, so it sits
//     separately above the merged list.
//
// "Importance" sort intent: surface what the user should do FIRST.
// Ranking: high severity beats medium beats low; within the same
// severity, AI Visibility findings rank above Site Readiness ones
// because AI Visibility is the product's headline value prop.
// ============================================================

import { useMemo, useState } from 'react';
import SeverityRow from '../SeverityRow';
import { severityColor } from '@/lib/dashboardColors';
import { clusterLabel } from '@/lib/discovery';
import type {
  AuditFinding,
  DiscoveryCluster,
  DiscoveryInsight,
  DiscoveryResult,
  DiscoveryScoreSnapshot,
} from '@/lib/types';

type Severity = 'high' | 'medium' | 'low';
type Source = 'ai-visibility' | 'site-readiness';
type SeverityFilter = 'all' | Severity;
type SourceFilter = 'all' | Source;
type SortBy =
  | 'importance'        // default — composite rank
  | 'severity-desc'     // high → low
  | 'severity-asc'      // low → high
  | 'ai-first'          // AI Visibility first, then Site Readiness
  | 'readiness-first';  // Site Readiness first

interface UnifiedFinding {
  id: string;
  source: Source;
  severity: Severity;
  title: string;
  subtitle?: string;
  // AI Visibility specific
  cluster?: DiscoveryCluster | null;
  // Site Readiness specific
  category?: AuditFinding['category'];
  affectedUrls?: string[];
}

interface FindingsTabProps {
  snapshot: DiscoveryScoreSnapshot;
  insights: DiscoveryInsight[];
  results: DiscoveryResult[];
  /**
   * Site Readiness findings. Passed through from the audit page.
   * Optional so the legacy call signature still works during the
   * consolidation rollout.
   */
  readinessFindings?: AuditFinding[];
  onPromptDrilldown: (cluster: DiscoveryCluster) => void;
}

export default function FindingsTab(props: FindingsTabProps): React.ReactElement {
  const [filter, setFilter] = useState<SeverityFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('importance');

  // Merge both finding sources into a single unified list.
  const unified: UnifiedFinding[] = useMemo(() => {
    const fromInsights: UnifiedFinding[] = props.insights.map((i) => ({
      id: i.id || `insight-${i.title}`,
      source: 'ai-visibility',
      severity: (i.severity || 'medium') as Severity,
      title: i.title,
      subtitle: i.description ?? undefined,
      cluster: i.linked_cluster ?? null,
    }));
    const fromReadiness: UnifiedFinding[] = (props.readinessFindings ?? []).map((f) => ({
      id: f.id,
      source: 'site-readiness',
      severity: f.severity,
      title: f.title,
      subtitle: f.description,
      category: f.category,
      affectedUrls: f.affected_urls,
    }));
    return [...fromInsights, ...fromReadiness];
  }, [props.insights, props.readinessFindings]);

  // Apply filters then sort.
  const visible = useMemo(() => {
    let out = unified;
    if (filter !== 'all') out = out.filter((f) => f.severity === filter);
    if (sourceFilter !== 'all') out = out.filter((f) => f.source === sourceFilter);

    const sorted = [...out];
    switch (sortBy) {
      case 'severity-desc':
        sorted.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
        break;
      case 'severity-asc':
        sorted.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
        break;
      case 'ai-first':
        sorted.sort((a, b) =>
          a.source === b.source ? severityRank(a.severity) - severityRank(b.severity) :
          a.source === 'ai-visibility' ? -1 : 1,
        );
        break;
      case 'readiness-first':
        sorted.sort((a, b) =>
          a.source === b.source ? severityRank(a.severity) - severityRank(b.severity) :
          a.source === 'site-readiness' ? -1 : 1,
        );
        break;
      case 'importance':
      default:
        // Composite: severity first, then AI Visibility before Site
        // Readiness within the same severity bucket.
        sorted.sort((a, b) => {
          const sevDiff = severityRank(a.severity) - severityRank(b.severity);
          if (sevDiff !== 0) return sevDiff;
          if (a.source === b.source) return 0;
          return a.source === 'ai-visibility' ? -1 : 1;
        });
        break;
    }
    return sorted;
  }, [unified, filter, sourceFilter, sortBy]);

  // Counts per source for the filter labels.
  const aiCount = unified.filter((f) => f.source === 'ai-visibility').length;
  const readinessCount = unified.filter((f) => f.source === 'site-readiness').length;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Cluster bars — AI Visibility only, summary at a glance */}
      <section
        className="rounded-xl border p-6"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <h2 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text-primary)' }}>
          AI Visibility — by question type
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

      {/* Unified findings list */}
      <section
        className="rounded-xl border p-6"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
              All findings ({visible.length})
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              {aiCount} from AI Visibility · {readinessCount} from Site Readiness
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <FilterDropdown
              value={sourceFilter}
              onChange={(v) => setSourceFilter(v as SourceFilter)}
              options={[
                { value: 'all', label: `Both sources (${unified.length})` },
                { value: 'ai-visibility', label: `AI Visibility (${aiCount})` },
                { value: 'site-readiness', label: `Site Readiness (${readinessCount})` },
              ]}
            />
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
                { value: 'importance',     label: 'Sort: Importance' },
                { value: 'severity-desc',  label: 'Severity: High → Low' },
                { value: 'severity-asc',   label: 'Severity: Low → High' },
                { value: 'ai-first',       label: 'AI Visibility first' },
                { value: 'readiness-first',label: 'Site Readiness first' },
              ]}
            />
          </div>
        </div>
        {visible.length === 0 ? (
          <p className="text-sm py-8 text-center" style={{ color: 'var(--text-tertiary)' }}>
            No findings match your filters.
          </p>
        ) : (
          visible.map((f) => (
            <SeverityRow
              key={f.id}
              severity={f.severity}
              label={
                f.source === 'ai-visibility'
                  ? f.cluster ? `AI · ${clusterLabel(f.cluster)}` : 'AI Visibility'
                  : `Site · ${categoryLabel(f.category)}`
              }
              title={f.title}
              subtitle={f.subtitle}
              onClick={
                f.source === 'ai-visibility' && f.cluster
                  ? () => props.onPromptDrilldown(f.cluster as DiscoveryCluster)
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
  cluster, score, promptCount, onClick,
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
        <div className="h-full rounded-full" style={{ width: `${fill}%`, background: severityColor(score) }} />
      </div>
      <div className="text-sm text-right tabular-nums" style={{ color: severityColor(score), fontFamily: 'var(--font-mono)' }}>
        {score === null ? '—' : score}
      </div>
      <div className="text-xs text-right" style={{ color: 'var(--text-tertiary)' }}>
        {promptCount} prompts
      </div>
    </button>
  );
}

function FilterDropdown({
  value, onChange, options,
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
      style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
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
function severityRank(s: Severity): number {
  if (s === 'high') return 0;
  if (s === 'medium') return 1;
  return 2;
}
function categoryLabel(c: AuditFinding['category'] | undefined): string {
  switch (c) {
    case 'crawlability': return 'Crawlability';
    case 'machine_readability': return 'Machine Readability';
    case 'commercial_clarity': return 'Commercial Clarity';
    case 'trust_clarity': return 'Trust Clarity';
    default: return 'Site Readiness';
  }
}
