'use client';

import { ArrowUpRight } from 'lucide-react';

export type ReportPageNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;

interface DashboardSectionProps {
  title: string;
  subtitle?: string;
  reportPage?: ReportPageNumber;
  reportAuditId?: string;
  reportAvailable?: boolean;
  rightAccessory?: React.ReactNode;
  children: React.ReactNode;
}

export default function DashboardSection({
  title,
  subtitle,
  reportPage,
  reportAuditId,
  reportAvailable = true,
  rightAccessory,
  children,
}: DashboardSectionProps): React.ReactElement {
  const showLink = !!reportPage && !!reportAuditId;
  // Phase 1: anchor not yet wired in the report viewer. Keep the bare path so
  // the link works today; reportPage is accepted for future per-page anchors.
  const reportHref = showLink ? `/audit/${reportAuditId}/report` : undefined;

  return (
    <section className="mb-12">
      <div className="flex items-end justify-between gap-3 mb-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            {title}
          </h2>
          {subtitle && (
            <p className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>
              {subtitle}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {rightAccessory}
          {showLink && (
            reportAvailable ? (
              <a
                href={reportHref}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
                style={{ color: 'var(--accent)' }}
              >
                View in report
                <ArrowUpRight className="w-3 h-3" />
              </a>
            ) : (
              <span
                title="Generate the report first"
                className="inline-flex items-center gap-1 text-xs font-medium opacity-50 cursor-not-allowed"
                style={{ color: 'var(--text-tertiary)' }}
              >
                View in report
                <ArrowUpRight className="w-3 h-3" />
              </span>
            )
          )}
        </div>
      </div>
      <div>{children}</div>
    </section>
  );
}
