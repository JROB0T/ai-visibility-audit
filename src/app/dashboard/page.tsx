'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Search, Globe, Plus, AlertTriangle, ChevronRight, Building2 } from 'lucide-react';
import { scoreToGrade, getScoreColor } from '@/components/ScoreRing';
import { VERTICAL_OPTIONS, getVerticalLabel } from '@/lib/verticals';

interface SiteWithLatest {
  id: string;
  domain: string;
  url: string;
  vertical: string | null;
  created_at: string;
  latest_audit: {
    id: string; overall_score: number | null;
    crawlability_score: number | null; machine_readability_score: number | null;
    commercial_clarity_score: number | null; trust_clarity_score: number | null;
    pages_scanned: number; status: string; created_at: string;
  } | null;
  audit_count: number;
}

export default function DashboardPage() {
  const [sites, setSites] = useState<SiteWithLatest[]>([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState('');
  const [vertical, setVertical] = useState('other');
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth/login?redirect=/dashboard'); return; }

      const { data: userSites } = await supabase
        .from('sites').select('id, domain, url, vertical, created_at')
        .eq('user_id', user.id).order('created_at', { ascending: false });

      if (!userSites || userSites.length === 0) { setLoading(false); return; }

      const sitesWithAudits: SiteWithLatest[] = [];
      for (const site of userSites) {
        const { data: audits } = await supabase
          .from('audits')
          .select('id, overall_score, crawlability_score, machine_readability_score, commercial_clarity_score, trust_clarity_score, pages_scanned, status, created_at')
          .eq('site_id', site.id).order('created_at', { ascending: false });

        const existing = sitesWithAudits.find(s => s.domain === site.domain);
        const auditCount = audits?.length || 0;
        if (existing) {
          if (auditCount > existing.audit_count) {
            const idx = sitesWithAudits.indexOf(existing);
            sitesWithAudits[idx] = { ...site, latest_audit: audits?.[0] || null, audit_count: auditCount };
          }
          continue;
        }
        sitesWithAudits.push({ ...site, latest_audit: audits?.[0] || null, audit_count: auditCount });
      }
      setSites(sitesWithAudits);
      setLoading(false);
    }
    load();
  }, [router]);

  async function handleNewAudit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setScanning(true); setError('');
    try {
      const res = await fetch('/api/audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url.trim(), vertical }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Scan failed'); return; }
      router.push(`/audit/${data.auditId}`);
    } catch { setError('Could not connect'); }
    finally { setScanning(false); }
  }

  function scoreColor(s: number | null) {
    return getScoreColor(s ?? 0);
  }

  if (loading) return (<div className="max-w-5xl mx-auto px-4 py-20 text-center"><div className="animate-spin w-8 h-8 border-2 rounded-full mx-auto" style={{ borderColor: '#6366F1', borderTopColor: 'transparent' }} /><p className="mt-4" style={{ color: 'var(--text-tertiary)' }}>Loading your sites…</p></div>);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Your Sites</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>{sites.length} site{sites.length !== 1 ? 's' : ''} · {sites.reduce((sum, s) => sum + s.audit_count, 0)} total scans</p>
        </div>
      </div>

      <form onSubmit={handleNewAudit} className="mb-8">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
            <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Enter a new website URL to scan…"
              className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm" style={{ background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)' }} />
          </div>
          <div className="relative shrink-0">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
            <select
              value={vertical}
              onChange={(e) => setVertical(e.target.value)}
              className="pl-9 pr-3 py-2.5 rounded-lg text-sm appearance-none"
              style={{ background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            >
              {VERTICAL_OPTIONS.map((v) => (
                <option key={v.value} value={v.value}>{v.label}</option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={scanning} className="btn-primary px-5 py-2.5 text-sm font-medium inline-flex items-center gap-2" style={{ opacity: scanning ? 0.7 : 1 }}>
            {scanning ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Scanning…</> : <><Plus className="w-4 h-4" />Scan Site</>}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      </form>

      {sites.length === 0 ? (
        <div className="card p-12 text-center">
          <Globe className="w-12 h-12 mx-auto" style={{ color: 'var(--text-tertiary)' }} />
          <h2 className="mt-4 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>No sites yet</h2>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>Enter a URL above to run your first AI visibility audit.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sites.map((site) => {
            const la = site.latest_audit;
            const score = la?.overall_score;
            return (
              <a key={site.id} href={`/site/${site.id}`}
                className="card p-5 transition-all hover:shadow-lg hover:border-indigo-500/30 group cursor-pointer" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{site.domain}</h3>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                      {getVerticalLabel(site.vertical)} · {site.audit_count} scan{site.audit_count !== 1 ? 's' : ''}{la && ` · ${new Date(la.created_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#6366F1' }} />
                </div>
                {la && la.status === 'completed' ? (
                  <>
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-3xl font-bold" style={{ color: scoreColor(score ?? null), fontFamily: 'var(--font-mono)' }}>{scoreToGrade(score ?? 0)}</span>
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{score}/100</span>
                    </div>
                    <div className="space-y-1.5">
                      {[{ label: 'Crawl', s: la.crawlability_score }, { label: 'Read', s: la.machine_readability_score }, { label: 'Commercial', s: la.commercial_clarity_score }, { label: 'Trust', s: la.trust_clarity_score }].map(({ label, s }) => (
                        <div key={label} className="flex items-center gap-2">
                          <span className="text-xs w-20" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
                          <div className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--bg-tertiary)' }}>
                            <div className="h-full rounded-full" style={{ width: `${s ?? 0}%`, background: scoreColor(s ?? 0) }} />
                          </div>
                          <span className="text-xs font-bold w-7 text-right" style={{ color: scoreColor(s ?? 0), fontFamily: 'var(--font-mono)' }}>{scoreToGrade(s ?? 0)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : la?.status === 'failed' ? (
                  <div className="flex items-center gap-2 py-4"><AlertTriangle className="w-4 h-4 text-red-500" /><span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Last scan failed</span></div>
                ) : (<p className="text-sm py-4" style={{ color: 'var(--text-tertiary)' }}>No completed scans yet</p>)}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
