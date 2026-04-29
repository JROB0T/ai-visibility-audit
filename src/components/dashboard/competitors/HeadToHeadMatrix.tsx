'use client';

import type { MatrixData } from '@/lib/competitorAggregation';
import { CLUSTER_LABELS_SHORT } from '@/lib/competitorAggregation';
import { severityColor } from '@/lib/dashboardColors';

interface HeadToHeadMatrixProps {
  matrix: MatrixData;
  yourLabel?: string;
  maxColumns?: number;
}

export default function HeadToHeadMatrix({
  matrix,
  yourLabel = 'You',
  maxColumns = 4,
}: HeadToHeadMatrixProps): React.ReactElement {
  const visibleCompetitors = matrix.competitorRows.slice(0, maxColumns);
  const hiddenCount = Math.max(0, matrix.competitorRows.length - maxColumns);

  if (matrix.competitorRows.length === 0) {
    return (
      <div className="py-8 text-center max-w-md mx-auto">
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          No competitors are appearing in your AI answers yet. As discovery runs detect rivals,
          they&rsquo;ll appear here side-by-side.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table
        className="w-full text-sm"
        style={{ borderCollapse: 'separate', borderSpacing: 0 }}
      >
        <thead>
          <tr>
            <th
              className="text-left text-xs uppercase tracking-wider font-medium pb-3 pr-4"
              style={{ color: 'var(--text-tertiary)' }}
            >
              Cluster
            </th>
            <th
              className="text-center text-xs uppercase tracking-wider font-medium pb-3 px-3"
              style={{ color: 'var(--text-primary)', minWidth: '90px' }}
            >
              {yourLabel}
            </th>
            {visibleCompetitors.map((c) => (
              <th
                key={c.normalizedName}
                className="text-center text-xs font-medium pb-3 px-3"
                style={{
                  color: c.isTracked ? 'var(--text-primary)' : 'var(--text-secondary)',
                  minWidth: '110px',
                }}
              >
                <div className="truncate" title={c.displayName}>
                  {c.displayName}
                </div>
                {!c.isTracked && (
                  <div
                    className="text-[10px] uppercase tracking-wider mt-0.5"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    detected
                  </div>
                )}
              </th>
            ))}
            {hiddenCount > 0 && (
              <th
                className="text-center text-xs font-medium pb-3 px-3"
                style={{ color: 'var(--text-tertiary)' }}
              >
                +{hiddenCount} more
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {matrix.clusters.map((cluster) => {
            const you = matrix.yourPresenceByCluster.get(cluster);
            const yourAppeared = you?.appeared ?? 0;
            const total = you?.total ?? 0;
            return (
              <tr key={cluster} className="border-t" style={{ borderColor: 'var(--border)' }}>
                <td className="py-3 pr-4 font-medium" style={{ color: 'var(--text-primary)' }}>
                  {CLUSTER_LABELS_SHORT[cluster]}
                </td>
                <td className="py-3 px-3 text-center">
                  <PresenceCell appeared={yourAppeared} total={total} highlight={false} />
                </td>
                {visibleCompetitors.map((comp) => {
                  const compCount = comp.clusterCounts.get(cluster) || 0;
                  const isThreat = total > 0 && compCount > yourAppeared;
                  return (
                    <td key={comp.normalizedName} className="py-3 px-3 text-center">
                      <PresenceCell appeared={compCount} total={total} highlight={isThreat} />
                    </td>
                  );
                })}
                {hiddenCount > 0 && <td className="py-3 px-3" />}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div
        className="mt-4 flex items-center gap-4 text-xs"
        style={{ color: 'var(--text-tertiary)' }}
      >
        <span className="inline-flex items-center gap-1.5">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: severityColor(50) }}
          />
          appeared more than you in this cluster
        </span>
      </div>
    </div>
  );
}

interface PresenceCellProps {
  appeared: number;
  total: number;
  highlight: boolean;
}

function PresenceCell({ appeared, total, highlight }: PresenceCellProps): React.ReactElement {
  if (total === 0) {
    return <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>—</span>;
  }
  const cap = 5;
  const dots = Math.min(total, cap);
  const filled = Math.round((appeared / total) * dots);
  const dotColor = highlight ? severityColor(50) : 'var(--text-secondary)';

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <div className="flex gap-0.5">
        {Array.from({ length: dots }).map((_, i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: i < filled ? dotColor : 'transparent',
              border: `1px solid ${dotColor}`,
              opacity: i < filled ? 1 : 0.4,
            }}
          />
        ))}
      </div>
      <div
        className="text-xs tabular-nums"
        style={{
          color: highlight ? severityColor(50) : 'var(--text-secondary)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {appeared}/{total}
        {highlight && ' ★'}
      </div>
    </div>
  );
}
