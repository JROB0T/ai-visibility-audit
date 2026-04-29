'use client';

import { ChevronRight } from 'lucide-react';
import { findingSeverityColor, type FindingSeverity } from '@/lib/dashboardColors';

interface SeverityRowProps {
  severity: FindingSeverity;
  label?: string;
  title: string;
  subtitle?: string | null;
  rightLabel?: string;
  onClick?: () => void;
}

export default function SeverityRow({
  severity,
  label,
  title,
  subtitle,
  rightLabel,
  onClick,
}: SeverityRowProps): React.ReactElement {
  const accentColor = findingSeverityColor(severity);
  const isInteractive = !!onClick;

  const content = (
    <>
      <span
        className="w-1 self-stretch rounded-full shrink-0"
        style={{ background: accentColor }}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        {label && (
          <div
            className="text-xs uppercase tracking-wider font-medium mb-1"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {label}
          </div>
        )}
        <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
          {title}
        </div>
        {subtitle && (
          <div className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {subtitle}
          </div>
        )}
      </div>
      {rightLabel && (
        <div
          className="text-sm shrink-0 self-center"
          style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}
        >
          {rightLabel}
        </div>
      )}
      {isInteractive && (
        <ChevronRight className="w-4 h-4 self-center shrink-0" style={{ color: 'var(--text-tertiary)' }} />
      )}
    </>
  );

  if (isInteractive) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left flex items-stretch gap-4 py-3 border-b transition cursor-pointer"
        style={{ borderColor: 'var(--border)' }}
      >
        {content}
      </button>
    );
  }
  return (
    <div
      className="flex items-stretch gap-4 py-3 border-b"
      style={{ borderColor: 'var(--border)' }}
    >
      {content}
    </div>
  );
}
