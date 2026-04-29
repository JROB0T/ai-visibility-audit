'use client';

import SeverityRow from '../SeverityRow';
import type { LosingGroundEntry } from '@/lib/competitorAggregation';
import { CLUSTER_LABELS } from '@/lib/competitorAggregation';

interface LosingGroundProps {
  entries: LosingGroundEntry[];
}

export default function LosingGround({ entries }: LosingGroundProps): React.ReactElement {
  if (entries.length === 0) {
    return (
      <div className="py-6 text-center max-w-md mx-auto">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          You&rsquo;re holding your ground in every cluster — no competitor appeared more often
          than you in any category.
        </p>
      </div>
    );
  }

  return (
    <div>
      {entries.map((e, i) => (
        <SeverityRow
          key={`${e.cluster}-${e.competitorName}-${i}`}
          severity="high"
          label={CLUSTER_LABELS[e.cluster]}
          title={`${e.competitorName} appeared in ${e.competitorAppearances} of ${e.totalPrompts} prompts`}
          subtitle={`You appeared in ${e.yourAppearances} of ${e.totalPrompts}. Gap: ${e.competitorAppearances - e.yourAppearances} prompts.`}
        />
      ))}
    </div>
  );
}
