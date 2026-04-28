'use client';

import { useEffect, useState } from 'react';
import { visibilityStatusLabel } from '@/lib/discovery';
import { getScoreColor } from '@/components/ScoreRing';
import type {
  DiscoveryCluster,
  DiscoveryResult,
  DiscoveryVisibilityStatus,
} from '@/lib/types';

interface ClusterDrilldownProps {
  siteId: string;
  cluster: DiscoveryCluster;
}

function statusBg(status: DiscoveryVisibilityStatus | null): string {
  switch (status) {
    case 'strong_presence':       return 'rgba(16,185,129,0.15)';
    case 'partial_presence':
    case 'indirect_presence':     return 'rgba(245,158,11,0.15)';
    case 'absent':
    case 'competitor_dominant':
    case 'directory_dominant':    return 'rgba(239,68,68,0.15)';
    case 'unclear':
    default:                      return 'rgba(148,163,184,0.15)';
  }
}

function statusColor(status: DiscoveryVisibilityStatus | null): string {
  switch (status) {
    case 'strong_presence':       return '#10B981';
    case 'partial_presence':
    case 'indirect_presence':     return '#F59E0B';
    case 'absent':
    case 'competitor_dominant':
    case 'directory_dominant':    return '#EF4444';
    case 'unclear':
    default:                      return '#94A3B8';
  }
}

export default function ClusterDrilldown({
  siteId,
  cluster,
}: ClusterDrilldownProps): React.ReactElement {
  const [results, setResults] = useState<DiscoveryResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/discovery/results?siteId=${encodeURIComponent(siteId)}`);
        if (!res.ok) {
          if (!cancelled) setError('Could not load cluster details.');
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        const all = (data.results || []) as DiscoveryResult[];
        setResults(all.filter(r => r.prompt_cluster === cluster && !r.suppressed));
      } catch {
        if (!cancelled) setError('Could not load cluster details.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [siteId, cluster]);

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading prompts…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-6">
        <p className="text-sm" style={{ color: '#F87171' }}>{error}</p>
      </div>
    );
  }
  if (results.length === 0) {
    return (
      <div className="p-6">
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          No prompts in this cluster yet — run discovery to populate.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-3">
      {results.map((r) => {
        const score = typeof r.prompt_score === 'number' ? r.prompt_score : null;
        const scoreColor = score !== null ? getScoreColor(score) : 'var(--text-tertiary)';
        const sBg = statusBg(r.visibility_status);
        const sColor = statusColor(r.visibility_status);
        return (
          <div
            key={r.id}
            className="rounded-xl border p-4"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <p className="text-sm font-medium flex-1" style={{ color: 'var(--text-primary)' }}>
                {r.prompt_text}
              </p>
              {score !== null && (
                <span
                  className="text-sm font-bold shrink-0"
                  style={{ color: scoreColor, fontFamily: 'var(--font-mono)' }}
                >
                  {score}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {r.visibility_status && (
                <span
                  className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full"
                  style={{ color: sColor, background: sBg }}
                >
                  {visibilityStatusLabel(r.visibility_status)}
                </span>
              )}
              {r.business_mentioned && (
                <span
                  className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full"
                  style={{ color: '#10B981', background: 'rgba(16,185,129,0.12)' }}
                >
                  Mentioned
                </span>
              )}
              {!r.business_mentioned && r.competitor_mentioned && (
                <span
                  className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full"
                  style={{ color: '#F97316', background: 'rgba(249,115,22,0.12)' }}
                >
                  Competitor surfaced
                </span>
              )}
            </div>
            {r.result_type_summary && (
              <p className="mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <span className="font-medium" style={{ color: 'var(--text-tertiary)' }}>What AI led with: </span>
                {r.result_type_summary}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
