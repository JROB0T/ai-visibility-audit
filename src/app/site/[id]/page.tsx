'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import ScoreRing, { scoreToGrade } from '@/components/ScoreRing';
import { ArrowLeft, Check, Clock, TrendingUp, ChevronRight, AlertTriangle, BarChart3, Building2, RefreshCw, CalendarCheck, X } from 'lucide-react';
import { VERTICAL_OPTIONS } from '@/lib/verticals';
import { getRunTypeLabel } from '@/lib/entitlements';

interface SiteData {
  site: { id: string; domain: string; url: string; vertical: string | null; has_monthly_monitoring?: boolean; next_scheduled_scan_at?: string | null; last_auto_rerun_at?: string | null; plan_status?: string; created_at: string };
  audits: Array<{
    id: string; status: string; overall_score: number | null;
    crawlability_score: number | null; machine_readability_score: number | null;
    commercial_clarity_score: number | null; trust_clarity_score: number | null;
    pages_scanned: number; summary: string | null; run_type: string | null; created_at: string;
  }>;
  latestFindings: { high: number; medium: number; low: number };
  trendData: Array<{ date: string; overall: number | null; crawlability: number | null; readability: number | null; commercial: number | null; trust: number | null }>;
}

function SiteDashboardContent() {
  const params = useParams();
  const router = useRouter();
  const [data, setData] = useState<SiteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [siteVertical, setSiteVertical] = useState<string | null>(null);
  const [showRescanModal, setShowRescanModal] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  const [kickoffStatus, setKickoffStatus] = useState<'idle' | 'starting' | 'started' | 'failed'>('idle');
  const searchParams = useSearchParams();
  const checkoutType = searchParams.get('type');
  const isRescanSuccess = checkoutSuccess && checkoutType === 'rescan';
  const isInitialPaymentSuccess = checkoutSuccess && checkoutType === 'initial_scan';
  const isMonthlySuccess = checkoutSuccess && checkoutType === 'monthly';

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/site/${params.id}`);
        if (!res.ok) { setError('Site not found'); return; }
        const json = await res.json();
        setData(json);
        setSiteVertical(json.site.vertical);
      } catch { setError('Failed to load site'); }
      finally { setLoading(false); }
    }
    load();
  }, [params.id]);

  useEffect(() => {
    if (searchParams.get('checkout') === 'success') setCheckoutSuccess(true);
  }, [searchParams]);

  // Round 1.3 rescan handoff: webhook recorded a pending discovery_job
  // when payment cleared. The user is now back here in their authenticated
  // context — POST to run-and-report so it picks up the pending job and
  // runs the work. After kickoff, route to the audit dashboard where
  // AutoRunProgress takes over via the shell's in-flight job detection.
  useEffect(() => {
    if (!isRescanSuccess || kickoffStatus !== 'idle') return;
    if (!data?.site?.id) return;
    const latestAuditId = data.audits[0]?.id;
    if (!latestAuditId) return;

    setKickoffStatus('starting');
    fetch('/api/discovery/run-and-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId: data.site.id, trigger: 'manual_rerun' }),
    })
      .then((res) => {
        if (!res.ok) {
          setKickoffStatus('failed');
          return;
        }
        setKickoffStatus('started');
        // Brief pause so the user sees confirmation, then route to the
        // audit page where AutoRunProgress takes over.
        setTimeout(() => {
          router.push(`/audit/${latestAuditId}`);
        }, 1500);
      })
      .catch(() => setKickoffStatus('failed'));
  }, [isRescanSuccess, kickoffStatus, data, router]);

  async function handleCheckout(priceType: 'initial_scan' | 'rescan' | 'monthly') {
    if (!data) return;
    setCheckoutLoading(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: data.site.id, priceType }),
      });
      const result = await res.json();
      if (result.url) window.location.href = result.url;
    } catch (err) {
      console.error('Checkout error:', err);
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function handleVerticalChange(newVertical: string) {
    setSiteVertical(newVertical);
    await fetch(`/api/site/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vertical: newVertical }),
    });
  }

  function scoreColor(s: number | null) {
    if (s === null) return 'var(--text-tertiary)';
    return s >= 80 ? '#10B981' : s >= 50 ? '#F59E0B' : '#EF4444';
  }

  function scoreDelta(current: number | null, previous: number | null): string | null {
    if (current === null || previous === null) return null;
    const diff = current - previous;
    if (diff === 0) return null;
    return diff > 0 ? `+${diff}` : `${diff}`;
  }

  if (loading) return (<div className="max-w-5xl mx-auto px-4 py-20 text-center"><div className="animate-spin w-8 h-8 border-2 rounded-full mx-auto" style={{ borderColor: '#6366F1', borderTopColor: 'transparent' }} /></div>);
  if (error || !data) return (<div className="max-w-5xl mx-auto px-4 py-20 text-center"><AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" /><p className="mt-4" style={{ color: 'var(--text-primary)' }}>{error}</p><a href="/dashboard" style={{ color: '#6366F1' }}>← Back to Dashboard</a></div>);

  const { site, audits, latestFindings, trendData } = data;
  const latest = audits[0];
  const previous = audits.length > 1 ? audits[1] : null;
  const completedAudits = audits.filter(a => a.status === 'completed');
  const delta = previous ? scoreDelta(latest?.overall_score ?? null, previous.overall_score) : null;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <a href="/dashboard" className="text-sm inline-flex items-center gap-1 mb-2" style={{ color: '#6366F1' }}><ArrowLeft className="w-3.5 h-3.5" />All Sites</a>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{site.domain}</h1>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <div className="relative inline-flex items-center">
              <Building2 className="absolute left-2 w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
              <select
                value={siteVertical || 'other'}
                onChange={(e) => handleVerticalChange(e.target.value)}
                className="pl-7 pr-2 py-0.5 rounded text-xs appearance-none"
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: 'none' }}
                title="Business type — auto-detected, click to change"
              >
                {VERTICAL_OPTIONS.map((v) => (
                  <option key={v.value} value={v.value}>{v.label}</option>
                ))}
              </select>
            </div>
            <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{completedAudits.length} scan{completedAudits.length !== 1 ? 's' : ''} · Added {new Date(site.created_at).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowRescanModal(true)} className="btn-primary px-5 py-2.5 text-sm font-medium inline-flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />Rescan
          </button>
          {!site.has_monthly_monitoring && (
            <button onClick={() => handleCheckout('monthly')} disabled={checkoutLoading}
              className="px-4 py-2.5 text-sm font-medium rounded-lg border inline-flex items-center gap-2 transition-colors" style={{ color: '#10B981', borderColor: 'rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.05)' }}>
              <CalendarCheck className="w-4 h-4" />{checkoutLoading ? 'Loading…' : 'Monthly — $25/mo'}
            </button>
          )}
        </div>
      </div>

      {/* Checkout success banners — type-aware. Rescan triggers the
          discovery kickoff via the useEffect above and includes a soft
          upgrade nudge. Initial and monthly are simple confirmations. */}
      {isRescanSuccess && (
        <div
          className="mb-6 p-4 rounded-xl border flex items-start gap-3"
          style={{ background: 'rgba(16,185,129,0.05)', borderColor: 'rgba(16,185,129,0.2)' }}
        >
          <Check className="w-5 h-5 mt-0.5 shrink-0" style={{ color: '#10B981' }} />
          <div className="flex-1">
            <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
              Payment confirmed. Your re-scan is starting now.
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              {kickoffStatus === 'failed'
                ? 'There was a hiccup starting the scan. Refresh in a moment to retry.'
                : 'This usually takes about 90 seconds. We’ll take you to your dashboard automatically.'}
            </p>
            <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
              Want unlimited re-scans?{' '}
              <button
                type="button"
                onClick={() => handleCheckout('monthly')}
                disabled={checkoutLoading}
                className="underline cursor-pointer"
                style={{ color: 'var(--accent)' }}
              >
                Subscribe for $25/month
              </button>{' '}
              and re-run anytime.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCheckoutSuccess(false)}
            style={{ color: 'var(--text-tertiary)' }}
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {isInitialPaymentSuccess && (
        <div
          className="mb-6 p-4 rounded-xl border flex items-center justify-between"
          style={{ background: 'rgba(16,185,129,0.05)', borderColor: 'rgba(16,185,129,0.2)' }}
        >
          <p className="text-sm font-medium" style={{ color: '#10B981' }}>
            Payment confirmed. Setting up your initial scan…
          </p>
          <button onClick={() => setCheckoutSuccess(false)} style={{ color: 'var(--text-tertiary)' }} aria-label="Dismiss">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {isMonthlySuccess && (
        <div
          className="mb-6 p-4 rounded-xl border flex items-center justify-between"
          style={{ background: 'rgba(16,185,129,0.05)', borderColor: 'rgba(16,185,129,0.2)' }}
        >
          <p className="text-sm font-medium" style={{ color: '#10B981' }}>
            Subscription active. We&rsquo;ll re-scan automatically every month.
          </p>
          <button onClick={() => setCheckoutSuccess(false)} style={{ color: 'var(--text-tertiary)' }} aria-label="Dismiss">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {/* Generic fallback for ?checkout=success without a recognized type */}
      {checkoutSuccess && !isRescanSuccess && !isInitialPaymentSuccess && !isMonthlySuccess && (
        <div className="mb-6 p-4 rounded-xl border flex items-center justify-between" style={{ background: 'rgba(16,185,129,0.05)', borderColor: 'rgba(16,185,129,0.2)' }}>
          <p className="text-sm font-medium" style={{ color: '#10B981' }}>Payment successful! Your scan is being processed.</p>
          <button onClick={() => setCheckoutSuccess(false)} style={{ color: 'var(--text-tertiary)' }} aria-label="Dismiss"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Monthly monitoring info */}
      {site.has_monthly_monitoring && (
        <div className="mb-6 p-4 rounded-xl border flex items-center gap-3" style={{ background: 'rgba(16,185,129,0.05)', borderColor: 'rgba(16,185,129,0.2)' }}>
          <CalendarCheck className="w-5 h-5 shrink-0" style={{ color: '#10B981' }} />
          <div>
            <p className="text-sm font-medium" style={{ color: '#10B981' }}>Monthly Monitoring Active</p>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {site.next_scheduled_scan_at && `Next scan: ${new Date(site.next_scheduled_scan_at).toLocaleDateString()}`}
              {site.last_auto_rerun_at && ` · Last auto-scan: ${new Date(site.last_auto_rerun_at).toLocaleDateString()}`}
            </p>
          </div>
        </div>
      )}

      {/* Rescan confirmation modal */}
      {showRescanModal && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setShowRescanModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="rounded-xl border p-6 max-w-sm w-full shadow-xl" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Rescan This Site</h3>
              <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                This is an on-demand rescan and costs $35. Monthly plans include automatic monthly rescans at no extra charge.
              </p>
              <div className="flex gap-3 mt-6">
                <button onClick={() => { setShowRescanModal(false); handleCheckout('rescan'); }} disabled={checkoutLoading}
                  className="btn-primary flex-1 py-2.5 text-sm font-medium">
                  {checkoutLoading ? 'Redirecting…' : 'Confirm & Pay — $35'}
                </button>
                <button onClick={() => setShowRescanModal(false)} className="flex-1 py-2.5 text-sm font-medium rounded-lg border" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Latest score overview */}
      {latest && latest.status === 'completed' && (
        <div className="card p-6 sm:p-8 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5" style={{ color: '#6366F1' }} />
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Latest Score</h2>
            <span className="text-xs px-2 py-0.5 rounded" style={{ color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)' }}>{new Date(latest.created_at).toLocaleDateString()}</span>
            {delta && <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ color: delta.startsWith('+') ? '#10B981' : '#EF4444', background: delta.startsWith('+') ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' }}>{delta}</span>}
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-8">
            <ScoreRing score={latest.overall_score ?? 0} label="Overall" size={140} />
            <div className="flex-1 w-full space-y-3">
              {[
                { label: 'Findability', score: latest.crawlability_score, prev: previous?.crawlability_score },
                { label: 'Explainability', score: latest.machine_readability_score, prev: previous?.machine_readability_score },
                { label: 'Buyability', score: latest.commercial_clarity_score, prev: previous?.commercial_clarity_score },
                { label: 'Trustworthiness', score: latest.trust_clarity_score, prev: previous?.trust_clarity_score },
              ].map(({ label, score, prev }) => {
                const d = scoreDelta(score ?? null, prev ?? null);
                return (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-sm w-28" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                    <div className="flex-1 h-2 rounded-full" style={{ background: 'var(--bg-tertiary)' }}>
                      <div className="h-full rounded-full" style={{ width: `${score ?? 0}%`, background: scoreColor(score ?? 0) }} />
                    </div>
                    <span className="text-sm font-bold w-8 text-right" style={{ color: scoreColor(score ?? 0), fontFamily: 'var(--font-mono)' }}>{scoreToGrade(score ?? 0)}</span>
                    {d && <span className="text-xs font-medium w-8" style={{ color: d.startsWith('+') ? '#10B981' : '#EF4444' }}>{d}</span>}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4 text-sm">
            <span style={{ color: 'var(--text-tertiary)' }}>{latestFindings.high + latestFindings.medium + latestFindings.low} findings:</span>
            {latestFindings.high > 0 && <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>{latestFindings.high} high</span>}
            {latestFindings.medium > 0 && <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: 'rgba(245,158,11,0.1)', color: '#F59E0B' }}>{latestFindings.medium} medium</span>}
            {latestFindings.low > 0 && <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366F1' }}>{latestFindings.low} low</span>}
          </div>
          <a href={`/audit/${latest.id}`} className="mt-4 btn-primary px-4 py-2 text-sm inline-flex items-center gap-2">
            View Full Report <ChevronRight className="w-4 h-4" />
          </a>
        </div>
      )}

      {/* Trend chart (simple visual) */}
      {trendData.length > 1 && (
        <div className="card p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5" style={{ color: '#6366F1' }} />
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Score History</h2>
          </div>
          <div className="flex items-end gap-1 h-32">
            {trendData.map((t, i) => {
              const score = t.overall ?? 0;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs font-bold" style={{ color: scoreColor(score), fontFamily: 'var(--font-mono)' }}>{score}</span>
                  <div className="w-full rounded-t" style={{ height: `${Math.max(score, 5)}%`, background: scoreColor(score), opacity: 0.8 }} />
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{new Date(t.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Scan History */}
      <div className="mb-6">
        <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Scan History</h2>
        <div className="space-y-2">
          {audits.map((audit, i) => (
            <a key={audit.id} href={`/audit/${audit.id}`}
              className="flex items-center justify-between p-4 rounded-xl border transition-colors hover:border-indigo-500/30"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {new Date(audit.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                    {' · '}{new Date(audit.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{audit.pages_scanned} pages scanned</p>
                    {audit.run_type && (() => {
                      const label = getRunTypeLabel(audit.run_type);
                      const color = audit.run_type === 'paid_initial' ? '#6366F1' : audit.run_type === 'free_preview' ? '#64748B' : audit.run_type === 'monthly_auto_rerun' ? '#10B981' : '#F59E0B';
                      return <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ color, background: `${color}15` }}>{label}</span>;
                    })()}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {audit.status === 'completed' ? (
                  <>
                    <span className="text-lg font-bold" style={{ color: scoreColor(audit.overall_score), fontFamily: 'var(--font-mono)' }}>{audit.overall_score}</span>
                    {i < audits.length - 1 && audits[i + 1].overall_score !== null && (() => {
                      const d = scoreDelta(audit.overall_score, audits[i + 1].overall_score);
                      return d ? <span className="text-xs font-bold" style={{ color: d.startsWith('+') ? '#10B981' : '#EF4444' }}>{d}</span> : null;
                    })()}
                  </>
                ) : audit.status === 'failed' ? (
                  <span className="text-xs text-red-500">Failed</span>
                ) : (
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{audit.status}</span>
                )}
                <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SiteDashboardPage() {
  return (
    <Suspense fallback={<div className="max-w-5xl mx-auto px-4 py-20 text-center"><div className="animate-spin w-8 h-8 border-2 rounded-full mx-auto" style={{ borderColor: '#6366F1', borderTopColor: 'transparent' }} /></div>}>
      <SiteDashboardContent />
    </Suspense>
  );
}
