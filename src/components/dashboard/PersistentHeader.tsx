'use client';

import Link from 'next/link';
import { ArrowLeft, FileText, RefreshCw } from 'lucide-react';
import StatPair from './StatPair';
import TabNav, { type DashboardTabId } from './TabNav';

interface PersistentHeaderProps {
  auditId: string;
  domain: string;
  snapshotDate: string | null;
  pagesScanned: number;

  // AI Visibility (discovery)
  aiScore: number | null;
  aiGrade: string | null;

  // Site Readiness (audit)
  readinessScore: number | null;
  readinessGrade: string | null;

  hasPaid: boolean;
  reportAvailable: boolean;
  onRerun: () => void;

  activeTab: DashboardTabId;
  onTabChange: (id: DashboardTabId) => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function PersistentHeader(props: PersistentHeaderProps): React.ReactElement {
  return (
    <header
      className="sticky top-0 z-20 backdrop-blur"
      style={{
        background: 'color-mix(in srgb, var(--background) 92%, transparent)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-3 pb-0">
        {/* Top row: identity + actions */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="min-w-0">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1 text-xs mb-1"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <ArrowLeft className="w-3 h-3" /> Dashboard
            </Link>
            <h1 className="text-xl font-bold truncate" style={{ color: 'var(--text-primary)' }}>
              {props.domain}
            </h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              {props.pagesScanned} pages · scanned {props.snapshotDate ? formatDate(props.snapshotDate) : '—'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {props.hasPaid && (
              <button
                type="button"
                onClick={props.onRerun}
                className="text-xs px-3 py-1.5 rounded-md border inline-flex items-center gap-1.5 transition hover:bg-black/5"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Re-run analysis
              </button>
            )}
            {props.hasPaid && props.reportAvailable && (
              <Link
                href={`/audit/${props.auditId}/report`}
                className="text-xs px-3 py-1.5 rounded-md inline-flex items-center gap-1.5 font-medium transition"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                <FileText className="w-3.5 h-3.5" />
                View Full Report
              </Link>
            )}
          </div>
        </div>

        {/* Score row: two small stat pairs side by side */}
        {props.hasPaid && (
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3 mb-3">
            <StatPair
              label="AI Visibility"
              value={props.aiScore}
              scoreForColor={props.aiScore}
              grade={props.aiGrade}
              size="md"
              subtitle="Across buyer-intent prompts"
            />
            <StatPair
              label="Site Readiness"
              value={props.readinessScore}
              scoreForColor={props.readinessScore}
              grade={props.readinessGrade}
              size="md"
              subtitle="Technical AI-friendliness"
            />
          </div>
        )}

        {/* Tab nav */}
        <div style={{ borderTop: '1px solid var(--border)', marginTop: '8px' }}>
          <TabNav active={props.activeTab} onChange={props.onTabChange} />
        </div>
      </div>
    </header>
  );
}
