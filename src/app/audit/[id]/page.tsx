'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import ScoreOverview from '@/components/ScoreOverview';
import FixPackageView from '@/components/FixPackageView';
import SeverityBadge, { EffortBadge } from '@/components/SeverityBadge';
import { Lock, ArrowRight, CheckCircle, ExternalLink, FileText, AlertTriangle, RefreshCw, ChevronDown, ChevronRight, Filter, Zap, Sparkles, Code2, Globe, Tag, MessageSquare } from 'lucide-react';

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
    schema_types: string[];
    meta_description: string | null;
    canonical_url: string | null;
    h1_text: string | null;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FixPackageData = any;

type ViewMode = 'priority' | 'page' | 'category';
type SeverityFilter = 'all' | 'high' | 'medium' | 'low';

const FREE_RECOMMENDATION_LIMIT = 3;

const CATEGORY_LABELS: Record<string, string> = {
  crawlability: 'Crawlability',
  machine_readability: 'Machine Readability',
  commercial_clarity: 'Commercial Page Clarity',
  trust_clarity: 'Trust & Source Clarity',
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  crawlability: 'Can AI crawlers access and navigate your site?',
  machine_readability: 'Can AI systems understand your page content?',
  commercial_clarity: 'Are your key commercial pages structured for AI discovery?',
  trust_clarity: 'Does your site establish trust and authority signals?',
};

function getIssueDetail(issue: string): { why: string; fix: string; category: string } {
  const map: Record<string, { why: string; fix: string; category: string }> = {
    'Missing page title': {
      why: 'Title tags are the primary way AI systems identify what a page is about. Without one, AI cannot accurately describe or recommend this page.',
      fix: 'Add a unique, descriptive <title> tag (50-60 characters) that includes your product name and page purpose.',
      category: 'machine_readability',
    },
    'Page title is very short': {
      why: 'Short titles give AI systems very little context about the page. This reduces the chance of accurate references.',
      fix: 'Expand the title to 50-60 characters. Include the page topic and your brand name.',
      category: 'machine_readability',
    },
    'Page title is very long (may truncate)': {
      why: 'Long titles get cut off in search results and may confuse AI systems about the primary topic.',
      fix: 'Shorten the title to under 60 characters. Put the most important keywords first.',
      category: 'machine_readability',
    },
    'Missing meta description': {
      why: 'Meta descriptions are often used as the summary when AI references your content. Without one, AI generates its own which may not match your intent.',
      fix: 'Add a meta description (120-155 characters) that clearly describes what this page offers to visitors.',
      category: 'machine_readability',
    },
    'Meta description is very short': {
      why: 'A very short meta description misses the opportunity to tell AI systems what this page is about in detail.',
      fix: 'Expand to 120-155 characters. Describe the page value proposition clearly.',
      category: 'machine_readability',
    },
    'Meta description is very long': {
      why: 'Long meta descriptions get truncated, which can lead to incomplete or misleading summaries by AI.',
      fix: 'Trim to under 155 characters. Lead with the most important information.',
      category: 'machine_readability',
    },
    'Missing canonical tag': {
      why: 'Without a canonical tag, AI crawlers may index duplicate versions of this page or choose the wrong URL to reference.',
      fix: 'Add a <link rel="canonical" href="..."> tag pointing to the preferred URL for this page.',
      category: 'machine_readability',
    },
    'No structured data (JSON-LD) found': {
      why: 'Structured data tells AI exactly what this page represents. Without it, AI must guess from unstructured text.',
      fix: 'Add JSON-LD structured data. Use Organization on homepage, Product on product pages, Article on blog posts.',
      category: 'machine_readability',
    },
    'Missing H1 heading': {
      why: 'The H1 heading is a strong signal for page topic. Missing it makes it harder for AI to determine the main subject.',
      fix: 'Add a single, clear H1 heading that describes the main topic of the page.',
      category: 'machine_readability',
    },
    'Very thin content (under 100 words)': {
      why: 'Pages with very little text give AI almost nothing to work with. These pages are unlikely to be referenced by AI systems.',
      fix: 'Add meaningful content (at least 200-300 words) that explains what this page offers.',
      category: 'machine_readability',
    },
    'Page may rely heavily on JavaScript for content rendering': {
      why: 'AI crawlers often cannot execute JavaScript. If your core content only loads via JS, AI systems may see a blank page.',
      fix: 'Ensure critical content is present in the initial HTML, not loaded dynamically via JavaScript.',
      category: 'crawlability',
    },
  };
  return map[issue] || {
    why: 'This issue may reduce how effectively AI systems can interpret and reference this page.',
    fix: 'Review this page and address the issue to improve AI visibility.',
    category: 'machine_readability',
  };
}

export default function AuditResultPage() {
  const params = useParams();
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(true); // Force true for testing — shows full dashboard experience
  const [viewMode, setViewMode] = useState<ViewMode>('priority');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['crawlability', 'machine_readability', 'commercial_clarity', 'trust_clarity']));

  // Fix Package state
  const [fixPackage, setFixPackage] = useState<FixPackageData | null>(null);
  const [fixLoading, setFixLoading] = useState(false);
  const [fixError, setFixError] = useState('');
  const [showFixPackage, setShowFixPackage] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        setIsAuthenticated(!!user);
        const res = await fetch(`/api/audit/${params.id}`);
        if (!res.ok) { setError('Audit not found'); return; }
        const auditData = await res.json();
        setData(auditData);
        if (user && auditData.audit && !auditData.audit.user_id) {
          await fetch(`/api/audit/${params.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id }) }).catch(() => {});
        }
        // Check if fix package already exists
        const fpRes = await fetch(`/api/audit/${params.id}/fix-package`);
        if (fpRes.ok) {
          const fpData = await fpRes.json();
          if (fpData.fixPackage) {
            setFixPackage(fpData.fixPackage);
            setShowFixPackage(true);
          }
        }
      } catch { setError('Failed to load audit'); }
      finally { setLoading(false); }
    }
    load();
  }, [params.id]);

  async function generateFixPackage() {
    setFixLoading(true);
    setFixError('');
    try {
      const res = await fetch(`/api/audit/${params.id}/fix-package`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const result = await res.json();
      if (!res.ok) {
        setFixError(result.error || 'Failed to generate fix package');
        return;
      }
      setFixPackage(result.fixPackage);
      setShowFixPackage(true);
    } catch {
      setFixError('Could not generate fix package. Please try again.');
    } finally {
      setFixLoading(false);
    }
  }

  // --- Findings logic (preserved from original) ---
  const allFindings = useMemo(() => {
    if (!data) return [];
    const items: Array<{ id: string; title: string; why: string; fix: string; severity: 'high' | 'medium' | 'low'; effort: 'easy' | 'medium' | 'harder'; category: string; affectedUrls: string[]; priorityOrder: number; }> = [];
    for (const rec of data.recommendations) {
      items.push({ id: rec.id, title: rec.title, why: rec.why_it_matters, fix: rec.recommended_fix, severity: rec.severity as 'high' | 'medium' | 'low', effort: rec.effort as 'easy' | 'medium' | 'harder', category: rec.category, affectedUrls: data.findings.find(f => f.title === rec.title)?.affected_urls || [], priorityOrder: rec.priority_order });
    }
    const recTitles = new Set(data.recommendations.map(r => r.title.toLowerCase()));
    const pageIssueMap = new Map<string, string[]>();
    for (const page of data.pages) { for (const issue of page.issues) { if (!pageIssueMap.has(issue)) pageIssueMap.set(issue, []); pageIssueMap.get(issue)!.push(page.url); } }
    for (const [issue, urls] of Array.from(pageIssueMap.entries())) {
      const alreadyCovered = Array.from(recTitles).some(t => t.includes(issue.toLowerCase().substring(0, 20)));
      if (alreadyCovered) continue;
      const detail = getIssueDetail(issue);
      items.push({ id: `page-issue-${issue.replace(/\s/g, '-')}`, title: issue, why: detail.why, fix: detail.fix, severity: issue.includes('Missing page title') || issue.includes('Missing H1') ? 'medium' : 'low', effort: 'easy', category: detail.category, affectedUrls: urls, priorityOrder: 100 });
    }
    return items;
  }, [data]);

  const filteredFindings = useMemo(() => {
    if (severityFilter === 'all') return allFindings;
    return allFindings.filter(f => f.severity === severityFilter);
  }, [allFindings, severityFilter]);

  const findingsByPage = useMemo(() => {
    if (!data) return new Map<string, typeof allFindings>();
    const map = new Map<string, typeof allFindings>();
    for (const page of data.pages) {
      const pf = filteredFindings.filter(f => f.affectedUrls.includes(page.url) || f.affectedUrls.length === 0);
      if (pf.length > 0) map.set(page.url, pf);
    }
    const sw = filteredFindings.filter(f => f.affectedUrls.length === 0);
    if (sw.length > 0) map.set('__site_wide__', sw);
    return map;
  }, [data, filteredFindings]);

  const findingsByCategory = useMemo(() => {
    const map = new Map<string, typeof allFindings>();
    for (const cat of ['crawlability', 'machine_readability', 'commercial_clarity', 'trust_clarity']) {
      const cf = filteredFindings.filter(f => f.category === cat);
      if (cf.length > 0) map.set(cat, cf);
    }
    return map;
  }, [filteredFindings]);

  // Extract per-pillar findings for ScoreOverview
  const pillarFindings = useMemo(() => {
    if (!data) return { crawlability: [], readability: [], commercial: [], trust: [] };
    const byCat = (cat: string) => data.findings.filter(f => f.category === cat).map(f => f.title);
    return {
      crawlability: byCat('crawlability'),
      readability: byCat('machine_readability'),
      commercial: byCat('commercial_clarity'),
      trust: byCat('trust_clarity'),
    };
  }, [data]);

  function togglePage(url: string) { setExpandedPages(prev => { const n = new Set(prev); if (n.has(url)) n.delete(url); else n.add(url); return n; }); }
  function toggleCategory(cat: string) { setExpandedCategories(prev => { const n = new Set(prev); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; }); }

  if (loading) return (<div className="max-w-4xl mx-auto px-4 py-20 text-center"><div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto" /><p className="mt-4 text-gray-500">Loading audit results…</p></div>);
  if (error || !data) return (<div className="max-w-4xl mx-auto px-4 py-20 text-center"><AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" /><p className="mt-4 text-gray-700 font-medium">{error || 'Something went wrong'}</p><a href="/" className="mt-4 inline-block text-blue-600 hover:underline">← Try another URL</a></div>);

  const { audit, pages, recommendations } = data;
  if (audit.status === 'failed') return (<div className="max-w-4xl mx-auto px-4 py-20 text-center"><AlertTriangle className="w-10 h-10 text-red-500 mx-auto" /><h2 className="mt-4 text-xl font-semibold text-gray-900">Scan failed</h2><p className="mt-2 text-gray-600">{audit.summary || 'The site could not be scanned.'}</p><a href="/" className="mt-6 inline-block text-blue-600 hover:underline">← Try another URL</a></div>);

  const visibleRecs = isAuthenticated ? recommendations : recommendations.slice(0, FREE_RECOMMENDATION_LIMIT);
  const gatedCount = recommendations.length - FREE_RECOMMENDATION_LIMIT;
  const highCount = allFindings.filter(f => f.severity === 'high').length;
  const medCount = allFindings.filter(f => f.severity === 'medium').length;
  const lowCount = allFindings.filter(f => f.severity === 'low').length;

  function renderFindingCard(finding: typeof allFindings[0], index?: number) {
    return (
      <div key={finding.id} className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {index !== undefined && <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-50 text-xs font-semibold text-gray-500 shrink-0 mt-0.5">{index + 1}</span>}
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-900">{finding.title}</h3>
              <div className="mt-2 bg-amber-50 rounded-lg p-3 border border-amber-100">
                <p className="text-sm text-amber-900 font-medium">Why it matters</p>
                <p className="text-sm text-amber-800 mt-1">{finding.why}</p>
              </div>
              <div className="mt-2 bg-blue-50 rounded-lg p-3 border border-blue-100">
                <p className="text-sm text-blue-900 font-medium">Recommended fix</p>
                <p className="text-sm text-blue-800 mt-1">{finding.fix}</p>
              </div>
              {finding.affectedUrls.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-gray-500 mb-1.5">Affected pages:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {finding.affectedUrls.slice(0, 5).map((url) => { let p = url; try { p = new URL(url).pathname; } catch { /* */ } return (<a key={url} href={url} target="_blank" rel="noopener" className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded hover:bg-blue-100 truncate max-w-[220px]" title={url}>{p || '/'}</a>); })}
                    {finding.affectedUrls.length > 5 && <span className="text-xs text-gray-400">+{finding.affectedUrls.length - 5} more</span>}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1.5 shrink-0">
            <SeverityBadge severity={finding.severity} />
            <EffortBadge effort={finding.effort} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Visibility Report</h1>
          <p className="text-gray-500 mt-1">{audit.site?.domain} · Scanned {new Date(audit.created_at).toLocaleDateString()}{audit.pages_scanned > 0 && ` · ${audit.pages_scanned} pages analyzed`}</p>
        </div>
        <a href="/" className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"><RefreshCw className="w-4 h-4" />New Audit</a>
      </div>

      {/* ===== NEW SCORE OVERVIEW (replaces old ScoreRing + ScoreBar) ===== */}
      <ScoreOverview
        overallScore={audit.overall_score ?? 0}
        crawlability={audit.crawlability_score ?? 0}
        readability={audit.machine_readability_score ?? 0}
        commercial={audit.commercial_clarity_score ?? 0}
        trust={audit.trust_clarity_score ?? 0}
        pagesScanned={audit.pages_scanned}
        domain={audit.site?.domain || ''}
        summary={audit.summary}
        crawlabilityFindings={pillarFindings.crawlability}
        readabilityFindings={pillarFindings.readability}
        commercialFindings={pillarFindings.commercial}
        trustFindings={pillarFindings.trust}
      />

      {/* Findings summary badges */}
      <div className="flex items-center gap-3 mb-6 text-sm">
        <span className="text-gray-600 font-medium">{allFindings.length} findings:</span>
        {highCount > 0 && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 text-xs font-medium">{highCount} high</span>}
        {medCount > 0 && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-xs font-medium">{medCount} medium</span>}
        {lowCount > 0 && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium">{lowCount} low</span>}
      </div>

      {/* View mode toggle (authenticated users) */}
      {isAuthenticated && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-center gap-1 bg-gray-50 rounded-lg p-0.5">
            {(['priority', 'page', 'category'] as ViewMode[]).map((mode) => (
              <button key={mode} onClick={() => setViewMode(mode)} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === mode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {mode === 'priority' ? 'By Priority' : mode === 'page' ? 'By Page' : 'By Category'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)} className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">All severities</option>
              <option value="high">High only</option>
              <option value="medium">Medium only</option>
              <option value="low">Low only</option>
            </select>
          </div>
        </div>
      )}

      {/* Findings views */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">{isAuthenticated ? 'Detailed Findings' : 'Top Recommendations'}</h2>

        {(!isAuthenticated || viewMode === 'priority') && (
          <div className="space-y-4">
            {(isAuthenticated ? [...filteredFindings].sort((a, b) => { const s: Record<string, number> = { high: 0, medium: 1, low: 2 }; return (s[a.severity] - s[b.severity]) || (a.priorityOrder - b.priorityOrder); }) : visibleRecs.map((rec, i) => ({ id: rec.id, title: rec.title, why: rec.why_it_matters, fix: rec.recommended_fix, severity: rec.severity as 'high' | 'medium' | 'low', effort: rec.effort as 'easy' | 'medium' | 'harder', category: rec.category, affectedUrls: [] as string[], priorityOrder: i }))).map((finding, i) => renderFindingCard(finding, i))}
          </div>
        )}

        {isAuthenticated && viewMode === 'page' && (
          <div className="space-y-3">
            {Array.from(findingsByPage.entries()).map(([url, pageFindings]) => {
              const isExp = expandedPages.has(url);
              const page = pages.find(p => p.url === url);
              const isSW = url === '__site_wide__';
              let name = isSW ? 'Site-wide issues' : url;
              try { if (!isSW) name = page?.title || new URL(url).pathname || url; } catch { /* */ }
              return (
                <div key={url} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <button onClick={() => togglePage(url)} className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left">
                    <div className="flex items-center gap-3 min-w-0">
                      {isExp ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{name}</p>
                        {!isSW && page && <p className="text-xs text-gray-500 mt-0.5"><span className="capitalize">{page.page_type}</span>{page.word_count ? ` · ${page.word_count} words` : ''}{page.load_time_ms ? ` · ${(page.load_time_ms / 1000).toFixed(1)}s` : ''}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {pageFindings.filter(f => f.severity === 'high').length > 0 && <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-medium">{pageFindings.filter(f => f.severity === 'high').length} high</span>}
                      <span className="text-xs text-gray-400">{pageFindings.length} issue{pageFindings.length !== 1 ? 's' : ''}</span>
                    </div>
                  </button>
                  {isExp && <div className="border-t border-gray-100 p-4 space-y-3">{pageFindings.map(f => renderFindingCard(f))}</div>}
                </div>
              );
            })}
          </div>
        )}

        {isAuthenticated && viewMode === 'category' && (
          <div className="space-y-3">
            {Array.from(findingsByCategory.entries()).map(([cat, catFindings]) => {
              const isExp = expandedCategories.has(cat);
              const cs = cat === 'crawlability' ? audit.crawlability_score : cat === 'machine_readability' ? audit.machine_readability_score : cat === 'commercial_clarity' ? audit.commercial_clarity_score : audit.trust_clarity_score;
              return (
                <div key={cat} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <button onClick={() => toggleCategory(cat)} className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left">
                    <div className="flex items-center gap-3">
                      {isExp ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
                      <div><p className="font-medium text-gray-900">{CATEGORY_LABELS[cat] || cat}</p><p className="text-xs text-gray-500 mt-0.5">{CATEGORY_DESCRIPTIONS[cat]}</p></div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-semibold" style={{ color: (cs ?? 0) >= 80 ? '#10B981' : (cs ?? 0) >= 60 ? '#34D399' : (cs ?? 0) >= 40 ? '#F59E0B' : '#EF4444' }}>{cs ?? 0}/100</span>
                      <span className="text-xs text-gray-400">{catFindings.length} issue{catFindings.length !== 1 ? 's' : ''}</span>
                    </div>
                  </button>
                  {isExp && <div className="border-t border-gray-100 p-4 space-y-3">{catFindings.map(f => renderFindingCard(f))}</div>}
                </div>
              );
            })}
          </div>
        )}

        {/* Signup gate for free users */}
        {!isAuthenticated && gatedCount > 0 && (
          <div className="mt-6 relative">
            <div className="bg-white rounded-xl border border-gray-200 p-5 opacity-40 blur-[2px] pointer-events-none"><div className="flex items-start gap-3"><span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-50 text-xs font-semibold text-gray-500">{FREE_RECOMMENDATION_LIMIT + 1}</span><div><div className="h-4 w-64 bg-gray-200 rounded" /><div className="h-3 w-96 bg-gray-50 rounded mt-2" /></div></div></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-white rounded-xl border-2 border-blue-200 p-6 text-center shadow-lg max-w-sm">
                <Lock className="w-8 h-8 text-blue-600 mx-auto" />
                <h3 className="mt-3 font-semibold text-gray-900">{gatedCount} more recommendation{gatedCount > 1 ? 's' : ''} available</h3>
                <p className="mt-2 text-sm text-gray-600">Sign up free to see your full report with page-by-page analysis and filtering tools.</p>
                <a href={`/auth/signup?redirect=/audit/${audit.id}`} className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors text-sm">Unlock Full Report <ArrowRight className="w-4 h-4" /></a>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== FIX PACKAGE SECTION ===== */}
      {showFixPackage && fixPackage ? (
        <FixPackageView
          fixPackage={fixPackage}
          domain={audit.site?.domain || ''}
          overallScore={audit.overall_score ?? 0}
        />
      ) : (
        <div className="mb-8">
          <div className="bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 rounded-2xl border border-blue-200 p-8 text-center">
            <div className="max-w-lg mx-auto">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-blue-200">
                <Zap className="w-7 h-7 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Get Your Fix Package</h2>
              <p className="mt-3 text-gray-600 leading-relaxed">
                Don&apos;t just know what&apos;s wrong — get the actual code, content, and scripts to fix it.
                Ready-to-implement fixes customized for {audit.site?.domain || 'your site'}.
              </p>

              {/* What's included grid */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-6 mb-6">
                {[
                  { icon: <FileText className="w-4 h-4" />, label: 'Content' },
                  { icon: <Code2 className="w-4 h-4" />, label: 'Schema' },
                  { icon: <Globe className="w-4 h-4" />, label: 'Robots.txt' },
                  { icon: <Tag className="w-4 h-4" />, label: 'Meta Tags' },
                  { icon: <MessageSquare className="w-4 h-4" />, label: 'Citations' },
                  { icon: <Zap className="w-4 h-4" />, label: 'Auto-Deploy' },
                ].map((item) => (
                  <div key={item.label} className="bg-white/70 rounded-lg border border-blue-100 py-2.5 px-2">
                    <div className="text-blue-600 flex justify-center mb-1">{item.icon}</div>
                    <div className="text-[10px] font-semibold text-gray-600">{item.label}</div>
                  </div>
                ))}
              </div>

              <button
                onClick={generateFixPackage}
                disabled={fixLoading}
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg shadow-blue-200 disabled:opacity-60 disabled:cursor-not-allowed text-sm"
              >
                {fixLoading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Generating fixes…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate Fix Package
                  </>
                )}
              </button>
              {fixError && <p className="mt-3 text-sm text-red-600">{fixError}</p>}
              {fixLoading && (
                <p className="mt-3 text-sm text-gray-500">
                  Analyzing your audit data and building custom fixes… this takes 30-60 seconds.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pages table */}
      {isAuthenticated && pages.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Pages Analyzed</h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 border-b border-gray-200"><th className="text-left py-3 px-4 font-medium text-gray-600">Page</th><th className="text-left py-3 px-4 font-medium text-gray-600">Type</th><th className="text-center py-3 px-4 font-medium text-gray-600">Schema</th><th className="text-center py-3 px-4 font-medium text-gray-600">Issues</th><th className="text-right py-3 px-4 font-medium text-gray-600">Load Time</th></tr></thead>
                <tbody>
                  {pages.map((page) => (
                    <tr key={page.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-3 px-4"><div className="flex items-center gap-1.5 max-w-xs"><span className="truncate text-gray-900 font-medium" title={page.url}>{page.title || (() => { try { return new URL(page.url).pathname; } catch { return page.url; } })()}</span><a href={page.url} target="_blank" rel="noopener" className="shrink-0 text-gray-400 hover:text-blue-600"><ExternalLink className="w-3.5 h-3.5" /></a></div></td>
                      <td className="py-3 px-4"><span className="inline-flex px-2 py-0.5 text-xs rounded bg-gray-50 text-gray-600 capitalize">{page.page_type}</span></td>
                      <td className="py-3 px-4 text-center">{page.has_schema ? <CheckCircle className="w-4 h-4 text-green-500 mx-auto" /> : <span className="text-gray-300">—</span>}</td>
                      <td className="py-3 px-4 text-center">{page.issues.length > 0 ? <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">{page.issues.length}</span> : <CheckCircle className="w-4 h-4 text-green-500 mx-auto" />}</td>
                      <td className="py-3 px-4 text-right text-gray-600">{page.load_time_ms ? `${(page.load_time_ms / 1000).toFixed(1)}s` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {!isAuthenticated && pages.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Pages Analyzed</h2>
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
            <FileText className="w-8 h-8 text-gray-400 mx-auto" />
            <p className="mt-3 text-gray-600">We scanned {pages.length} pages. <a href={`/auth/signup?redirect=/audit/${audit.id}`} className="text-blue-600 hover:underline font-medium">Sign up free</a> to see the full page-by-page breakdown.</p>
          </div>
        </div>
      )}
    </div>
  );
}
