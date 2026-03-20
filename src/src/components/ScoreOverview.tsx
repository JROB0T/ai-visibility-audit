'use client';

import ScoreRing from '@/components/ScoreRing';
import { Shield, FileText, Zap, Globe } from 'lucide-react';

interface PillarData {
  score: number;
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  findings: string[];
}

interface ScoreOverviewProps {
  overallScore: number;
  crawlability: number;
  readability: number;
  commercial: number;
  trust: number;
  pagesScanned: number;
  domain: string;
  summary: string | null;
  crawlabilityFindings?: string[];
  readabilityFindings?: string[];
  commercialFindings?: string[];
  trustFindings?: string[];
}

function getScoreColor(score: number): string {
  if (score >= 80) return '#10B981';
  if (score >= 60) return '#34D399';
  if (score >= 40) return '#F59E0B';
  if (score >= 20) return '#F97316';
  return '#EF4444';
}

function MiniBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="h-1.5 rounded-full overflow-hidden bg-gray-100 w-full">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${score}%`, backgroundColor: color }}
      />
    </div>
  );
}

export default function ScoreOverview({
  overallScore,
  crawlability,
  readability,
  commercial,
  trust,
  pagesScanned,
  domain,
  summary,
  crawlabilityFindings = [],
  readabilityFindings = [],
  commercialFindings = [],
  trustFindings = [],
}: ScoreOverviewProps) {
  const pillars: PillarData[] = [
    {
      score: crawlability,
      label: 'Crawlability',
      icon: <Shield className="w-4 h-4" />,
      color: '#10B981',
      bgColor: '#ECFDF5',
      findings: crawlabilityFindings,
    },
    {
      score: readability,
      label: 'Machine Readability',
      icon: <FileText className="w-4 h-4" />,
      color: '#6366F1',
      bgColor: '#E0E7FF',
      findings: readabilityFindings,
    },
    {
      score: commercial,
      label: 'Commercial Clarity',
      icon: <Zap className="w-4 h-4" />,
      color: '#F59E0B',
      bgColor: '#FEF3C7',
      findings: commercialFindings,
    },
    {
      score: trust,
      label: 'Trust & Authority',
      icon: <Globe className="w-4 h-4" />,
      color: '#EC4899',
      bgColor: '#FCE7F3',
      findings: trustFindings,
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
      <div className="p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Score Ring */}
          <div className="flex flex-col items-center justify-center lg:min-w-[180px]">
            <ScoreRing score={overallScore} label="Overall Score" size={160} />
            <div className="mt-3 text-center">
              <p className="text-sm font-medium text-gray-700">{domain}</p>
              <p className="text-xs text-gray-400">{pagesScanned} pages scanned</p>
            </div>
          </div>

          {/* Pillar Cards Grid */}
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {pillars.map((pillar) => (
              <div
                key={pillar.label}
                className="rounded-xl border border-gray-200 p-4 hover:border-gray-300 transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: pillar.bgColor, color: pillar.color }}
                    >
                      {pillar.icon}
                    </div>
                    <span className="text-sm font-semibold text-gray-900">{pillar.label}</span>
                  </div>
                  <span
                    className="text-lg font-bold tabular-nums"
                    style={{ color: getScoreColor(pillar.score), fontFamily: 'var(--font-mono)' }}
                  >
                    {pillar.score}
                  </span>
                </div>
                <MiniBar score={pillar.score} color={pillar.color} />
                {pillar.findings.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {pillar.findings.slice(0, 3).map((f, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-gray-500 leading-relaxed">
                        <span className="text-amber-500 mt-0.5 shrink-0">•</span>
                        <span>{f}</span>
                      </div>
                    ))}
                    {pillar.findings.length > 3 && (
                      <p className="text-[10px] text-gray-400 ml-4">
                        +{pillar.findings.length - 3} more
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Summary */}
        {summary && (
          <div className="mt-6 bg-gray-50 rounded-lg p-4 border border-gray-100">
            <p className="text-sm text-gray-600 leading-relaxed">{summary}</p>
          </div>
        )}
      </div>
    </div>
  );
}
