'use client';

import { severityColor } from '@/lib/dashboardColors';

interface SparklineProps {
  values: Array<number | null>;
  width?: number;
  height?: number;
  // If provided, the last point is colored by severity; otherwise uses --accent.
  colorByLatest?: boolean;
}

export default function Sparkline({
  values,
  width = 150,
  height = 40,
  colorByLatest = true,
}: SparklineProps): React.ReactElement {
  const numericValues = values.filter((v): v is number => typeof v === 'number');
  if (numericValues.length === 0) {
    return (
      <div className="flex items-center text-xs" style={{ width, height, color: 'var(--text-tertiary)' }}>
        No data
      </div>
    );
  }

  const min = Math.min(...numericValues, 0);
  const max = Math.max(...numericValues, 100);
  const range = max - min || 1;
  const padX = 2;
  const padY = 4;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;

  const xFor = (i: number) => {
    if (values.length === 1) return padX + plotW / 2;
    return padX + (plotW * i) / (values.length - 1);
  };
  const yFor = (v: number) => padY + plotH * (1 - (v - min) / range);

  // Build polyline only across points where we have data; gaps treated as "skip".
  const segments: Array<Array<{ x: number; y: number }>> = [];
  let current: Array<{ x: number; y: number }> = [];
  values.forEach((v, i) => {
    if (typeof v === 'number') {
      current.push({ x: xFor(i), y: yFor(v) });
    } else if (current.length > 0) {
      segments.push(current);
      current = [];
    }
  });
  if (current.length > 0) segments.push(current);

  const lastValue = numericValues[numericValues.length - 1];
  const lineColor = colorByLatest ? severityColor(lastValue) : 'var(--accent)';

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      {segments.map((seg, i) => (
        <polyline
          key={i}
          points={seg.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
          fill="none"
          stroke={lineColor}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      {/* Final point dot */}
      {(() => {
        const lastIdx = (() => {
          for (let i = values.length - 1; i >= 0; i--) {
            if (typeof values[i] === 'number') return i;
          }
          return -1;
        })();
        if (lastIdx < 0) return null;
        const cx = xFor(lastIdx);
        const cy = yFor(values[lastIdx] as number);
        return <circle cx={cx} cy={cy} r={2.5} fill={lineColor} />;
      })()}
    </svg>
  );
}
