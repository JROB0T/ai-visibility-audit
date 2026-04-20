'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getScoreColor } from '@/components/ScoreRing';
import { clusterLabel } from '@/lib/discovery';
import type { DiscoveryCluster, DiscoveryScoreSnapshot, DiscoveryTier } from '@/lib/types';

const ALL_CLUSTERS: DiscoveryCluster[] = ['core', 'problem', 'comparison', 'long_tail', 'brand', 'adjacent'];

interface TrendsProps {
  siteId: string;
  tier: DiscoveryTier | null;
  isPaid: boolean;
  isAdmin: boolean;
}

function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatLongDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function DiscoveryTrends(props: TrendsProps): React.ReactElement {
  const { siteId, isPaid, isAdmin } = props;

  const [snapshots, setSnapshots] = useState<DiscoveryScoreSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/discovery/trends?siteId=${encodeURIComponent(siteId)}`);
      if (!res.ok) {
        setError('Could not load trend history');
        return;
      }
      const data = await res.json();
      setSnapshots((data.snapshots || []) as DiscoveryScoreSnapshot[]);
    } catch (err) {
      console.error('[DiscoveryTrends] load failed:', err);
      setError('Could not load trend history');
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    void load();
  }, [load]);

  const allowFull = isPaid || isAdmin;

  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];
  const movement = useMemo(() => {
    if (snapshots.length < 2 || !first || !last) return null;
    return {
      scoreDelta: (last.overall_score ?? 0) - (first.overall_score ?? 0),
      strongDelta: last.strong_count - first.strong_count,
      absentDelta: last.absent_count - first.absent_count,
    };
  }, [snapshots, first, last]);

  // ============================================================
  // TEASER GATE
  // ============================================================
  if (!allowFull) {
    return (
      <div
        className="rounded-xl border p-10 text-center"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Trend tracking is part of the full report.</h3>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Upgrade to see how your AI discovery score changes month over month.
        </p>
        <a href="/pricing" className="mt-5 btn-primary px-4 py-2 text-sm font-medium inline-flex items-center gap-2">
          Upgrade
        </a>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className="rounded-xl border p-8 text-center"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading trends…</p>
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

  if (snapshots.length < 2) {
    return (
      <div>
        <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Your AI discovery over time</h3>
        <div
          className="rounded-xl border p-10 text-center"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            We need at least 2 runs to show trends. Come back after your next monthly run, or rerun tests from the Overview tab.
          </p>
          {snapshots.length === 1 && (
            <div
              className="mt-5 inline-flex items-center gap-3 px-4 py-3 rounded-md"
              style={{ background: 'var(--bg-tertiary)' }}
            >
              <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>Latest run</span>
              <span
                className="text-2xl font-bold"
                style={{
                  color: getScoreColor(snapshots[0].overall_score ?? 0),
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {snapshots[0].overall_score ?? 0}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {formatShortDate(snapshots[0].snapshot_date)}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Your AI discovery over time</h3>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {snapshots.length} runs tracked from {formatLongDate(first?.snapshot_date || null)} to {formatLongDate(last?.snapshot_date || null)}.
        </p>
      </div>

      {/* MAIN CHART */}
      <div
        className="rounded-xl border p-4 mb-4"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Overall score</p>
        <LineChart
          snapshots={snapshots}
          getValue={s => s.overall_score ?? 0}
          height={180}
          showYAxis
        />
      </div>

      {/* CLUSTER SPARKLINES */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        {ALL_CLUSTERS.map(cluster => {
          const values = snapshots.map(s => (s.cluster_scores || {})[cluster] ?? null);
          const hasAnyData = values.some(v => typeof v === 'number');
          return (
            <div
              key={cluster}
              className="rounded-xl border p-3"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{clusterLabel(cluster)}</span>
                {hasAnyData && (
                  <span
                    className="text-xs font-bold"
                    style={{
                      color: getScoreColor(values[values.length - 1] ?? 0),
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {values[values.length - 1] ?? '—'}
                  </span>
                )}
              </div>
              {hasAnyData ? (
                <LineChart
                  snapshots={snapshots}
                  getValue={(_s, i) => (values[i] ?? 0)}
                  height={56}
                  compact
                />
              ) : (
                <p className="text-xs text-center py-4" style={{ color: 'var(--text-tertiary)' }}>No data yet</p>
              )}
            </div>
          );
        })}
      </div>

      {/* VISIBILITY DISTRIBUTION */}
      <div
        className="rounded-xl border p-4 mb-4"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Visibility category distribution</p>
        <div className="space-y-2">
          {snapshots.map(s => {
            const total = s.strong_count + s.partial_count + s.absent_count + s.competitor_dominant_count;
            if (total === 0) return null;
            const segments: { key: string; count: number; color: string; label: string }[] = [
              { key: 'strong', count: s.strong_count, color: '#10B981', label: 'Strong' },
              { key: 'partial', count: s.partial_count, color: '#F59E0B', label: 'Partial' },
              { key: 'absent', count: s.absent_count, color: '#EF4444', label: 'Absent' },
              { key: 'competitor', count: s.competitor_dominant_count, color: '#F97316', label: 'Competitor-dominant' },
            ];
            return (
              <div key={s.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {formatShortDate(s.snapshot_date)}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {total} prompts
                  </span>
                </div>
                <div className="flex h-4 rounded-md overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
                  {segments.map(seg => seg.count > 0 && (
                    <div
                      key={seg.key}
                      style={{ width: `${(seg.count / total) * 100}%`, background: seg.color }}
                      title={`${seg.label}: ${seg.count}`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          <LegendDot color="#10B981" label="Strong" />
          <LegendDot color="#F59E0B" label="Partial" />
          <LegendDot color="#EF4444" label="Absent" />
          <LegendDot color="#F97316" label="Competitor-dominant" />
        </div>
      </div>

      {/* MOVEMENT */}
      {movement && first && last && (
        <div
          className="rounded-xl border p-4"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Movement since your first run</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <MovementTile
              label="Overall score"
              delta={movement.scoreDelta}
              positiveGood
              sentence={summarizeMovement('points', movement.scoreDelta, first.snapshot_date)}
            />
            <MovementTile
              label="Strong-presence prompts"
              delta={movement.strongDelta}
              positiveGood
              sentence={summarizeMovement('strong prompts', movement.strongDelta, first.snapshot_date)}
            />
            <MovementTile
              label="Absent prompts"
              delta={movement.absentDelta}
              positiveGood={false}
              sentence={summarizeMovement('absent prompts', movement.absentDelta, first.snapshot_date)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// LineChart — inline SVG
// ============================================================
interface LineChartProps {
  snapshots: DiscoveryScoreSnapshot[];
  getValue: (s: DiscoveryScoreSnapshot, index: number) => number;
  height: number;
  compact?: boolean;
  showYAxis?: boolean;
}

function LineChart({ snapshots, getValue, height, compact, showYAxis }: LineChartProps): React.ReactElement {
  const width = 600;
  const padLeft = showYAxis ? 30 : (compact ? 4 : 10);
  const padRight = compact ? 4 : 10;
  const padTop = compact ? 4 : 10;
  const padBottom = compact ? 4 : 22;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const values = snapshots.map((s, i) => {
    const raw = getValue(s, i);
    return Math.max(0, Math.min(100, typeof raw === 'number' ? raw : 0));
  });

  const n = snapshots.length;
  const xFor = (i: number): number => {
    if (n === 1) return padLeft + innerW / 2;
    return padLeft + (innerW * i) / (n - 1);
  };
  const yFor = (v: number): number => padTop + innerH - (innerH * v) / 100;

  const points = values.map((v, i) => `${xFor(i)},${yFor(v)}`).join(' ');
  const lastValue = values[values.length - 1] ?? 0;
  const lineColor = getScoreColor(lastValue);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Trend line chart">
      {/* Grid + Y-axis labels */}
      {showYAxis && [0, 50, 100].map(y => (
        <g key={y}>
          <line
            x1={padLeft} x2={width - padRight}
            y1={yFor(y)} y2={yFor(y)}
            stroke="var(--border)"
            strokeDasharray="3 3"
          />
          <text
            x={padLeft - 6} y={yFor(y) + 3}
            textAnchor="end"
            fontSize="10"
            fill="var(--text-tertiary)"
          >
            {y}
          </text>
        </g>
      ))}
      {/* Polyline */}
      <polyline
        points={points}
        fill="none"
        stroke={lineColor}
        strokeWidth={2}
      />
      {/* Dots */}
      {values.map((v, i) => (
        <g key={snapshots[i].id}>
          <circle
            cx={xFor(i)} cy={yFor(v)} r={compact ? 2 : 3.5}
            fill={getScoreColor(v)}
          >
            <title>{`${formatShortDate(snapshots[i].snapshot_date)}: ${Math.round(v)}`}</title>
          </circle>
        </g>
      ))}
      {/* X-axis dates */}
      {!compact && snapshots.map((s, i) => (
        <text
          key={s.id}
          x={xFor(i)} y={height - 4}
          textAnchor="middle"
          fontSize="10"
          fill="var(--text-tertiary)"
        >
          {formatShortDate(s.snapshot_date)}
        </text>
      ))}
    </svg>
  );
}

// ============================================================
// Small pieces
// ============================================================
function LegendDot({ color, label }: { color: string; label: string }): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function MovementTile({ label, delta, positiveGood, sentence }: { label: string; delta: number; positiveGood: boolean; sentence: string }): React.ReactElement {
  const isNeutral = delta === 0;
  const isGood = isNeutral ? true : (positiveGood ? delta > 0 : delta < 0);
  const color = isNeutral ? 'var(--text-tertiary)' : (isGood ? '#10B981' : '#EF4444');
  const arrow = isNeutral ? '→' : (delta > 0 ? '↑' : '↓');
  const sign = delta > 0 ? '+' : '';
  return (
    <div
      className="rounded-lg p-3"
      style={{ background: 'var(--bg-tertiary)' }}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
      <p className="mt-1 text-xl font-bold" style={{ color, fontFamily: 'var(--font-mono)' }}>
        {arrow} {sign}{delta}
      </p>
      <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>{sentence}</p>
    </div>
  );
}

function summarizeMovement(noun: string, delta: number, firstDate: string | null): string {
  const since = firstDate ? ` since ${formatLongDate(firstDate)}` : '';
  if (delta === 0) return `No change${since}.`;
  const abs = Math.abs(delta);
  return `${delta > 0 ? 'Up' : 'Down'} ${abs} ${noun}${since}.`;
}
