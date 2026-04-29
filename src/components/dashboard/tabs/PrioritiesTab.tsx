'use client';

import { useMemo, useState } from 'react';
import SeverityRow from '../SeverityRow';
import type { DiscoveryRecommendation } from '@/lib/types';

// TODO Phase 3: introduce defense_vs_expansion field on DiscoveryRecommendation
// produced by the rec generator, then group rows under those buckets here.
// For Phase 2 we ship a flat priority sort.

interface PrioritiesTabProps {
  recommendations: DiscoveryRecommendation[];
  onRecDrilldown: (recId: string) => void;
}

type PriorityFilter = 'all' | 'high' | 'medium' | 'low';

export default function PrioritiesTab(props: PrioritiesTabProps): React.ReactElement {
  const [filter, setFilter] = useState<PriorityFilter>('all');

  const sorted = useMemo(() => {
    let out = [...props.recommendations];
    if (filter !== 'all') out = out.filter((r) => r.priority === filter);
    out.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
    return out;
  }, [props.recommendations, filter]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <section
        className="rounded-xl border p-6"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2
              className="text-sm font-bold uppercase tracking-wider"
              style={{ color: 'var(--text-primary)' }}
            >
              Recommended moves ({sorted.length})
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              Ordered by priority. Click a row for the full rationale.
            </p>
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as PriorityFilter)}
            className="px-2 py-1 rounded border text-xs cursor-pointer"
            style={{
              background: 'var(--background)',
              borderColor: 'var(--border)',
              color: 'var(--text-secondary)',
            }}
          >
            <option value="all">All priorities</option>
            <option value="high">High only</option>
            <option value="medium">Medium only</option>
            <option value="low">Low only</option>
          </select>
        </div>

        {sorted.length === 0 ? (
          <p className="text-sm py-8 text-center" style={{ color: 'var(--text-tertiary)' }}>
            No priorities match your filters.
          </p>
        ) : (
          sorted.map((rec, i) => (
            <SeverityRow
              key={rec.id}
              severity={(rec.priority || 'medium') as 'high' | 'medium' | 'low'}
              label={String(i + 1).padStart(2, '0')}
              title={rec.title}
              subtitle={subtitleFor(rec)}
              rightLabel={rec.impact_estimate ? `→ ${rec.impact_estimate}` : undefined}
              onClick={() => props.onRecDrilldown(rec.id)}
            />
          ))
        )}
      </section>
    </div>
  );
}

function subtitleFor(rec: DiscoveryRecommendation): string | undefined {
  const parts: string[] = [];
  if (rec.impact_estimate) parts.push(`Impact: ${rec.impact_estimate}`);
  if (rec.difficulty_estimate) parts.push(`Effort: ${rec.difficulty_estimate}`);
  if (rec.owner_type) parts.push(humanOwner(rec.owner_type));
  if (rec.suggested_timeline) parts.push(rec.suggested_timeline);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function humanOwner(o: DiscoveryRecommendation['owner_type']): string {
  switch (o) {
    case 'developer':      return 'Developer';
    case 'marketer':       return 'Marketer';
    case 'business_owner': return 'Business owner';
    default:               return 'Team';
  }
}

function priorityRank(p: string | null | undefined): number {
  if (p === 'high') return 0;
  if (p === 'medium') return 1;
  return 2;
}
