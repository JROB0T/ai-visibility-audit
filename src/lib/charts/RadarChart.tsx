'use client';

import { severityColor } from '@/lib/dashboardColors';

// Cluster keys + axis order match buildRadarSvg in src/lib/reportTemplate.ts
// so the dashboard radar reads identically to the printed report.
type ClusterKey = 'core' | 'problem' | 'comparison' | 'long_tail' | 'brand' | 'adjacent';

interface RadarChartProps {
  clusterScores: Partial<Record<ClusterKey, number>>;
  centerLabel?: string;
  centerSubLabel?: string;
  size?: number;
}

const AXES: Array<{ key: ClusterKey; angle: number; label: string }> = [
  { key: 'comparison', angle: 0,   label: 'COMPARISON' },
  { key: 'long_tail',  angle: 60,  label: 'LONG-TAIL'  },
  { key: 'problem',    angle: 120, label: 'PROBLEM'    },
  { key: 'adjacent',   angle: 180, label: 'ADJACENT'   },
  { key: 'brand',      angle: 240, label: 'BRAND'      },
  { key: 'core',       angle: 300, label: 'CORE'       },
];

const CX = 120;
const CY = 120;
const MAX_R = 96;

function pointAt(angleDeg: number, score: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  const r = MAX_R * (score / 100);
  return {
    x: +(CX + r * Math.cos(rad)).toFixed(1),
    y: +(CY + r * Math.sin(rad)).toFixed(1),
  };
}

export default function RadarChart({
  clusterScores,
  centerLabel,
  centerSubLabel,
  size = 280,
}: RadarChartProps): React.ReactElement {
  const values: Record<ClusterKey, number> = {
    core: 0, problem: 0, comparison: 0, long_tail: 0, brand: 0, adjacent: 0,
  };
  for (const k of Object.keys(values) as ClusterKey[]) {
    const v = clusterScores[k];
    values[k] = typeof v === 'number' ? v : 0;
  }

  const ringPolygons = [100, 75, 50, 25].map((pct, i) => {
    const pts = AXES.map((a) => pointAt(a.angle, pct))
      .map((p) => `${p.x},${p.y}`)
      .join(' ');
    return <polygon key={pct} points={pts} opacity={(0.5 - i * 0.1).toFixed(1)} />;
  });

  const axisLines = AXES.map((a) => {
    const p = pointAt(a.angle, 100);
    return <line key={a.key} x1={CX} y1={CY} x2={p.x} y2={p.y} />;
  });

  const dataPolyPts = AXES.map((a) => pointAt(a.angle, values[a.key]))
    .map((p) => `${p.x},${p.y}`)
    .join(' ');

  const dots = AXES.map((a) => {
    const pt = pointAt(a.angle, values[a.key]);
    const score = values[a.key];
    return <circle key={a.key} cx={pt.x} cy={pt.y} r={3} fill={severityColor(score)} />;
  });

  const labels = AXES.map((a) => {
    const lp = pointAt(a.angle, 115);
    let anchor: 'start' | 'middle' | 'end' = 'middle';
    if (a.angle > 0 && a.angle < 180) anchor = 'start';
    else if (a.angle > 180 && a.angle < 360) anchor = 'end';
    let y = lp.y;
    if (a.angle === 0) y -= 4;
    if (a.angle === 180) y += 10;
    return (
      <text
        key={a.key}
        x={lp.x}
        y={+y.toFixed(1)}
        fontSize={9}
        letterSpacing={1}
        textAnchor={anchor}
        style={{ fill: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}
      >
        {a.label}
      </text>
    );
  });

  return (
    <div className="relative inline-block" style={{ width: size }}>
      <svg viewBox="-30 -10 300 270" width={size} height={size * (270 / 300)}>
        <g fill="none" stroke="var(--border)" strokeWidth={0.75}>
          {ringPolygons}
        </g>
        <g stroke="var(--border)" strokeWidth={0.5} opacity={0.5}>
          {axisLines}
        </g>
        <polygon
          points={dataPolyPts}
          fill="var(--accent)"
          fillOpacity={0.14}
          stroke="var(--accent)"
          strokeWidth={1.5}
        />
        {dots}
        {labels}
      </svg>
      {(centerLabel || centerSubLabel) && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
          // Center the overlay over the chart proper (viewBox center is 120/300 ≈ 40%, plus the 30 left pad shifts it a touch)
          style={{ paddingTop: '6%' }}
        >
          {centerLabel && (
            <div
              className="text-3xl font-bold tabular-nums"
              style={{ color: 'var(--text-primary)' }}
            >
              {centerLabel}
            </div>
          )}
          {centerSubLabel && (
            <div
              className="text-xs uppercase tracking-wider mt-0.5"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {centerSubLabel}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
