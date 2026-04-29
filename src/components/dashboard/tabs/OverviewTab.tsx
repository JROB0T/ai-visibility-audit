'use client';

import SeverityRow from '../SeverityRow';
import RadarChart from '@/lib/charts/RadarChart';
import { severityColor } from '@/lib/dashboardColors';
import { clusterLabel } from '@/lib/discovery';
import { scoreToGrade } from '@/components/ScoreRing';
import type {
  DiscoveryCluster,
  DiscoveryInsight,
  DiscoveryRecommendation,
  DiscoveryScoreSnapshot,
} from '@/lib/types';

type FindingSeverity = 'high' | 'medium' | 'low';

interface OverviewTabProps {
  snapshot: DiscoveryScoreSnapshot;
  insights: DiscoveryInsight[];
  recommendations: DiscoveryRecommendation[];
  onTabChange: (id: 'findings' | 'priorities') => void;
}

export default function OverviewTab(props: OverviewTabProps): React.ReactElement {
  const topFindings = [...props.insights]
    .filter((i) => i.category === 'gaps' || i.severity === 'high')
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .slice(0, 3);

  const topPriorities = [...props.recommendations]
    .sort((a, b) => severityRank(a.priority) - severityRank(b.priority))
    .slice(0, 3);

  const overallScore = props.snapshot.overall_score;
  const overallGrade = overallScore !== null ? scoreToGrade(overallScore) : '';

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Headline anatomy block */}
      <section
        className="rounded-xl border p-6"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="grid grid-cols-1 md:grid-cols-[280px,1fr] gap-6">
          <div className="flex justify-center">
            <RadarChart
              clusterScores={props.snapshot.cluster_scores}
              centerLabel={overallScore !== null ? String(overallScore) : '—'}
              centerSubLabel={overallGrade}
            />
          </div>
          <div className="space-y-4">
            <p className="text-base leading-relaxed" style={{ color: 'var(--text-primary)' }}>
              AI tools recommended you in <strong>{props.snapshot.strong_count} of {props.snapshot.prompt_count}</strong> buyer-intent prompts.
              Partial mention in <strong>{props.snapshot.partial_count}</strong> more, absent from <strong>{props.snapshot.absent_count}</strong>.
            </p>
            <ClusterHighlights clusterScores={props.snapshot.cluster_scores} />
          </div>
        </div>
      </section>

      {/* Two-column summary: findings + priorities */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SummaryColumn
          title="Top findings"
          subtitle={`${topFindings.length} of ${props.insights.length} most urgent gaps`}
          items={topFindings.map((i) => ({
            severity: (i.severity || 'medium') as FindingSeverity,
            label: i.linked_cluster ? clusterLabel(i.linked_cluster) : undefined,
            title: i.title,
          }))}
          ctaLabel="See all findings →"
          onCtaClick={() => props.onTabChange('findings')}
          emptyText="No findings flagged for this run."
        />

        <SummaryColumn
          title="Top priorities"
          subtitle={`${topPriorities.length} of ${props.recommendations.length} highest-impact actions`}
          items={topPriorities.map((r) => ({
            severity: (r.priority || 'medium') as FindingSeverity,
            label: undefined,
            title: r.title,
            rightLabel: r.impact_estimate ? `→ ${r.impact_estimate}` : undefined,
          }))}
          ctaLabel="See all priorities →"
          onCtaClick={() => props.onTabChange('priorities')}
          emptyText="No priorities recommended for this run."
        />
      </div>
    </div>
  );
}

function ClusterHighlights({
  clusterScores,
}: {
  clusterScores: Partial<Record<DiscoveryCluster, number>>;
}): React.ReactElement | null {
  const entries = Object.entries(clusterScores).filter(([, v]) => typeof v === 'number') as [DiscoveryCluster, number][];
  if (entries.length === 0) return null;
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  const strongest = sorted[0];
  const weakest = sorted[sorted.length - 1];
  return (
    <div className="space-y-1.5 text-sm">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full" style={{ background: severityColor(strongest[1]) }} />
        <span style={{ color: 'var(--text-secondary)' }}>
          Strongest: <strong style={{ color: 'var(--text-primary)' }}>{clusterLabel(strongest[0])}</strong> ({strongest[1]})
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full" style={{ background: severityColor(weakest[1]) }} />
        <span style={{ color: 'var(--text-secondary)' }}>
          Weakest: <strong style={{ color: 'var(--text-primary)' }}>{clusterLabel(weakest[0])}</strong> ({weakest[1]})
        </span>
      </div>
    </div>
  );
}

function SummaryColumn(props: {
  title: string;
  subtitle: string;
  items: Array<{ severity: FindingSeverity; label?: string; title: string; rightLabel?: string }>;
  ctaLabel: string;
  onCtaClick: () => void;
  emptyText: string;
}): React.ReactElement {
  return (
    <section
      className="rounded-xl border p-6"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div className="mb-4">
        <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
          {props.title}
        </h3>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
          {props.subtitle}
        </p>
      </div>
      <div>
        {props.items.length === 0 ? (
          <p className="text-sm py-6 text-center" style={{ color: 'var(--text-tertiary)' }}>
            {props.emptyText}
          </p>
        ) : (
          props.items.map((item, i) => (
            <SeverityRow
              key={i}
              severity={item.severity}
              label={item.label}
              title={item.title}
              rightLabel={item.rightLabel}
            />
          ))
        )}
      </div>
      <button
        type="button"
        onClick={props.onCtaClick}
        className="mt-4 text-sm font-medium transition"
        style={{ color: 'var(--accent)' }}
      >
        {props.ctaLabel}
      </button>
    </section>
  );
}

function severityRank(s: string | null | undefined): number {
  if (s === 'high') return 0;
  if (s === 'medium') return 1;
  return 2;
}
