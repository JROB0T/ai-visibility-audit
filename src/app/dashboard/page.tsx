'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Search, Plus, AlertTriangle, ChevronRight, X, CheckCircle, Sparkles } from 'lucide-react';
import { scoreToGrade, getScoreColor } from '@/components/ScoreRing';
import { getVerticalLabel } from '@/lib/verticals';
import { getRunTypeLabel } from '@/lib/entitlements';

interface SiteWithLatest {
  id: string;
  domain: string;
  url: string;
  vertical: string | null;
  plan_status: string | null;
  has_monthly_monitoring: boolean;
  created_at: string;
  latest_audit: {
    id: string; overall_score: number | null;
    crawlability_score: number | null; machine_readability_score: number | null;
    commercial_clarity_score: number | null; trust_clarity_score: number | null;
    pages_scanned: number; status: string; run_type: string | null; created_at: string;
  } | null;
  audit_count: number;
}

function DashboardContent() {
  const [sites, setSites] = useState<SiteWithLatest[]>([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState('');
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  function focusUrlInput() {
    urlInputRef.current?.focus();
    urlInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  useEffect(() => {
    if (searchParams.get('checkout') === 'success') setCheckoutSuccess(true);
  }, [searchParams]);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth/login?redirect=/dashboard'); return; }

      const { data: userSites } = await supabase
        .from('sites').select('id, domain, url, vertical, plan_status, has_monthly_monitoring, created_at')
        .eq('user_id', user.id).order('created_at', { ascending: false });

      if (!userSites || userSites.length === 0) { setLoading(false); return; }

      const sitesWithAudits: SiteWithLatest[] = [];
      for (const site of userSites) {
        const { data: audits } = await supabase
          .from('audits')
          .select('id, overall_score, crawlability_score, machine_readability_score, commercial_clarity_score, trust_clarity_score, pages_scanned, status, run_type, created_at')
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
      const res = await fetch('/api/audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url.trim() }) });
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
      {checkoutSuccess && (
        <div className="mb-6 p-4 rounded-xl border flex items-center justify-between" style={{ background: 'rgba(16,185,129,0.05)', borderColor: 'rgba(16,185,129,0.2)' }}>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5" style={{ color: '#10B981' }} />
            <p className="text-sm font-medium" style={{ color: '#10B981' }}>Payment successful! Your full report is now unlocked.</p>
          </div>
          <button onClick={() => setCheckoutSuccess(false)} style={{ color: 'var(--text-tertiary)' }}><X className="w-4 h-4" /></button>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Your Sites</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>{sites.length} site{sites.length !== 1 ? 's' : ''} · {sites.reduce((sum, s) => sum + s.audit_count, 0)} total scans</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <a
            href="/dashboard/batch-upload"
            className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border transition"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            Batch upload
          </a>
          <a
            href="/dashboard/api-keys"
            className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border transition"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            API keys
          </a>
          <a
            href="/dashboard/account"
            className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border transition"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            Account
          </a>
        </div>
      </div>

      <form onSubmit={handleNewAudit} className="mb-8">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
            <input ref={urlInputRef} type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Enter a website URL to scan…"
              className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm" style={{ background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)' }} />
          </div>
          <button type="submit" disabled={scanning || !url.trim()} className="btn-primary px-5 py-2.5 text-sm font-medium inline-flex items-center gap-2" style={{ opacity: scanning ? 0.7 : 1 }}>
            {scanning ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Scanning…</> : <><Plus className="w-4 h-4" />Scan Site</>}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      </form>

      {sites.length === 0 ? (
        <div className="card p-10 sm:p-12 text-center">
          <div
            className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center"
            style={{ background: 'rgba(99,102,241,0.1)' }}
          >
            <Sparkles className="w-7 h-7" style={{ color: '#6366F1' }} />
          </div>
          <h2 className="mt-5 text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Run your first AI visibility audit
          </h2>
          <p className="mt-2 text-sm max-w-md mx-auto" style={{ color: 'var(--text-secondary)' }}>
            See how ChatGPT, Claude, Perplexity, and Gemini describe a business
            when buyers ask for recommendations — and where you&rsquo;re missing.
          </p>

          <div className="mt-7 grid gap-3 sm:grid-cols-3 max-w-xl mx-auto text-left">
            {[
              { n: '1', t: 'Enter a URL', d: 'Any business website you want to check.' },
              { n: '2', t: 'We scan AI answers', d: 'Across the major AI assistants.' },
              { n: '3', t: 'Get your grade', d: 'Plus where competitors win instead.' },
            ].map((step) => (
              <div
                key={step.n}
                className="rounded-lg border p-3"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-tertiary)' }}
              >
                <span
                  className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold"
                  style={{ background: 'rgba(99,102,241,0.12)', color: '#6366F1' }}
                >
                  {step.n}
                </span>
                <p className="mt-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{step.t}</p>
                <p className="mt-0.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>{step.d}</p>
              </div>
            ))}
          </div>

          <button
            onClick={focusUrlInput}
            className="btn-primary mt-7 px-5 py-2.5 text-sm font-medium inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />Scan your first site
          </button>
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
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{getVerticalLabel(site.vertical)}</span>
                      {site.plan_status === 'core_premium' ? (
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ color: '#6366F1', background: 'rgba(99,102,241,0.1)' }}>Paid</span>
                      ) : site.has_monthly_monitoring ? (
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ color: '#10B981', background: 'rgba(16,185,129,0.1)' }}>Monthly</span>
                      ) : (
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)' }}>Free</span>
                      )}
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>· {site.audit_count} scan{site.audit_count !== 1 ? 's' : ''}{la && ` · ${new Date(la.created_at).toLocaleDateString()}`}</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#6366F1' }} />
                </div>
                {la && la.status === 'completed' ? (
                  <>
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-3xl font-bold" style={{ color: scoreColor(score ?? null), fontFamily: 'var(--font-mono)' }}>{scoreToGrade(score ?? 0)}</span>
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{score}/100</span>
                      {la.run_type && (() => {
                        const rtColor = la.run_type === 'paid_initial' ? '#6366F1' : la.run_type === 'free_preview' ? '#64748B' : la.run_type === 'monthly_auto_rerun' ? '#10B981' : '#F59E0B';
                        return <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ color: rtColor, background: `${rtColor}15` }}>{getRunTypeLabel(la.run_type)}</span>;
                      })()}
                    </div>
                    <div className="space-y-1.5">
                      {[{ label: 'Find', s: la.crawlability_score }, { label: 'Explain', s: la.machine_readability_score }, { label: 'Buy', s: la.commercial_clarity_score }, { label: 'Trust', s: la.trust_clarity_score }].map(({ label, s }) => (
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

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="max-w-5xl mx-auto px-4 py-20 text-center"><div className="animate-spin w-8 h-8 border-2 rounded-full mx-auto" style={{ borderColor: '#6366F1', borderTopColor: 'transparent' }} /><p className="mt-4" style={{ color: 'var(--text-tertiary)' }}>Loading…</p></div>}>
      <DashboardContent />
    </Suspense>
  );
}
