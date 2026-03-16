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
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#E5E7EB"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="score-ring-animated"
            style={{ '--target-offset': offset } as React.CSSProperties}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold" style={{ color }}>
            {score}
          </span>
          <span className="text-xs text-gray-500 font-medium">/ 100</span>
        </div>
      </div>
      {label && (
        <div className="mt-2 text-sm font-medium text-gray-700">{label}</div>
      )}
      <div className="text-xs font-medium mt-0.5" style={{ color }}>
        {getScoreLabel(score)}
      </div>
    </div>
  );
}

// Smaller inline score bar for category scores
export function ScoreBar({ score, label }: { score: number; label: string }) {
  const color = getScoreColor(score);

  return (
    <div className="flex items-center gap-3">
      <div className="w-24 sm:w-28 text-sm font-medium text-gray-700 shrink-0">{label}</div>
      <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
      <div className="w-10 text-right text-sm font-semibold" style={{ color }}>
        {score}
      </div>
    </div>
  );
}
