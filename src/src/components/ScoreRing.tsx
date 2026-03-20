'use client';

interface ScoreRingProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}

function getScoreColor(score: number): string {
  if (score >= 80) return '#10B981';
  if (score >= 60) return '#34D399';
  if (score >= 40) return '#F59E0B';
  if (score >= 20) return '#F97316';
  return '#EF4444';
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Great';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Needs Work';
  if (score >= 20) return 'Poor';
  return 'Critical';
}

export default function ScoreRing({ score, size = 140, strokeWidth = 10, label }: ScoreRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = getScoreColor(score);

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border)" strokeWidth={strokeWidth} />
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={offset} className="score-ring-animated"
            style={{ '--target-offset': offset, filter: `drop-shadow(0 0 6px ${color}40)` } as React.CSSProperties}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold" style={{ color, fontFamily: 'var(--font-mono)' }}>{score}</span>
          <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>/ 100</span>
        </div>
      </div>
      {label && <div className="mt-2 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</div>}
      <div className="text-xs font-medium mt-0.5" style={{ color }}>{getScoreLabel(score)}</div>
    </div>
  );
}

export function ScoreBar({ score, label }: { score: number; label: string }) {
  const color = getScoreColor(score);
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 sm:w-28 text-sm font-medium shrink-0" style={{ color: 'var(--text-secondary)' }}>{label}</div>
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${score}%`, backgroundColor: color, boxShadow: `0 0 6px ${color}30` }} />
      </div>
      <div className="w-10 text-right text-sm font-semibold" style={{ color, fontFamily: 'var(--font-mono)' }}>{score}</div>
    </div>
  );
}
