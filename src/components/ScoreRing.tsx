'use client';

interface ScoreRingProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}

export function getScoreColor(score: number): string {
  if (score >= 90) return '#10B981';
  if (score >= 80) return '#34D399';
  if (score >= 70) return '#6366F1';
  if (score >= 60) return '#F59E0B';
  if (score >= 50) return '#F97316';
  return '#EF4444';
}

export function scoreToGrade(score: number): string {
  if (score >= 97) return 'A+';
  if (score >= 93) return 'A';
  if (score >= 90) return 'A-';
  if (score >= 87) return 'B+';
  if (score >= 83) return 'B';
  if (score >= 80) return 'B-';
  if (score >= 77) return 'C+';
  if (score >= 73) return 'C';
  if (score >= 70) return 'C-';
  if (score >= 67) return 'D+';
  if (score >= 63) return 'D';
  if (score >= 60) return 'D-';
  return 'F';
}

export default function ScoreRing({ score, size = 140, strokeWidth = 10, label }: ScoreRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = getScoreColor(score);
  const grade = scoreToGrade(score);

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
          <span className="font-bold" style={{ color, fontFamily: 'var(--font-mono)', fontSize: grade.length > 1 ? '2rem' : '2.5rem' }}>{grade}</span>
          <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{score}/100</span>
        </div>
      </div>
      {label && <div className="mt-2 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</div>}
    </div>
  );
}

export function ScoreBar({ score, label }: { score: number; label: string }) {
  const color = getScoreColor(score);
  const grade = scoreToGrade(score);
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 sm:w-28 text-sm font-medium shrink-0" style={{ color: 'var(--text-secondary)' }}>{label}</div>
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${score}%`, backgroundColor: color, boxShadow: `0 0 6px ${color}30` }} />
      </div>
      <div className="w-10 text-right text-sm font-bold" style={{ color, fontFamily: 'var(--font-mono)' }}>{grade}</div>
    </div>
  );
}
