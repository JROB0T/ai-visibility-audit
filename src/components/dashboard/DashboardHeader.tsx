'use client';

import { ArrowLeft, ChevronRight, FileText, RefreshCw, Sparkles } from 'lucide-react';
import { scoreToGrade } from '@/components/ScoreRing';

interface SiteReadinessSubScores {
  crawlability: number | null;
  machineReadability: number | null;
  commercialClarity: number | null;
  trustClarity: number | null;
}

interface DashboardHeaderProps {
  auditId: string;
  domain: string;
  businessName?: string | null;
  overallScore: number | null;
  grade: string | null;
  strategicPosture: string | null;
  snapshotDate: string | null;
  pagesScanned: number;
  hasPaid: boolean;
  onRunDiscovery?: () => void;
  isRunningDiscovery: boolean;
  reportAvailable: boolean;

  // Phase 1.6 — Site Readiness tile data
  siteReadinessScore: number | null;
  siteReadinessGrade: string | null;
  siteReadinessSubScores: SiteReadinessSubScores;
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Not yet run';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Not yet run';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function smoothScrollTo(elementId: string): void {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(elementId);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function gradeColor(score: number): string {
  if (score >= 85) return '#10B981';
  if (score >= 70) return '#F59E0B';
  if (score >= 55) return '#6B7280';
  return '#EF4444';
}

function countMeasuredAreas(subScores: SiteReadinessSubScores): number {
  return Object.values(subScores).filter((v) => v !== null).length;
}

export default function DashboardHeader({
  auditId,
  domain,
  businessName,
  overallScore,
  grade,
  strategicPosture,
  snapshotDate,
  pagesScanned,
  hasPaid,
  onRunDiscovery,
  isRunningDiscovery,
  reportAvailable,
  siteReadinessScore,
  siteReadinessGrade,
  siteReadinessSubScores,
}: DashboardHeaderProps): React.ReactElement {
  const displayName = businessName || domain || 'Your business';
  const hasSnapshot = overallScore !== null;
  const aiPerceptionGrade = grade || (hasSnapshot && overallScore !== null ? scoreToGrade(overallScore) : null);
  const hasReadiness = siteReadinessScore !== null;

  // Phase 1.5a placeholder. Real subscription-gated re-runs ship in 1.5b.
  const handleRerunClick = () => {
    alert(
      'Re-run analysis requires an active subscription.\n\n' +
      'Subscriptions launch with our next update. ' +
      'You’ll be able to keep your AI positioning fresh with monthly tracking.',
    );
  };

  return (
    <header className="mb-10">
      {/* Row 1 — breadcrumb */}
      <a
        href="/dashboard"
        className="text-xs inline-flex items-center gap-1 mb-3"
        style={{ color: '#6366F1' }}
      >
        <ArrowLeft className="w-3 h-3" />
        Dashboard
      </a>

      {/* Row 2/3 — title + actions */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold truncate" style={{ color: 'var(--text-primary)' }}>
            {displayName}
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>
            {domain}
            {pagesScanned > 0 && ` · ${pagesScanned} pages scanned`}
            {snapshotDate && ` · last run ${formatDate(snapshotDate)}`}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {hasPaid && hasSnapshot && reportAvailable && (
            <a
              href={`/audit/${auditId}/report`}
              className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm font-medium"
            >
              <FileText className="w-4 h-4" />
              View Full Report
            </a>
          )}
          {hasPaid && hasSnapshot && (
            <button
              type="button"
              onClick={handleRerunClick}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded border transition-colors"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              <RefreshCw className="w-3 h-3" />
              Re-run analysis
            </button>
          )}
          {hasPaid && !hasSnapshot && onRunDiscovery && (
            <button
              type="button"
              onClick={onRunDiscovery}
              disabled={isRunningDiscovery}
              className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm font-medium"
            >
              <Sparkles className="w-4 h-4" />
              {isRunningDiscovery ? 'Running…' : 'Run AI Discovery'}
            </button>
          )}
        </div>
      </div>

      {/* Row 4 — score tiles */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* AI PERCEPTION TILE — primary (visual dominance via posture chip) */}
        <button
          type="button"
          onClick={() => smoothScrollTo('how-ai-sees-you')}
          className="text-left p-6 rounded-xl border transition hover:shadow-sm cursor-pointer"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-baseline justify-between mb-3">
            <p className="text-xs uppercase tracking-wider font-medium" style={{ color: 'var(--text-tertiary)' }}>
              How AI sees you
            </p>
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
          </div>

          {hasSnapshot ? (
            <>
              <div className="flex items-baseline gap-3 mb-2">
                <span className="text-5xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  {overallScore}
                </span>
                {aiPerceptionGrade && (
                  <span
                    className="px-2 py-1 rounded text-xs font-medium"
                    style={{ background: gradeColor(overallScore as number), color: '#fff', fontFamily: 'var(--font-mono)' }}
                  >
                    {aiPerceptionGrade}
                  </span>
                )}
              </div>
              {strategicPosture && (
                <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  {strategicPosture}
                </p>
              )}
              <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
                AI visibility across buyer-intent prompts
              </p>
            </>
          ) : (
            <EmptyTileContent label="Run AI Discovery to see your score" />
          )}
        </button>

        {/* SITE READINESS TILE — supporting */}
        <button
          type="button"
          onClick={() => smoothScrollTo('site-readiness')}
          className="text-left p-6 rounded-xl border transition hover:shadow-sm cursor-pointer"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-baseline justify-between mb-3">
            <p className="text-xs uppercase tracking-wider font-medium" style={{ color: 'var(--text-tertiary)' }}>
              Site readiness
            </p>
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
          </div>

          {hasReadiness ? (
            <>
              <div className="flex items-baseline gap-3 mb-2">
                <span className="text-5xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  {siteReadinessScore}
                </span>
                {siteReadinessGrade && (
                  <span
                    className="px-2 py-1 rounded text-xs font-medium"
                    style={{ background: gradeColor(siteReadinessScore as number), color: '#fff', fontFamily: 'var(--font-mono)' }}
                  >
                    {siteReadinessGrade}
                  </span>
                )}
              </div>
              <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
                {countMeasuredAreas(siteReadinessSubScores)} areas measured
              </p>
            </>
          ) : (
            <EmptyTileContent label="Site scan not completed" />
          )}
        </button>
      </div>
    </header>
  );
}

function EmptyTileContent({ label }: { label: string }): React.ReactElement {
  return (
    <>
      <div className="flex items-baseline gap-3 mb-2">
        <span className="text-5xl font-bold" style={{ color: 'var(--text-tertiary)' }}>—</span>
      </div>
      <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
        {label}
      </p>
    </>
  );
}
