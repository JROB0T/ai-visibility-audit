'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, CheckCircle, XCircle } from 'lucide-react';
import {
  clusterLabel,
  visibilityStatusLabel,
  visibilityStatusColor,
  formatRelativeDate,
} from '@/lib/discovery';
import type {
  DiscoveryCluster,
  DiscoveryResult,
  DiscoveryScoreSnapshot,
  DiscoveryTier,
  DiscoveryVisibilityStatus,
  DiscoveryPositionType,
} from '@/lib/types';

const ALL_CLUSTERS: DiscoveryCluster[] = ['core', 'problem', 'comparison', 'long_tail', 'brand', 'adjacent'];
const ALL_STATUSES: DiscoveryVisibilityStatus[] = [
  'strong_presence', 'partial_presence', 'indirect_presence',
  'absent', 'competitor_dominant', 'directory_dominant', 'unclear',
];

interface ResultsProps {
  siteId: string;
  latestRunId: string | null;
  tier: DiscoveryTier | null;
  isPaid: boolean;
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
}

function positionTypeLabel(p: DiscoveryPositionType | null | undefined): string {
  switch (p) {
    case 'directly_recommended': return 'Directly recommended';
    case 'listed_among_options': return 'Listed among options';
    case 'cited_as_source': return 'Cited as source';
    case 'mentioned_without_preference': return 'Mentioned without preference';
    case 'implied_only': return 'Implied only';
    case 'not_present': return 'Not present';
    default: return '—';
  }
}

export default function DiscoveryResults(props: ResultsProps): React.ReactElement {
  const { siteId, latestRunId, isPaid, isAdmin, onRefresh } = props;

  const [results, setResults] = useState<DiscoveryResult[]>([]);
  const [snapshot, setSnapshot] = useState<DiscoveryScoreSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | DiscoveryVisibilityStatus>('all');
  const [clusterFilter, setClusterFilter] = useState<'all' | DiscoveryCluster>('all');
  const [showSuppressed, setShowSuppressed] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [reviewedOnly, setReviewedOnly] = useState(false);

  // Edit state (admin)
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null);
  const [editStatusDraft, setEditStatusDraft] = useState<DiscoveryVisibilityStatus>('unclear');
  const [editScoreDraft, setEditScoreDraft] = useState<number>(50);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const loadResults = useCallback(async () => {
    try {
      const params = new URLSearchParams({ siteId });
      if (latestRunId) params.set('runId', latestRunId);
      if (showSuppressed) params.set('includesSuppressed', 'true');
      const url = `/api/discovery/results?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) {
        setError('Could not load results');
        return;
      }
      const data = await res.json();
      setResults((data.results || []) as DiscoveryResult[]);
      setSnapshot(data.snapshot || null);
    } catch (err) {
      console.error('[DiscoveryResults] load failed:', err);
      setError('Could not load results');
    } finally {
      setLoading(false);
    }
  }, [siteId, latestRunId, showSuppressed]);

  useEffect(() => {
    void loadResults();
  }, [loadResults]);

  const filtered = useMemo(() => {
    return results.filter(r => {
      if (!showSuppressed && r.suppressed) return false;
      if (statusFilter !== 'all' && r.visibility_status !== statusFilter) return false;
      if (clusterFilter !== 'all' && r.prompt_cluster !== clusterFilter) return false;
      if (reviewedOnly && !r.reviewed) return false;
      if (searchText.trim().length > 0) {
        const needle = searchText.toLowerCase();
        if (!r.prompt_text.toLowerCase().includes(needle)) return false;
      }
      return true;
    });
  }, [results, statusFilter, clusterFilter, showSuppressed, reviewedOnly, searchText]);

  async function patchResult(id: string, patch: Record<string, unknown>): Promise<void> {
    setBusyId(id);
    setRowError(prev => ({ ...prev, [id]: '' }));
    try {
      const res = await fetch('/api/discovery/results', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Update failed' }));
        setRowError(prev => ({ ...prev, [id]: data.error || 'Update failed' }));
        return;
      }
      await loadResults();
      await onRefresh();
    } catch (err) {
      console.error('[DiscoveryResults] patch failed:', err);
      setRowError(prev => ({ ...prev, [id]: 'Update failed' }));
    } finally {
      setBusyId(null);
    }
  }

  function toggleExpand(id: string): void {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const allowFull = isPaid || isAdmin;

  // ============================================================
  // TEASER GATE
  // ============================================================
  if (!allowFull) {
    return (
      <div>
        <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Prompt results</h3>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Free preview shows a summary only. Upgrade to see every AI answer, competitor detection, and detailed breakdown for each prompt.
        </p>
        {snapshot && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Pill label={`${snapshot.strong_count} Strong`} color="#10B981" />
            <Pill label={`${snapshot.partial_count} Partial`} color="#F59E0B" />
            <Pill label={`${snapshot.absent_count} Absent`} color="#EF4444" />
            <Pill label={`${snapshot.competitor_dominant_count} Competitor-dominant`} color="#F97316" />
          </div>
        )}
        <div className="mt-5">
          <a href="/pricing" className="btn-primary px-4 py-2 text-sm font-medium inline-flex items-center gap-2">
            Upgrade to see full results
          </a>
        </div>
      </div>
    );
  }

  // ============================================================
  // FULL MODE
  // ============================================================
  if (loading) {
    return (
      <div
        className="rounded-xl border p-8 text-center"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading results…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-xl border p-6 text-center text-sm"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: '#F87171' }}
      >
        {error}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div
        className="rounded-xl border p-10 text-center"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>No results yet</h3>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Run a discovery test from the Overview tab to populate this view.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Prompt results</h3>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {results.length} prompts tested{snapshot?.snapshot_date ? ` on ${formatRelativeDate(snapshot.snapshot_date)}` : ''}
        </p>
      </div>

      {/* FILTERS */}
      <div
        className="mb-4 rounded-xl border p-3 flex items-center gap-2 flex-wrap"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <label className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>Visibility</label>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
          className="text-sm rounded-md border px-2 py-1"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        >
          <option value="all">All</option>
          {ALL_STATUSES.map(s => <option key={s} value={s}>{visibilityStatusLabel(s)}</option>)}
        </select>

        <label className="text-xs font-medium uppercase tracking-wide ml-2" style={{ color: 'var(--text-tertiary)' }}>Cluster</label>
        <select
          value={clusterFilter}
          onChange={e => setClusterFilter(e.target.value as typeof clusterFilter)}
          className="text-sm rounded-md border px-2 py-1"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        >
          <option value="all">All</option>
          {ALL_CLUSTERS.map(c => <option key={c} value={c}>{clusterLabel(c)}</option>)}
        </select>

        <input
          type="text"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          placeholder="Search prompts…"
          className="text-sm rounded-md border px-2 py-1 ml-2 flex-1 min-w-[140px]"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        />

        <label className="inline-flex items-center gap-1.5 text-sm ml-2" style={{ color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={showSuppressed} onChange={e => setShowSuppressed(e.target.checked)} />
          Show suppressed
        </label>
        {isAdmin && (
          <label className="inline-flex items-center gap-1.5 text-sm ml-2" style={{ color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={reviewedOnly} onChange={e => setReviewedOnly(e.target.checked)} />
            Reviewed only
          </label>
        )}
      </div>

      {/* LIST */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div
            className="rounded-xl border p-6 text-center text-sm"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-tertiary)' }}
          >
            No results match these filters.
          </div>
        )}
        {filtered.map(r => {
          const isOpen = expanded.has(r.id);
          return (
            <div
              key={r.id}
              className="rounded-xl border"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)', opacity: r.suppressed ? 0.55 : 1 }}
            >
              <button
                type="button"
                onClick={() => toggleExpand(r.id)}
                className="w-full text-left p-3 flex items-start gap-3 flex-wrap md:flex-nowrap"
                aria-expanded={isOpen}
              >
                <div className="flex flex-col gap-1 shrink-0 min-w-[140px]">
                  {r.visibility_status && (
                    <span
                      className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${visibilityStatusColor(r.visibility_status)}`}
                      style={{ background: 'var(--bg-tertiary)' }}
                    >
                      {visibilityStatusLabel(r.visibility_status)}
                    </span>
                  )}
                  {r.prompt_cluster && (
                    <span
                      className="inline-flex px-2 py-0.5 text-[11px] font-medium rounded-full"
                      style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                    >
                      {clusterLabel(r.prompt_cluster)}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{r.prompt_text}</p>
                  {r.result_type_summary && (
                    <p className="mt-0.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>{r.result_type_summary}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {typeof r.prompt_score === 'number' && (
                    <span
                      className="inline-flex px-2 py-0.5 text-xs font-bold rounded-full"
                      style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}
                    >
                      {r.prompt_score}
                    </span>
                  )}
                  {isOpen
                    ? <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                    : <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />}
                </div>
              </button>

              {isOpen && (
                <div className="border-t px-4 py-3" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Prompt</p>
                  <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>{r.prompt_text}</p>

                  <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>AI answer summary</p>
                  <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                    {r.normalized_response_summary || r.raw_response_excerpt || <span style={{ color: 'var(--text-tertiary)' }}>No summary available.</span>}
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3 text-xs">
                    <Stat label="Position" value={positionTypeLabel(r.business_position_type)} />
                    <YesNo label="Business cited" value={r.business_cited} />
                    <YesNo label="Domain detected" value={r.business_domain_detected} />
                    <Stat label="Confidence" value={typeof r.confidence_score === 'number' ? `${Math.round(r.confidence_score * 100)}%` : '—'} />
                  </div>

                  {(r.competitor_names_detected && r.competitor_names_detected.length > 0) && (
                    <DetailPills label="Competitors detected" items={r.competitor_names_detected} color="#F97316" />
                  )}
                  {(r.directories_detected && r.directories_detected.length > 0) && (
                    <DetailPills label="Directories detected" items={r.directories_detected} color="var(--text-tertiary)" muted />
                  )}
                  {(r.marketplaces_detected && r.marketplaces_detected.length > 0) && (
                    <DetailPills label="Marketplaces detected" items={r.marketplaces_detected} color="var(--text-tertiary)" muted />
                  )}

                  <p className="mt-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Tested {formatRelativeDate(r.test_date)}
                  </p>

                  {isAdmin && (
                    <div
                      className="mt-4 pt-3 border-t flex flex-col gap-2"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => patchResult(r.id, { reviewed: !r.reviewed })}
                          disabled={busyId === r.id}
                          className="btn-secondary px-3 py-1.5 text-xs"
                        >
                          {r.reviewed ? 'Mark unreviewed' : 'Mark reviewed'}
                        </button>
                        <button
                          type="button"
                          onClick={() => patchResult(r.id, { suppressed: !r.suppressed })}
                          disabled={busyId === r.id}
                          className="btn-secondary px-3 py-1.5 text-xs"
                        >
                          {r.suppressed ? 'Unsuppress' : 'Suppress'}
                        </button>
                        {editingStatusId !== r.id && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingStatusId(r.id);
                              setEditStatusDraft(r.visibility_status || 'unclear');
                              setEditScoreDraft(typeof r.prompt_score === 'number' ? r.prompt_score : 50);
                            }}
                            className="btn-secondary px-3 py-1.5 text-xs"
                          >
                            Edit status
                          </button>
                        )}
                      </div>

                      {editingStatusId === r.id && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <select
                            value={editStatusDraft}
                            onChange={e => setEditStatusDraft(e.target.value as DiscoveryVisibilityStatus)}
                            className="text-xs rounded-md border px-2 py-1"
                            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                          >
                            {ALL_STATUSES.map(s => <option key={s} value={s}>{visibilityStatusLabel(s)}</option>)}
                          </select>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={editScoreDraft}
                            onChange={e => setEditScoreDraft(parseInt(e.target.value, 10) || 0)}
                            className="w-20 text-xs rounded-md border px-2 py-1"
                            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                            aria-label="Prompt score"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              await patchResult(r.id, {
                                visibility_status: editStatusDraft,
                                prompt_score: editScoreDraft,
                              });
                              setEditingStatusId(null);
                            }}
                            className="btn-primary px-3 py-1 text-xs"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingStatusId(null)}
                            className="btn-secondary px-3 py-1 text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      )}

                      <div>
                        <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Internal notes</label>
                        <textarea
                          defaultValue={r.internal_notes || ''}
                          rows={2}
                          onBlur={e => {
                            const next = e.target.value;
                            if (next !== (r.internal_notes || '')) {
                              void patchResult(r.id, { internal_notes: next });
                            }
                          }}
                          className="w-full text-xs rounded-md border px-2 py-1.5"
                          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                          placeholder="Notes save on blur…"
                        />
                      </div>
                      {rowError[r.id] && (
                        <p className="text-xs" style={{ color: '#F87171' }}>{rowError[r.id]}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Small helpers
// ============================================================
function Pill({ label, color }: { label: string; color: string }): React.ReactElement {
  return (
    <span
      className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full"
      style={{ color, background: `${color}20` }}
    >
      {label}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
      <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{value}</p>
    </div>
  );
}

function YesNo({ label, value }: { label: string; value: boolean }): React.ReactElement {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
      <p className="text-sm inline-flex items-center gap-1" style={{ color: 'var(--text-primary)' }}>
        {value
          ? <><CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Yes</>
          : <><XCircle className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} /> No</>}
      </p>
    </div>
  );
}

function DetailPills({ label, items, color, muted }: { label: string; items: string[]; color: string; muted?: boolean }): React.ReactElement {
  return (
    <div className="mb-2">
      <p className="text-[11px] font-medium uppercase tracking-wide mb-1" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <span
            key={`${item}-${i}`}
            className="inline-flex px-2 py-0.5 text-xs rounded-full"
            style={muted
              ? { background: 'var(--bg-tertiary)', color }
              : { background: `${color}20`, color }}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
