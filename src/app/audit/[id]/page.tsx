'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import ScoreRing, { ScoreBar } from '@/components/ScoreRing';
import SeverityBadge, { EffortBadge } from '@/components/SeverityBadge';
import { Lock, ArrowRight, CheckCircle, ExternalLink, FileText, AlertTriangle, RefreshCw } from 'lucide-react';

interface AuditData {
  audit: {
    id: string;
    status: string;
    overall_score: number | null;
    crawlability_score: number | null;
    machine_readability_score: number | null;
    commercial_clarity_score: number | null;
    trust_clarity_score: number | null;
    pages_scanned: number;
    summary: string | null;
    created_at: string;
    completed_at: string | null;
    site: { domain: string; url: string };
  };
  pages: Array<{
    id: string;
    url: string;
    page_type: string;
    title: string | null;
    has_schema: boolean;
    word_count: number | null;
    load_time_ms: number | null;
    status_code: number | null;
    issues: string[];
  }>;
  findings: Array<{
    id: string;
    category: string;
    severity: string;
    title: string;
    description: string;
    affected_urls: string[];
  }>;
  recommendations: Array<{
    id: string;
    category: string;
    severity: string;
    effort: string;
    title: string;
    why_it_matters: string;
    recommended_fix: string;
    priority_order: number;
  }>;
}

const FREE_RECOMMENDATION_LIMIT = 3;

export default function AuditResultPage() {
  const params = useParams();
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        // Check auth
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        setIsAuthenticated(!!user);

        // Fetch audit
        const res = await fetch(`/api/audit/${params.id}`);
        if (!res.ok) {
          setError('Audit not found');
          return;
        }
        const auditData = await res.json();
        setData(auditData);

        // If user is authenticated and audit has no user_id, claim it
        if (user && auditData.audit && !auditData.audit.user_id) {
          await fetch(`/api/audit/${params.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id }),
          }).catch(() => {});
        }
      } catch {
        setError('Failed to load audit');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.id]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto" />
        <p className="mt-4 text-gray-500">Loading audit results…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
        <p className="mt-4 text-gray-700 font-medium">{error || 'Something went wrong'}</p>
        <a href="/" className="mt-4 inline-block text-blue-600 hover:underline">← Try another URL</a>
      </div>
    );
  }

  const { audit, pages, findings, recommendations } = data;

  if (audit.status === 'failed') {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <AlertTriangle className="w-10 h-10 text-red-500 mx-auto" />
        <h2 className="mt-4 text-xl font-semibold text-gray-900">Scan failed</h2>
        <p className="mt-2 text-gray-600">{audit.summary || 'The site could not be scanned. It may be unreachable or blocking our scanner.'}</p>
        <a href="/" className="mt-6 inline-block text-blue-600 hover:underline">← Try another URL</a>
      </div>
    );
  }

  const visibleRecs = isAuthenticated ? recommendations : recommendations.slice(0, FREE_RECOMMENDATION_LIMIT);
  const gatedCount = recommendations.length - FREE_RECOMMENDATION_LIMIT;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Visibility Report</h1>
          <p className="text-gray-500 mt-1">
            {audit.site?.domain} · Scanned {new Date(audit.created_at).toLocaleDateString()}
            {audit.pages_scanned > 0 && ` · ${audit.pages_scanned} pages analyzed`}
          </p>
        </div>
        <a
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          New Audit
        </a>
      </div>

      {/* Score overview */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 mb-6">
        <div className="flex flex-col sm:flex-row items-center gap-8">
          <ScoreRing score={audit.overall_score ?? 0} label="Overall Score" size={160} />
          <div className="flex-1 w-full space-y-3">
            <ScoreBar score={audit.crawlability_score ?? 0} label="Crawlability" />
            <ScoreBar score={audit.machine_readability_score ?? 0} label="Readability" />
            <ScoreBar score={audit.commercial_clarity_score ?? 0} label="Commercial" />
            <ScoreBar score={audit.trust_clarity_score ?? 0} label="Trust" />
          </div>
        </div>
        {audit.summary && (
          <p className="mt-6 text-sm text-gray-600 bg-gray-50 rounded-lg p-4">{audit.summary}</p>
        )}
      </div>

      {/* Recommendations */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Prioritized Recommendations</h2>
        <div className="space-y-4">
          {visibleRecs.map((rec, i) => (
            <div key={rec.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-xs font-semibold text-gray-500 shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-semibold text-gray-900">{rec.title}</h3>
                    <p className="mt-1 text-sm text-gray-600">{rec.why_it_matters}</p>
                    <div className="mt-3 bg-blue-50 rounded-lg p-3">
                      <p className="text-sm text-blue-900 font-medium">Recommended fix</p>
                      <p className="text-sm text-blue-800 mt-1">{rec.recommended_fix}</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <SeverityBadge severity={rec.severity as 'high' | 'medium' | 'low'} />
                  <EffortBadge effort={rec.effort as 'easy' | 'medium' | 'harder'} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Gate: sign up to see more */}
        {!isAuthenticated && gatedCount > 0 && (
          <div className="mt-6 relative">
            {/* Blurred teaser */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 opacity-40 blur-[2px] pointer-events-none">
              <div className="flex items-start gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-xs font-semibold text-gray-500">
                  {FREE_RECOMMENDATION_LIMIT + 1}
                </span>
                <div>
                  <div className="h-4 w-64 bg-gray-200 rounded" />
                  <div className="h-3 w-96 bg-gray-100 rounded mt-2" />
                  <div className="h-3 w-80 bg-gray-100 rounded mt-1" />
                </div>
              </div>
            </div>
            {/* Overlay CTA */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-white rounded-xl border-2 border-blue-200 p-6 text-center shadow-lg max-w-sm">
                <Lock className="w-8 h-8 text-blue-600 mx-auto" />
                <h3 className="mt-3 font-semibold text-gray-900">
                  {gatedCount} more recommendation{gatedCount > 1 ? 's' : ''} available
                </h3>
                <p className="mt-2 text-sm text-gray-600">
                  Sign up free to see your full report, all recommendations, and page-by-page analysis.
                </p>
                <a
                  href={`/auth/signup?redirect=/audit/${audit.id}`}
                  className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  Unlock Full Report
                  <ArrowRight className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Pages scanned - only for authenticated users */}
      {isAuthenticated && pages.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Pages Analyzed</h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Page</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Type</th>
                    <th className="text-center py-3 px-4 font-medium text-gray-600">Schema</th>
                    <th className="text-center py-3 px-4 font-medium text-gray-600">Issues</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-600">Load Time</th>
                  </tr>
                </thead>
                <tbody>
                  {pages.map((page) => (
                    <tr key={page.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 max-w-xs">
                          <span className="truncate text-gray-900 font-medium" title={page.url}>
                            {page.title || new URL(page.url).pathname}
                          </span>
                          <a href={page.url} target="_blank" rel="noopener" className="shrink-0 text-gray-400 hover:text-blue-600">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600 capitalize">
                          {page.page_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {page.has_schema ? (
                          <CheckCircle className="w-4 h-4 text-green-500 mx-auto" />
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {page.issues.length > 0 ? (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                            {page.issues.length}
                          </span>
                        ) : (
                          <CheckCircle className="w-4 h-4 text-green-500 mx-auto" />
                        )}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-600">
                        {page.load_time_ms ? `${(page.load_time_ms / 1000).toFixed(1)}s` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Pages teaser for unauthenticated */}
      {!isAuthenticated && pages.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Pages Analyzed</h2>
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
            <FileText className="w-8 h-8 text-gray-400 mx-auto" />
            <p className="mt-3 text-gray-600">
              We scanned {pages.length} pages.{' '}
              <a href={`/auth/signup?redirect=/audit/${audit.id}`} className="text-blue-600 hover:underline font-medium">
                Sign up free
              </a>{' '}
              to see the full page-by-page breakdown.
            </p>
          </div>
        </div>
      )}

      {/* Findings by category - only for authenticated */}
      {isAuthenticated && findings.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">All Findings</h2>
          <div className="space-y-3">
            {findings.map((finding) => (
              <div key={finding.id} className="bg-white rounded-lg border border-gray-200 p-4 flex items-start gap-3">
                <SeverityBadge severity={finding.severity as 'high' | 'medium' | 'low'} />
                <div>
                  <p className="font-medium text-gray-900 text-sm">{finding.title}</p>
                  <p className="text-sm text-gray-600 mt-0.5">{finding.description}</p>
                  {finding.affected_urls.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {finding.affected_urls.slice(0, 3).map((url) => (
                        <span key={url} className="text-xs text-gray-500 bg-gray-50 px-2 py-0.5 rounded truncate max-w-[200px]" title={url}>
                          {new URL(url).pathname}
                        </span>
                      ))}
                      {finding.affected_urls.length > 3 && (
                        <span className="text-xs text-gray-400">+{finding.affected_urls.length - 3} more</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
