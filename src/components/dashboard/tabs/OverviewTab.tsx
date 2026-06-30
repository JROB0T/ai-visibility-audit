'use client';

// ============================================================
// OverviewTab — high-level summary.
//
// 2026-06-30 consolidation: the headline is now the AIVA Score
// (simple arithmetic mean of AI Visibility Score and Site
// Readiness Score). Component scores are surfaced beneath so the
// two are explicit and the conflict Mike flagged ("Overview says
// F, Site Readiness says B") is impossible to recreate.
//
// "See all priorities" was a broken link (no destination existed
// for non-tier_2 users); both summary CTAs now land on Findings,
// which has been rebuilt as the unified stack-ranked action list.
// ============================================================

import SeverityRow from '../SeverityRow';
import { scoreToGrade, getScoreColor } from '@/components/ScoreRing';
import { severityColor } from '@/lib/dashboardColors';
import { clusterLabel } from '@/lib/discovery';
import type {
  DiscoveryInsight,
  DiscoveryRecommendation,
  DiscoveryScoreSnapshot,
} from '@/lib/types';

type FindingSeverity = 'high' | 'medium' | 'low';

interface OverviewTabProps {
  snapshot: DiscoveryScoreSnapshot;
  insights: DiscoveryInsight[];
  recommendations: DiscoveryRecommendation[];
  /** Site Readiness Score (audit.overall_score). Null = not computed. */
  siteReadinessScore: number | null;
  onTabChange: (id: 'findings') => void;
}

/**
 * AIVA Score = simple arithmetic mean of the two component scores.
 * If only one is available, the AIVA Score equals that one. Null
 * only when both are missing.
 */
function computeAivaScore(ai: number | null, readiness: number | null): number | null {
  if (ai === null && readiness === null) return null;
  if (ai === null) return readiness;
  if (readiness === null) return ai;
  return Math.round((ai + readiness) / 2);
}

export default function OverviewTab(props: OverviewTabProps): React.ReactElement {
  const aiScore = props.snapshot.overall_score;
  const readinessScore = props.siteReadinessScore;
  const aivaScore = computeAivaScore(aiScore, readinessScore);

  // Top items for the two summary columns. Both now route to Findings
  // (which is the merged ranked action list).
  const topFindings = [...props.insights]
    .filter((i) => i.category === 'gaps' || i.severity === 'high')
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .slice(0, 3);
  const topPriorities = [...props.recommendations]
    .sort((a, b) => severityRank(a.priority) - severityRank(b.priority))
    .slice(0, 3);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Headline: AIVA Score */}
      <section
        className="rounded-xl border p-6 sm:p-8"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="grid grid-cols-1 md:grid-cols-[260px,1fr] gap-8 items-center">
          <div className="flex justify-center">
            <ScoreCircle
              score={aivaScore}
              label="AIVA Score"
            />
          </div>
          <div className="space-y-4">
            <div>
              <h2
                className="text-sm font-bold uppercase tracking-wider mb-2"
                style={{ color: 'var(--text-tertiary)' }}
              >
                What this means
              </h2>
              <p className="text-base leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                Your AIVA Score blends two measures: how often AI assistants
                surface or recommend you (<strong>AI Visibility</strong>) and
                how legible your website is to AI crawlers
                (<strong>Site Readiness</strong>). A higher AIVA Score means
                more AI assistants confidently know and recommend your
                business.
              </p>
            </div>
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              AI tools recommended you in{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                {props.snapshot.strong_count} of {props.snapshot.prompt_count}
              </strong>{' '}
              buyer-intent prompts. Partial mention in{' '}
              <strong>{props.snapshot.partial_count}</strong> more, absent from{' '}
              <strong>{props.snapshot.absent_count}</strong>.
            </div>
          </div>
        </div>

        {/* Component scores side by side */}
        <div className="mt-8 pt-6 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ComponentScoreCard
              label="AI Visibility"
              score={aiScore}
              description="How AI assistants answer about your business"
            />
            <ComponentScoreCard
              label="Site Readiness"
              score={readinessScore}
              description="How legible your site is to AI crawlers"
            />
          </div>
        </div>
      </section>

      {/* Two-column summary: findings + priorities — both go to Findings now */}
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
          onCtaClick={() => props.onTabChange('findings')}
          emptyText="No priorities recommended for this run."
        />
      </div>
    </div>
  );
}

// ----- Score circle (headline) -----
function ScoreCircle({ score, label }: { score: number | null; label: string }): React.ReactElement {
  const display = score === null ? '—' : String(score);
  const grade = score === null ? '' : scoreToGrade(score);
  const color = score === null ? '#94A3B8' : getScoreColor(score);
  const r = 90;
  const C = 2 * Math.PI * r;
  const filled = score === null ? 0 : (C * score) / 100;
  return (
    <div className="flex flex-col items-center">
      <svg width="220" height="220" viewBox="0 0 220 220">
        <circle cx="110" cy="110" r={r} fill="none" stroke="#1E293B" strokeOpacity={0.12} strokeWidth="14" />
        <circle
          cx="110" cy="110" r={r}
          fill="none" stroke={color} strokeWidth="14" strokeLinecap="round"
          strokeDasharray={`${filled} ${C}`}
          transform="rotate(-90 110 110)"
        />
        <text x="110" y="118" textAnchor="middle" fontSize="56" fontWeight="800" fill="var(--text-primary)" style={{ fill: 'currentColor' }}>{display}</text>
      </svg>
      <p className="mt-2 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
        {label}
      </p>
      {grade && (
        <p className="mt-1 text-sm font-semibold" style={{ color }}>Grade: {grade}</p>
      )}
    </div>
  );
}

// ----- Component score card (one each for AI Visibility, Site Readiness) -----
function ComponentScoreCard({
  label,
  score,
  description,
}: {
  label: string;
  score: number | null;
  description: string;
}): React.ReactElement {
  const color = score === null ? '#94A3B8' : getScoreColor(score);
  const grade = score === null ? '—' : scoreToGrade(score);
  return (
    <div
      className="rounded-lg border p-4 flex items-center gap-4"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
    >
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center shrink-0"
        style={{ background: `${color}1a`, color, border: `2px solid ${color}` }}
      >
        <span className="text-lg font-extrabold">{score === null ? '—' : score}</span>
      </div>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</p>
          <p className="text-xs font-medium" style={{ color }}>{grade}</p>
        </div>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{description}</p>
      </div>
    </div>
  );
}

// ----- Summary column (unchanged from before; CTAs both go to findings) -----
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

// severityColor imported but not used in this revision — kept for
// potential future use in the component score breakdowns.
void severityColor;
