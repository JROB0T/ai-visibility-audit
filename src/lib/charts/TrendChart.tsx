'use client';

import { severityColor } from '@/lib/dashboardColors';

interface TrendPoint {
  date: string;
  score: number | null;
}

interface TrendChartProps {
  history: TrendPoint[];
  height?: number;
}

export default function TrendChart({ history, height = 220 }: TrendChartProps): React.ReactElement {
  const points = history.filter((p): p is { date: string; score: number } => typeof p.score === 'number');

  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border text-sm"
        style={{ height, color: 'var(--text-tertiary)', borderColor: 'var(--border)' }}
      >
        No trend data yet — your next run will start the line.
      </div>
    );
  }

  const vbW = 640;
  const vbH = height;
  const leftPad = 40;
  const rightPad = 16;
  const topPad = 18;
  const bottomPad = 32;
  const plotW = vbW - leftPad - rightPad;
  const plotH = vbH - topPad - bottomPad;

  const yMin = 60;
  const yMax = 100;
  const yFor = (s: number) => topPad + plotH * (1 - (s - yMin) / (yMax - yMin));

  const n = points.length;
  const xFor = (i: number) => {
    if (n === 1) return leftPad + plotW / 2;
    return leftPad + (plotW * i) / (n - 1);
  };

  const pathPts = points.map((p, i) => `${xFor(i).toFixed(1)},${yFor(p.score).toFixed(1)}`);

  const gridLines = [100, 90, 80, 70].map((y) => {
    const yy = yFor(y);
    return (
      <g key={y}>
        <line
          x1={leftPad}
          y1={yy}
          x2={vbW - rightPad}
          y2={yy}
          stroke="var(--border)"
          strokeWidth={0.5}
          strokeDasharray="2 3"
        />
        <text
          x={leftPad - 6}
          y={yy + 3}
          fontSize={9}
          textAnchor="end"
          style={{ fill: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}
        >
          {y}
        </text>
      </g>
    );
  });

  const lineColor = severityColor(points[points.length - 1].score);

  // Baseline state for single snapshot
  if (n === 1) {
    const cx = xFor(0);
    const cy = yFor(points[0].score);
    return (
      <svg width="100%" height={vbH} viewBox={`0 0 ${vbW} ${vbH}`} preserveAspectRatio="xMidYMid meet">
        {gridLines}
        <circle cx={cx} cy={cy} r={5} fill={lineColor} />
        <text
          x={cx}
          y={cy - 12}
          fontSize={10}
          textAnchor="middle"
          style={{ fill: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}
        >
          BASELINE — tracking begins
        </text>
        <text
          x={cx}
          y={vbH - 10}
          fontSize={10}
          textAnchor="middle"
          style={{ fill: 'var(--text-tertiary)' }}
        >
          {formatShortDate(points[0].date)}
        </text>
      </svg>
    );
  }

  const areaPts = [
    `${xFor(0).toFixed(1)},${(topPad + plotH).toFixed(1)}`,
    ...pathPts,
    `${xFor(n - 1).toFixed(1)},${(topPad + plotH).toFixed(1)}`,
  ].join(' ');

  return (
    <svg width="100%" height={vbH} viewBox={`0 0 ${vbW} ${vbH}`} preserveAspectRatio="xMidYMid meet">
      {gridLines}
      <polygon points={areaPts} fill={lineColor} fillOpacity={0.08} />
      <polyline
        points={pathPts.join(' ')}
        fill="none"
        stroke={lineColor}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map((p, i) => (
        <circle key={i} cx={xFor(i)} cy={yFor(p.score)} r={3} fill={lineColor} />
      ))}
      {/* X-axis date labels — first, last, and a midpoint if many */}
      <text
        x={xFor(0)}
        y={vbH - 10}
        fontSize={10}
        textAnchor="start"
        style={{ fill: 'var(--text-tertiary)' }}
      >
        {formatShortDate(points[0].date)}
      </text>
      <text
        x={xFor(n - 1)}
        y={vbH - 10}
        fontSize={10}
        textAnchor="end"
        style={{ fill: 'var(--text-tertiary)' }}
      >
        {formatShortDate(points[n - 1].date)}
      </text>
    </svg>
  );
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
