'use client';

import ScoreRing from '@/components/ScoreRing';
import { Shield, FileText, Zap, Globe } from 'lucide-react';

interface PillarData {
  score: number;
  label: string;
  tooltip: string;
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
      tooltip: 'Can AI crawlers like GPTBot, ClaudeBot, and PerplexityBot access your site? This checks robots.txt, sitemaps, and whether your pages return valid responses.',
      icon: <Shield className="w-4 h-4" />,
      color: '#10B981',
      bgColor: '#ECFDF5',
      findings: crawlabilityFindings,
    },
    {
      score: readability,
      label: 'Machine Readability',
      tooltip: 'Can AI systems understand your page content? This checks title tags, meta descriptions, structured data (JSON-LD), heading hierarchy, and content depth.',
      icon: <FileText className="w-4 h-4" />,
      color: '#6366F1',
      bgColor: '#E0E7FF',
      findings: readabilityFindings,
    },
    {
      score: commercial,
      label: 'Commercial Clarity',
      tooltip: 'Are your key business pages discoverable? This checks whether AI can find your pricing, product, contact, and demo pages — the pages that drive revenue.',
      icon: <Zap className="w-4 h-4" />,
      color: '#F59E0B',
      bgColor: '#FEF3C7',
      findings: commercialFindings,
    },
    {
      score: trust,
      label: 'Trust & Authority',
      tooltip: 'Does your site establish credibility? This checks for Organization schema, content depth, resource pages (blog/docs), page performance, and about/company pages.',
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
                className="rounded-xl border border-gray-200 p-4 hover:border-gray-300 transition-colors group relative"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: pillar.bgColor, color: pillar.color }}
                    >
                      {pillar.icon}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-gray-900">{pillar.label}</span>
                      <div className="relative inline-flex">
                        <svg className="w-3.5 h-3.5 text-gray-300 hover:text-gray-500 cursor-help transition-colors peer" viewBox="0 0 16 16" fill="currentColor">
                          <path fillRule="evenodd" d="M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0zM9.25 5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0zM7.25 8a.75.75 0 0 1 1.5 0v3a.75.75 0 0 1-1.5 0V8z" clipRule="evenodd" />
                        </svg>
                        <div className="invisible peer-hover:visible absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-gray-900 text-white text-xs leading-relaxed rounded-lg shadow-xl pointer-events-none">
                          {pillar.tooltip}
                          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
                            <div className="w-2 h-2 bg-gray-900 rotate-45" />
                          </div>
                        </div>
                      </div>
                    </div>
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
                        <span className="text-amber-500 mt-0.5 shrink-0">&bull;</span>
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
