'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
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

interface DeltasResponse {
  hasPrevious: boolean;
  previousAuditDate: string | null;
  deltas: {
    crawlability: number | null;
    machineReadability: number | null;
    commercialClarity: number | null;
    trustClarity: number | null;
    overall: number | null;
  } | null;
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

function formatDeltaDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

  const [deltas, setDeltas] = useState<DeltasResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/audit/${auditId}/site-readiness-deltas`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: DeltasResponse | null) => {
        if (!cancelled && data) setDeltas(data);
      })
      .catch(() => { /* silent */ });
    return () => { cancelled = true; };
  }, [auditId]);

  return (
    <div id="site-readiness" style={{ scrollMarginTop: '24px' }}>
      <DashboardSection
        title="Site readiness"
        subtitle="What about your site is helping or hurting AI's ability to recommend you"
        reportPage={7}
        reportAuditId={auditId}
        reportAvailable={reportAvailable}
      >
        {deltas?.hasPrevious && deltas.deltas && (
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
            <span style={{ color: 'var(--text-tertiary)' }}>
              Since previous scan ({formatDeltaDate(deltas.previousAuditDate)}):
            </span>
            <DeltaPill label="Crawlability" delta={deltas.deltas.crawlability} />
            <DeltaPill label="Machine Readability" delta={deltas.deltas.machineReadability} />
            <DeltaPill label="Commercial Clarity" delta={deltas.deltas.commercialClarity} />
            <DeltaPill label="Trust" delta={deltas.deltas.trustClarity} />
          </div>
        )}

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
    </div>
  );
}

function DeltaPill({ label, delta }: { label: string; delta: number | null }): React.ReactElement | null {
  if (delta === null) return null;
  if (delta === 0) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full"
        style={{ background: 'var(--surface)', color: 'var(--text-tertiary)', fontSize: '11px' }}
      >
        <Minus className="w-3 h-3" />
        {label}
      </span>
    );
  }
  const isUp = delta > 0;
  const color = isUp ? '#10B981' : '#EF4444';
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium"
      style={{ background: `${color}20`, color, fontSize: '11px' }}
    >
      {isUp ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
      {label} {isUp ? '+' : ''}{delta}
    </span>
  );
}
