'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import ScoreRing, { ScoreBar } from '@/components/ScoreRing';
import SeverityBadge, { EffortBadge } from '@/components/SeverityBadge';
import { Lock, ArrowRight, CheckCircle, XCircle, ExternalLink, FileText, AlertTriangle, RefreshCw, ChevronDown, ChevronRight, Filter, Shield, Code, Eye, Bot, Copy, Check, Globe, Minus } from 'lucide-react';

// ============================================================
// Types
// ============================================================
interface CrawlerStatus { name: string; displayName: string; status: 'allowed' | 'blocked' | 'no_rule'; }
interface KeyPageStatus { type: string; label: string; found: boolean; url: string | null; }
interface PagePreview { url: string; title: string; metaDescription: string; h1: string; schemaTypes: string[]; wordCount: number | null; hasSchema: boolean; }

interface AuditData {
  audit: {
    id: string; status: string; overall_score: number | null;
    crawlability_score: number | null; machine_readability_score: number | null;
    commercial_clarity_score: number | null; trust_clarity_score: number | null;
    pages_scanned: number; summary: string | null; created_at: string;
    completed_at: string | null; site: { domain: string; url: string };
  };
  pages: Array<{
    id: string; url: string; page_type: string; title: string | null;
    has_schema: boolean; schema_types: string[]; meta_description: string | null;
    canonical_url: string | null; h1_text: string | null; word_count: number | null;
    load_time_ms: number | null; status_code: number | null; issues: string[];
  }>;
  findings: Array<{
    id: string; category: string; severity: string; title: string;
    description: string; affected_urls: string[];
  }>;
  recommendations: Array<{
    id: string; category: string; severity: string; effort: string;
    title: string; why_it_matters: string; recommended_fix: string;
    code_snippet?: string | null; priority_order: number;
  }>;
  crawlerStatuses: CrawlerStatus[];
  keyPagesStatus: KeyPageStatus[];
  pagePreviews: PagePreview[];
}

type ViewMode = 'priority' | 'page' | 'category';
type SeverityFilter = 'all' | 'high' | 'medium' | 'low';

const FREE_RECOMMENDATION_LIMIT = 3;

const CATEGORY_LABELS: Record<string, string> = {
  crawlability: 'Crawlability', machine_readability: 'Machine Readability',
  commercial_clarity: 'Commercial Page Clarity', trust_clarity: 'Trust & Source Clarity',
};
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  crawlability: 'Can AI crawlers access and navigate your site?',
  machine_readability: 'Can AI systems understand your page content?',
  commercial_clarity: 'Are your key commercial pages structured for AI discovery?',
  trust_clarity: 'Does your site establish trust and authority signals?',
};

function getIssueDetail(issue: string): { why: string; fix: string; category: string } {
  const map: Record<string, { why: string; fix: string; category: string }> = {
    'Missing page title': { why: 'Title tags are the primary way AI systems identify what a page is about.', fix: 'Add a unique, descriptive <title> tag (50-60 characters).', category: 'machine_readability' },
    'Page title is very short': { why: 'Short titles give AI very little context about the page.', fix: 'Expand the title to 50-60 characters with your brand name.', category: 'machine_readability' },
    'Page title is very long (may truncate)': { why: 'Long titles get cut off and may confuse AI about the primary topic.', fix: 'Shorten to under 60 characters. Put keywords first.', category: 'machine_readability' },
    'Missing meta description': { why: 'Meta descriptions are used as summaries when AI references your content.', fix: 'Add a meta description (120-155 characters) describing the page.', category: 'machine_readability' },
    'Meta description is very short': { why: 'Short meta descriptions miss the chance to tell AI what the page offers.', fix: 'Expand to 120-155 characters with a clear value proposition.', category: 'machine_readability' },
    'Meta description is very long': { why: 'Long meta descriptions get truncated by AI systems.', fix: 'Trim to under 155 characters. Lead with key info.', category: 'machine_readability' },
    'Missing canonical tag': { why: 'Without a canonical tag, AI may index duplicate versions of this page.', fix: 'Add <link rel="canonical" href="..."> pointing to the preferred URL.', category: 'machine_readability' },
    'No structured data (JSON-LD) found': { why: 'Structured data tells AI exactly what this page represents.', fix: 'Add JSON-LD: Organization on homepage, Product on product pages, Article on blog posts.', category: 'machine_readability' },
    'Missing H1 heading': { why: 'The H1 is a strong signal for page topic.', fix: 'Add a single, clear H1 describing the main topic.', category: 'machine_readability' },
    'Very thin content (under 100 words)': { why: 'Pages with very little text are unlikely to be referenced by AI.', fix: 'Add meaningful content (at least 200-300 words).', category: 'machine_readability' },
    'Page may rely heavily on JavaScript for content rendering': { why: 'AI crawlers often cannot execute JavaScript — they may see a blank page.', fix: 'Ensure critical content is in the initial HTML.', category: 'crawlability' },
  };
  return map[issue] || { why: 'This issue may reduce AI visibility.', fix: 'Review and address to improve AI visibility.', category: 'machine_readability' };
}

// Generate code snippets client-side based on recommendation title and domain
function generateCodeSnippet(title: string, domain: string): string | null {
  const siteUrl = `https://${domain}`;
  const name = domain.replace(/\.(com|io|co|org|net)$/, '').replace(/^www\./, '');

  if (title.includes('robots.txt')) return `# robots.txt\nUser-agent: *\nAllow: /\n\nUser-agent: GPTBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml`;
  if (title.includes('XML sitemap') || title.includes('sitemap')) return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${siteUrl}/</loc>\n    <priority>1.0</priority>\n  </url>\n  <url>\n    <loc>${siteUrl}/pricing</loc>\n    <priority>0.9</priority>\n  </url>\n  <url>\n    <loc>${siteUrl}/product</loc>\n    <priority>0.9</priority>\n  </url>\n</urlset>`;
  if (title.includes('Organization structured data') || title.includes('Organization schema')) return `<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "Organization",\n  "name": "${name}",\n  "url": "${siteUrl}",\n  "logo": "${siteUrl}/logo.png",\n  "description": "Your company description here",\n  "sameAs": [\n    "https://twitter.com/${name}",\n    "https://linkedin.com/company/${name}"\n  ]\n}\n</script>`;
  if (title.includes('structured data') || title.includes('JSON-LD')) return `<!-- Product page -->\n<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "SoftwareApplication",\n  "name": "${name}",\n  "applicationCategory": "BusinessApplication",\n  "description": "Your product description",\n  "offers": {\n    "@type": "Offer",\n    "price": "0",\n    "priceCurrency": "USD"\n  }\n}\n</script>`;
  if (title.includes('meta description')) return `<meta name="description" content="Compelling description of this page (120-155 chars). Include your product name and key value proposition.">`;
  if (title.includes('canonical')) return `<!-- Add to <head> of each page -->\n<link rel="canonical" href="https://${domain}/your-page-path">`;
  if (title.includes('title')) return `<title>Your Page Topic — ${name}</title>`;
  if (title.includes('H1')) return `<h1>Clear, Descriptive Main Heading</h1>`;
  return null;
}

// Generate AI visibility summary from scan data (no API needed)
function generateAiSummary(audit: AuditData['audit'], crawlerStatuses: CrawlerStatus[], keyPagesStatus: KeyPageStatus[], findingsCount: number, highCount: number): string {
  const domain = audit.site?.domain || 'this site';
  const score = audit.overall_score ?? 0;
  const parts: string[] = [];

  // Overall assessment
  if (score >= 80) parts.push(`${domain} has strong AI visibility with a score of ${score}/100. AI systems can likely find and reference most of your key content.`);
  else if (score >= 60) parts.push(`${domain} has moderate AI visibility with a score of ${score}/100. AI systems can find your site, but several improvements would help them better understand and recommend your product.`);
  else if (score >= 40) parts.push(`${domain} has limited AI visibility with a score of ${score}/100. AI systems may struggle to accurately describe your product or recommend it to users.`);
  else parts.push(`${domain} has poor AI visibility with a score of ${score}/100. AI systems likely cannot find or accurately reference most of your key content. Immediate action is needed.`);

  // Crawler access
  const blocked = crawlerStatuses?.filter(c => c.status === 'blocked') || [];
  const allowed = crawlerStatuses?.filter(c => c.status === 'allowed') || [];
  if (blocked.length > 0) parts.push(`${blocked.length} AI crawler(s) are actively blocked, including ${blocked.slice(0, 3).map(b => b.displayName).join(', ')}. These systems cannot access your site at all.`);
  else if (allowed.length > 0) parts.push(`AI crawlers have access to your site, which is good.`);

  // Missing pages
  const missing = keyPagesStatus?.filter(kp => !kp.found) || [];
  if (missing.length > 0) parts.push(`Key pages missing: ${missing.map(m => m.label).join(', ')}. Without these, AI cannot answer common buyer questions about your product.`);

  // Issues
  if (highCount > 0) parts.push(`There are ${highCount} high-priority issues that should be addressed first to significantly improve how AI systems perceive and recommend ${domain}.`);

  return parts.join('\n\n');
}

// ============================================================
// Code snippet copy button
// ============================================================
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors"
      style={{ color: copied ? '#10B981' : 'var(--text-tertiary)', background: 'var(--bg-tertiary)' }}>
      {copied ? <><Check className="w-3 h-3" />Copied</> : <><Copy className="w-3 h-3" />Copy</>}
    </button>
  );
}

// ============================================================
// Main component
// ============================================================
export default function AuditResultPage() {
  const params = useParams();
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('priority');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['crawlability', 'machine_readability', 'commercial_clarity', 'trust_clarity']));
  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null);

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
      } catch { setError('Failed to load audit'); }
      finally { setLoading(false); }
    }
    load();
  }, [params.id]);

  const allFindings = useMemo(() => {
    if (!data) return [];
    const items: Array<{ id: string; title: string; why: string; fix: string; codeSnippet: string | null; severity: 'high' | 'medium' | 'low'; effort: 'easy' | 'medium' | 'harder'; category: string; affectedUrls: string[]; priorityOrder: number; }> = [];
    const domain = data.audit.site?.domain || 'example.com';
    for (const rec of data.recommendations) {
      items.push({ id: rec.id, title: rec.title, why: rec.why_it_matters, fix: rec.recommended_fix, codeSnippet: generateCodeSnippet(rec.title, domain), severity: rec.severity as 'high' | 'medium' | 'low', effort: rec.effort as 'easy' | 'medium' | 'harder', category: rec.category, affectedUrls: data.findings.find(f => f.title === rec.title)?.affected_urls || [], priorityOrder: rec.priority_order });
    }
    const recTitles = new Set(data.recommendations.map(r => r.title.toLowerCase()));
    const pageIssueMap = new Map<string, string[]>();
    for (const page of data.pages) { for (const issue of page.issues) { if (!pageIssueMap.has(issue)) pageIssueMap.set(issue, []); pageIssueMap.get(issue)!.push(page.url); } }
    for (const [issue, urls] of Array.from(pageIssueMap.entries())) {
      const alreadyCovered = Array.from(recTitles).some(t => t.includes(issue.toLowerCase().substring(0, 20)));
      if (alreadyCovered) continue;
      const detail = getIssueDetail(issue);
      items.push({ id: `pi-${issue.replace(/\s/g, '-')}`, title: issue, why: detail.why, fix: detail.fix, codeSnippet: null, severity: issue.includes('Missing page title') || issue.includes('Missing H1') ? 'medium' : 'low', effort: 'easy', category: detail.category, affectedUrls: urls, priorityOrder: 100 });
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

  function togglePage(url: string) { setExpandedPages(prev => { const n = new Set(prev); if (n.has(url)) n.delete(url); else n.add(url); return n; }); }
  function toggleCategory(cat: string) { setExpandedCategories(prev => { const n = new Set(prev); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; }); }

  if (loading) return (<div className="max-w-4xl mx-auto px-4 py-20 text-center"><div className="animate-spin w-8 h-8 border-2 rounded-full mx-auto" style={{ borderColor: '#6366F1', borderTopColor: 'transparent' }} /><p className="mt-4" style={{ color: 'var(--text-tertiary)' }}>Loading audit results…</p></div>);
  if (error || !data) return (<div className="max-w-4xl mx-auto px-4 py-20 text-center"><AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" /><p className="mt-4 font-medium" style={{ color: 'var(--text-primary)' }}>{error || 'Something went wrong'}</p><a href="/" className="mt-4 inline-block" style={{ color: '#6366F1' }}>← Try another URL</a></div>);

  const { audit, pages, recommendations, crawlerStatuses, keyPagesStatus, pagePreviews } = data;
  if (audit.status === 'failed') return (<div className="max-w-4xl mx-auto px-4 py-20 text-center"><AlertTriangle className="w-10 h-10 text-red-500 mx-auto" /><h2 className="mt-4 text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Scan failed</h2><p className="mt-2" style={{ color: 'var(--text-secondary)' }}>{audit.summary || 'The site could not be scanned.'}</p><a href="/" className="mt-6 inline-block" style={{ color: '#6366F1' }}>← Try another URL</a></div>);

  const visibleRecs = isAuthenticated ? recommendations : recommendations.slice(0, FREE_RECOMMENDATION_LIMIT);
  const gatedCount = recommendations.length - FREE_RECOMMENDATION_LIMIT;
  const highCount = allFindings.filter(f => f.severity === 'high').length;
  const medCount = allFindings.filter(f => f.severity === 'medium').length;
  const lowCount = allFindings.filter(f => f.severity === 'low').length;

  function renderFindingCard(finding: typeof allFindings[0], index?: number) {
    const hasSnippet = !!finding.codeSnippet;
    return (
      <div key={finding.id} className={`rounded-xl border p-5 finding-${finding.severity}`} style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {index !== undefined && <span className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 mt-0.5" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{index + 1}</span>}
            <div className="min-w-0">
              <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{finding.title}</h3>
              <div className="mt-2 rounded-lg p-3 border" style={{ background: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.15)' }}>
                <p className="text-sm font-medium" style={{ color: '#F59E0B' }}>Why it matters</p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{finding.why}</p>
              </div>
              <div className="mt-2 rounded-lg p-3 border" style={{ background: 'rgba(99,102,241,0.06)', borderColor: 'rgba(99,102,241,0.15)' }}>
                <p className="text-sm font-medium" style={{ color: '#6366F1' }}>Recommended fix</p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{finding.fix}</p>
              </div>
              {hasSnippet && (
                <div className="mt-3 rounded-lg p-3 overflow-x-auto border" style={{ background: '#0F172A', borderColor: '#1E293B' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium flex items-center gap-1" style={{ color: '#818CF8' }}><Code className="w-3 h-3" />Copy &amp; paste this code:</span>
                    <CopyButton text={finding.codeSnippet!} />
                  </div>
                  <pre className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: '#E2E8F0', fontFamily: 'var(--font-mono)' }}>{finding.codeSnippet}</pre>
                </div>
              )}
              {finding.affectedUrls.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Affected pages:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {finding.affectedUrls.slice(0, 5).map((url) => { let p = url; try { p = new URL(url).pathname; } catch {} return (<a key={url} href={url} target="_blank" rel="noopener" className="text-xs px-2 py-0.5 rounded truncate max-w-[220px]" style={{ color: '#6366F1', background: 'rgba(99,102,241,0.08)' }} title={url}>{p || '/'}</a>); })}
                    {finding.affectedUrls.length > 5 && <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>+{finding.affectedUrls.length - 5} more</span>}
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
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>AI Visibility Report</h1>
          <p className="mt-1" style={{ color: 'var(--text-tertiary)' }}>{audit.site?.domain} · {new Date(audit.created_at).toLocaleDateString()}{audit.pages_scanned > 0 && ` · ${audit.pages_scanned} pages`}</p>
        </div>
        <a href="/" className="btn-secondary inline-flex items-center gap-2 px-4 py-2 text-sm"><RefreshCw className="w-4 h-4" />New Audit</a>
      </div>

      {/* Score overview */}
      <div className="card p-6 sm:p-8 mb-6">
        <div className="flex flex-col sm:flex-row items-center gap-8">
          <ScoreRing score={audit.overall_score ?? 0} label="Overall Score" size={160} />
          <div className="flex-1 w-full space-y-3">
            <ScoreBar score={audit.crawlability_score ?? 0} label="Crawlability" />
            <ScoreBar score={audit.machine_readability_score ?? 0} label="Readability" />
            <ScoreBar score={audit.commercial_clarity_score ?? 0} label="Commercial" />
            <ScoreBar score={audit.trust_clarity_score ?? 0} label="Trust" />
          </div>
        </div>
        {audit.summary && <p className="mt-6 text-sm rounded-lg p-4" style={{ color: 'var(--text-secondary)', background: 'var(--bg-tertiary)' }}>{audit.summary}</p>}
      </div>

      {/* ===== FEATURE 1: Per-Crawler Status ===== */}
      {isAuthenticated && crawlerStatuses && crawlerStatuses.length > 0 && (
        <div className="card p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5" style={{ color: '#6366F1' }} />
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>AI Crawler Access</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {crawlerStatuses.map((c) => (
              <div key={c.name} className="rounded-lg p-3 border text-center" style={{ borderColor: 'var(--border)', background: 'var(--bg-tertiary)' }}>
                <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{c.displayName}</p>
                {c.status === 'allowed' && <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-500"><CheckCircle className="w-3.5 h-3.5" />Allowed</span>}
                {c.status === 'blocked' && <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-500"><XCircle className="w-3.5 h-3.5" />Blocked</span>}
                {c.status === 'no_rule' && <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}><Minus className="w-3.5 h-3.5" />No Rule</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== FEATURE 3: Key Pages Found vs Missing ===== */}
      {isAuthenticated && keyPagesStatus && keyPagesStatus.length > 0 && (
        <div className="card p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="w-5 h-5" style={{ color: '#6366F1' }} />
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Key Pages Status</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {keyPagesStatus.map((kp) => (
              <div key={kp.type} className="rounded-lg p-3 border" style={{ borderColor: kp.found ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)', background: kp.found ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)' }}>
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>{kp.label}</p>
                {kp.found ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-500"><CheckCircle className="w-3.5 h-3.5" />Found</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-500"><XCircle className="w-3.5 h-3.5" />Missing</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== AI VISIBILITY SUMMARY ===== */}
      {isAuthenticated && (
        <div className="card p-6 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Bot className="w-5 h-5" style={{ color: '#6366F1' }} />
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>AI Visibility Summary</h2>
          </div>
          <div className="p-4 rounded-lg border" style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border)' }}>
            <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
              {generateAiSummary(audit, crawlerStatuses || [], keyPagesStatus || [], allFindings.length, highCount)}
            </p>
          </div>
        </div>
      )}

      {/* Issue summary bar */}
      <div className="flex items-center gap-3 mb-6 text-sm">
        <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>{allFindings.length} findings:</span>
        {highCount > 0 && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium" style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}>{highCount} high</span>}
        {medCount > 0 && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium" style={{ background: 'rgba(245,158,11,0.1)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.2)' }}>{medCount} medium</span>}
        {lowCount > 0 && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366F1', border: '1px solid rgba(99,102,241,0.2)' }}>{lowCount} low</span>}
      </div>

      {/* View toggle and filters */}
      {isAuthenticated && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ background: 'var(--bg-tertiary)' }}>
            {(['priority', 'page', 'category'] as ViewMode[]).map((mode) => (
              <button key={mode} onClick={() => setViewMode(mode)} className="px-3 py-1.5 text-sm font-medium rounded-md transition-colors" style={{ background: viewMode === mode ? 'var(--surface)' : 'transparent', color: viewMode === mode ? 'var(--text-primary)' : 'var(--text-tertiary)', boxShadow: viewMode === mode ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                {mode === 'priority' ? 'By Priority' : mode === 'page' ? 'By Page' : 'By Category'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
            <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)} className="text-sm rounded-lg px-3 py-1.5" style={{ background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
              <option value="all">All severities</option>
              <option value="high">High only</option>
              <option value="medium">Medium only</option>
              <option value="low">Low only</option>
            </select>
          </div>
        </div>
      )}

      {/* Findings section */}
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>{isAuthenticated ? 'Detailed Findings' : 'Top Recommendations'}</h2>

        {(!isAuthenticated || viewMode === 'priority') && (
          <div className="space-y-4">
            {(isAuthenticated ? [...filteredFindings].sort((a, b) => { const s: Record<string, number> = { high: 0, medium: 1, low: 2 }; return (s[a.severity] - s[b.severity]) || (a.priorityOrder - b.priorityOrder); }) : visibleRecs.map((rec, i) => ({ id: rec.id, title: rec.title, why: rec.why_it_matters, fix: rec.recommended_fix, codeSnippet: generateCodeSnippet(rec.title, audit.site?.domain || 'example.com'), severity: rec.severity as 'high' | 'medium' | 'low', effort: rec.effort as 'easy' | 'medium' | 'harder', category: rec.category, affectedUrls: [] as string[], priorityOrder: i }))).map((finding, i) => renderFindingCard(finding, i))}
          </div>
        )}

        {isAuthenticated && viewMode === 'page' && (
          <div className="space-y-3">
            {Array.from(findingsByPage.entries()).map(([url, pageFindings]) => {
              const isExp = expandedPages.has(url);
              const page = pages.find(p => p.url === url);
              const isSW = url === '__site_wide__';
              let name = isSW ? 'Site-wide issues' : url;
              try { if (!isSW) name = page?.title || new URL(url).pathname || url; } catch {}
              return (
                <div key={url} className="rounded-xl border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                  <button onClick={() => togglePage(url)} className="w-full flex items-center justify-between p-4 transition-colors text-left" style={{ background: isExp ? 'var(--bg-tertiary)' : 'transparent' }}>
                    <div className="flex items-center gap-3 min-w-0">
                      {isExp ? <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} /> : <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />}
                      <div className="min-w-0">
                        <p className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>{name}</p>
                        {!isSW && page && <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}><span className="capitalize">{page.page_type}</span>{page.word_count ? ` · ${page.word_count} words` : ''}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {pageFindings.filter(f => f.severity === 'high').length > 0 && <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>{pageFindings.filter(f => f.severity === 'high').length} high</span>}
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{pageFindings.length} issue{pageFindings.length !== 1 ? 's' : ''}</span>
                    </div>
                  </button>
                  {isExp && <div className="border-t p-4 space-y-3" style={{ borderColor: 'var(--border)' }}>{pageFindings.map(f => renderFindingCard(f))}</div>}
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
                <div key={cat} className="rounded-xl border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                  <button onClick={() => toggleCategory(cat)} className="w-full flex items-center justify-between p-4 transition-colors text-left">
                    <div className="flex items-center gap-3">
                      {isExp ? <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} /> : <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />}
                      <div><p className="font-medium" style={{ color: 'var(--text-primary)' }}>{CATEGORY_LABELS[cat] || cat}</p><p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{CATEGORY_DESCRIPTIONS[cat]}</p></div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-bold" style={{ color: (cs ?? 0) >= 80 ? '#10B981' : (cs ?? 0) >= 50 ? '#F59E0B' : '#EF4444', fontFamily: 'var(--font-mono)' }}>{cs ?? 0}/100</span>
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{catFindings.length} issue{catFindings.length !== 1 ? 's' : ''}</span>
                    </div>
                  </button>
                  {isExp && <div className="border-t p-4 space-y-3" style={{ borderColor: 'var(--border)' }}>{catFindings.map(f => renderFindingCard(f))}</div>}
                </div>
              );
            })}
          </div>
        )}

        {/* Gate */}
        {!isAuthenticated && gatedCount > 0 && (
          <div className="mt-6 relative">
            <div className="rounded-xl border p-5 opacity-40 blur-[2px] pointer-events-none" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}><div className="flex items-start gap-3"><span className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)' }}>{FREE_RECOMMENDATION_LIMIT + 1}</span><div><div className="h-4 w-64 rounded" style={{ background: 'var(--bg-tertiary)' }} /><div className="h-3 w-96 rounded mt-2" style={{ background: 'var(--bg-tertiary)' }} /></div></div></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="rounded-xl border-2 p-6 text-center shadow-lg max-w-sm" style={{ background: 'var(--surface)', borderColor: 'rgba(99,102,241,0.3)' }}>
                <Lock className="w-8 h-8 mx-auto" style={{ color: '#6366F1' }} />
                <h3 className="mt-3 font-semibold" style={{ color: 'var(--text-primary)' }}>{gatedCount} more finding{gatedCount > 1 ? 's' : ''} available</h3>
                <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>Sign up free to unlock crawler status, page analysis, code snippets, and AI perception check.</p>
                <a href={`/auth/signup?redirect=/audit/${audit.id}`} className="mt-4 btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm">Unlock Full Report <ArrowRight className="w-4 h-4" /></a>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== WHAT AI CRAWLERS SEE ===== */}
      {isAuthenticated && pagePreviews && pagePreviews.length > 0 && (
        <div className="card p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Eye className="w-5 h-5" style={{ color: '#6366F1' }} />
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>What AI Crawlers See</h2>
          </div>
          <p className="text-sm mb-4" style={{ color: 'var(--text-tertiary)' }}>What bots read when they visit your pages — no JavaScript rendering.</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {pagePreviews.slice(0, 8).map((pp) => {
              let path = pp.url; try { path = new URL(pp.url).pathname || '/'; } catch {}
              return (
                <button key={pp.url} onClick={() => setActivePreviewUrl(activePreviewUrl === pp.url ? null : pp.url)}
                  className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
                  style={{ borderColor: activePreviewUrl === pp.url ? '#6366F1' : 'var(--border)', background: activePreviewUrl === pp.url ? 'rgba(99,102,241,0.1)' : 'var(--bg-tertiary)', color: activePreviewUrl === pp.url ? '#6366F1' : 'var(--text-secondary)' }}>
                  {path}
                </button>
              );
            })}
          </div>
          {activePreviewUrl && (() => {
            const pp = pagePreviews.find(p => p.url === activePreviewUrl);
            if (!pp) return null;
            const pageIssues = pages.find(p => p.url === activePreviewUrl)?.issues || [];
            return (
              <div>
                <div className="rounded-lg p-4 border font-mono text-xs leading-relaxed mb-3" style={{ background: '#0F172A', borderColor: '#1E293B', color: '#E2E8F0' }}>
                  <div><span style={{ color: '#6366F1' }}>Title:</span> {pp.title}</div>
                  <div><span style={{ color: '#6366F1' }}>Meta:</span> {pp.metaDescription}</div>
                  <div><span style={{ color: '#6366F1' }}>H1:</span> {pp.h1}</div>
                  <div><span style={{ color: '#6366F1' }}>Schema:</span> {pp.schemaTypes.length > 0 ? pp.schemaTypes.join(', ') : 'none'}</div>
                  <div><span style={{ color: '#6366F1' }}>Words:</span> {pp.wordCount || 'unknown'}</div>
                </div>
                {pageIssues.length > 0 && (
                  <div className="rounded-lg p-4 border" style={{ borderColor: 'rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.05)' }}>
                    <p className="text-xs font-semibold mb-3" style={{ color: '#F59E0B' }}>Recommendations for this page:</p>
                    <div className="space-y-3">
                      {pageIssues.map((issue, i) => {
                        const detail = getIssueDetail(issue);
                        const snippet = generateCodeSnippet(issue, audit.site?.domain || 'example.com');
                        return (
                          <div key={i}>
                            <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}><strong style={{ color: 'var(--text-primary)' }}>{issue}</strong> — {detail.fix}</p>
                            {snippet && (
                              <div className="rounded-md p-2.5 mt-1.5 border overflow-x-auto" style={{ background: '#0F172A', borderColor: '#1E293B' }}>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs" style={{ color: '#818CF8' }}>Suggested code:</span>
                                  <CopyButton text={snippet} />
                                </div>
                                <pre className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: '#E2E8F0', fontFamily: 'var(--font-mono)' }}>{snippet}</pre>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {pageIssues.length === 0 && (
                  <div className="rounded-lg p-3 border" style={{ borderColor: 'rgba(16,185,129,0.2)', background: 'rgba(16,185,129,0.05)' }}>
                    <p className="text-xs font-semibold" style={{ color: '#10B981' }}>✓ This page looks good — no issues found for AI crawlers.</p>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Pages table */}
      {isAuthenticated && pages.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Pages Analyzed</h2>
          <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr style={{ background: 'var(--bg-tertiary)' }}><th className="text-left py-3 px-4 font-medium" style={{ color: 'var(--text-tertiary)' }}>Page</th><th className="text-left py-3 px-4 font-medium" style={{ color: 'var(--text-tertiary)' }}>Type</th><th className="text-center py-3 px-4 font-medium" style={{ color: 'var(--text-tertiary)' }}>Schema</th><th className="text-center py-3 px-4 font-medium" style={{ color: 'var(--text-tertiary)' }}>Issues</th><th className="text-right py-3 px-4 font-medium" style={{ color: 'var(--text-tertiary)' }}>Load Time</th></tr></thead>
                <tbody>
                  {pages.map((page) => (
                    <tr key={page.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                      <td className="py-3 px-4"><div className="flex items-center gap-1.5 max-w-xs"><span className="truncate font-medium" style={{ color: 'var(--text-primary)' }} title={page.url}>{page.title || new URL(page.url).pathname}</span><a href={page.url} target="_blank" rel="noopener" style={{ color: 'var(--text-tertiary)' }}><ExternalLink className="w-3.5 h-3.5" /></a></div></td>
                      <td className="py-3 px-4"><span className="inline-flex px-2 py-0.5 text-xs rounded capitalize" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>{page.page_type}</span></td>
                      <td className="py-3 px-4 text-center">{page.has_schema ? <CheckCircle className="w-4 h-4 text-emerald-500 mx-auto" /> : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}</td>
                      <td className="py-3 px-4 text-center">{page.issues.length > 0 ? <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold" style={{ background: 'rgba(245,158,11,0.15)', color: '#FBBF24' }}>{page.issues.length}</span> : <CheckCircle className="w-4 h-4 text-emerald-500 mx-auto" />}</td>
                      <td className="py-3 px-4 text-right" style={{ color: 'var(--text-secondary)' }}>{page.load_time_ms ? `${(page.load_time_ms / 1000).toFixed(1)}s` : '—'}</td>
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
          <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Pages Analyzed</h2>
          <div className="card p-6 text-center">
            <FileText className="w-8 h-8 mx-auto" style={{ color: 'var(--text-tertiary)' }} />
            <p className="mt-3" style={{ color: 'var(--text-secondary)' }}>We scanned {pages.length} pages. <a href={`/auth/signup?redirect=/audit/${audit.id}`} className="font-medium" style={{ color: '#6366F1' }}>Sign up free</a> to see the full breakdown.</p>
          </div>
        </div>
      )}
    </div>
  );
}
