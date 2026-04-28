'use client';

import ScoreRing, { getScoreColor, scoreToGrade } from '@/components/ScoreRing';
import DashboardSection from './DashboardSection';

type CategoryKey = 'findability' | 'explainability' | 'buyability' | 'trustworthiness';

interface SiteReadinessProps {
  crawlabilityScore: number | null;
  machineReadabilityScore: number | null;
  commercialClarityScore: number | null;
  trustClarityScore: number | null;
  auditId: string;
  reportAvailable: boolean;
}

function statusSentence(score: number, category: CategoryKey): string {
  const good: Record<CategoryKey, string> = {
    findability: 'AI systems can find your site easily.',
    explainability: 'AI can clearly explain what you do.',
    buyability: 'AI can help someone buy from you.',
    trustworthiness: 'AI sees strong trust signals.',
  };
  const partial: Record<CategoryKey, string> = {
    findability: 'Some AI systems have trouble finding your site.',
    explainability: 'AI only partially understands what you offer.',
    buyability: 'AI struggles to guide buyers to your business.',
    trustworthiness: 'Trust signals are present but incomplete.',
  };
  const poor: Record<CategoryKey, string> = {
    findability: 'Most AI systems cannot find your site.',
    explainability: 'AI cannot explain what your business does.',
    buyability: 'AI cannot help someone buy from you.',
    trustworthiness: 'AI lacks confidence to recommend you.',
  };
  if (score >= 80) return good[category];
  if (score >= 60) return partial[category];
  return poor[category];
}

interface CardSpec {
  category: CategoryKey;
  label: string;
  question: string;
  score: number | null;
}

export default function SiteReadiness({
  crawlabilityScore,
  machineReadabilityScore,
  commercialClarityScore,
  trustClarityScore,
  auditId,
  reportAvailable,
}: SiteReadinessProps): React.ReactElement {
  const cards: CardSpec[] = [
    { category: 'findability',     label: 'Findability',     question: 'Can AI find you?',              score: crawlabilityScore },
    { category: 'explainability',  label: 'Explainability',  question: 'Can AI explain what you do?',   score: machineReadabilityScore },
    { category: 'buyability',      label: 'Buyability',      question: 'Can AI help someone buy?',      score: commercialClarityScore },
    { category: 'trustworthiness', label: 'Trustworthiness', question: 'Can AI trust you?',             score: trustClarityScore },
  ];

  return (
    <DashboardSection
      title="Site readiness"
      subtitle="What about your site is helping or hurting AI's ability to recommend you"
      reportPage={7}
      reportAuditId={auditId}
      reportAvailable={reportAvailable}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cards.map((card) => {
          const hasScore = typeof card.score === 'number';
          const score = hasScore ? (card.score as number) : 0;
          const color = hasScore ? getScoreColor(score) : 'var(--text-tertiary)';
          const grade = hasScore ? scoreToGrade(score) : '—';
          return (
            <div
              key={card.category}
              className="rounded-xl border p-5 flex items-start gap-4"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <div className="shrink-0">
                {hasScore ? (
                  <ScoreRing score={score} size={88} strokeWidth={8} />
                ) : (
                  <div
                    className="flex items-center justify-center rounded-full border"
                    style={{ width: 88, height: 88, borderColor: 'var(--border)' }}
                  >
                    <span className="text-2xl font-bold" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                      —
                    </span>
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className="text-xs uppercase tracking-wide font-medium mb-1"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {card.label}
                </p>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {card.question}
                  </p>
                  <span
                    className="text-base font-bold shrink-0"
                    style={{ color, fontFamily: 'var(--font-mono)' }}
                  >
                    {grade}
                  </span>
                </div>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {hasScore
                    ? statusSentence(score, card.category)
                    : 'No data — re-run the audit to populate.'}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </DashboardSection>
  );
}
