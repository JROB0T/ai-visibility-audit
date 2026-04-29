'use client';

import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { severityColor, severityFromDelta, SEVERITY_COLORS } from '@/lib/dashboardColors';

interface StatPairProps {
  label: string;
  value: number | string | null;
  scoreForColor?: number | null;
  grade?: string | null;
  delta?: number | null;
  size?: 'sm' | 'md' | 'lg';
  subtitle?: string | null;
}

export default function StatPair({
  label,
  value,
  scoreForColor,
  grade,
  delta,
  size = 'md',
  subtitle,
}: StatPairProps): React.ReactElement {
  const valueText = value === null ? '—' : String(value);
  const valueClass = size === 'sm' ? 'text-xl' : size === 'lg' ? 'text-5xl' : 'text-3xl';
  const valueColor = value === null ? 'var(--text-tertiary)' : 'var(--text-primary)';

  return (
    <div>
      <div
        className="text-xs uppercase tracking-wider font-medium mb-1"
        style={{ color: 'var(--text-tertiary)' }}
      >
        {label}
      </div>
      <div className="flex items-baseline gap-2">
        {grade ? (
          <>
            {/* Grade is the primary visual — bold and colored by severity */}
            <span
              className={`${valueClass} font-bold tabular-nums`}
              style={{
                color:
                  scoreForColor !== undefined && scoreForColor !== null
                    ? severityColor(scoreForColor)
                    : valueColor,
              }}
            >
              {grade}
            </span>
            {/* Number is the secondary — small and muted */}
            <span
              className="text-base font-medium tabular-nums"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {valueText}
            </span>
          </>
        ) : (
          <span className={`${valueClass} font-bold tabular-nums`} style={{ color: valueColor }}>
            {valueText}
          </span>
        )}
      </div>
      {delta !== undefined && delta !== null && <DeltaIndicator delta={delta} />}
      {subtitle && (
        <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

function DeltaIndicator({ delta }: { delta: number }): React.ReactElement {
  const sev = severityFromDelta(delta);
  const Icon = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;
  const color = SEVERITY_COLORS[sev];
  return (
    <div className="flex items-center gap-1 text-xs mt-1 font-medium" style={{ color }}>
      <Icon className="w-3 h-3" />
      {delta > 0 ? '+' : ''}
      {delta}
    </div>
  );
}
