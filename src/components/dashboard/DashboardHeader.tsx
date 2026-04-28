'use client';

import { ArrowLeft, FileText, RefreshCw, Sparkles } from 'lucide-react';
import { getScoreColor, scoreToGrade } from '@/components/ScoreRing';

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
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Not yet run';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Not yet run';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
}: DashboardHeaderProps): React.ReactElement {
  const displayName = businessName || domain || 'Your business';
  const hasSnapshot = overallScore !== null;
  const effectiveGrade = grade || (hasSnapshot && overallScore !== null ? scoreToGrade(overallScore) : null);
  const scoreColor = hasSnapshot && overallScore !== null ? getScoreColor(overallScore) : 'var(--text-tertiary)';

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

      {/* Row 4 — stat strip */}
      <div
        className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-xl border p-4"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <StatCell
          label="AI Discovery Score"
          value={
            hasSnapshot ? (
              <span className="inline-flex items-baseline gap-2">
                <span
                  className="text-2xl font-bold"
                  style={{ color: scoreColor, fontFamily: 'var(--font-mono)' }}
                >
                  {overallScore}
                </span>
                {effectiveGrade && (
                  <span
                    className="inline-flex px-2 py-0.5 text-xs font-bold rounded-full"
                    style={{ color: scoreColor, background: `${scoreColor}20`, fontFamily: 'var(--font-mono)' }}
                  >
                    {effectiveGrade}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-2xl font-bold" style={{ color: 'var(--text-tertiary)' }}>—</span>
            )
          }
          subtitle={hasSnapshot ? null : 'Run discovery to see your score'}
        />
        <StatCell
          label="Strategic Posture"
          value={
            <span
              className="text-base font-semibold"
              style={{ color: strategicPosture ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
            >
              {strategicPosture || '—'}
            </span>
          }
        />
        <StatCell
          label="Last run"
          value={
            <span
              className="text-base font-semibold"
              style={{ color: snapshotDate ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
            >
              {formatDate(snapshotDate)}
            </span>
          }
        />
      </div>
    </header>
  );
}

function StatCell({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: React.ReactNode;
  subtitle?: string | null;
}): React.ReactElement {
  return (
    <div>
      <p
        className="text-xs uppercase tracking-wide font-medium mb-1.5"
        style={{ color: 'var(--text-tertiary)' }}
      >
        {label}
      </p>
      <div>{value}</div>
      {subtitle && (
        <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
