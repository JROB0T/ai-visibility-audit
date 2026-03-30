'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ScoreRing from '@/components/ScoreRing';
import { ArrowLeft, Plus, Clock, TrendingUp, ChevronRight, AlertTriangle, BarChart3 } from 'lucide-react';

interface SiteData {
  site: { id: string; domain: string; url: string; created_at: string };
  audits: Array<{
    id: string; status: string; overall_score: number | null;
    crawlability_score: number | null; machine_readability_score: number | null;
    commercial_clarity_score: number | null; trust_clarity_score: number | null;
    pages_scanned: number; summary: string | null; created_at: string;
  }>;
  latestFindings: { high: number; medium: number; low: number };
  trendData: Array<{ date: string; overall: number | null; crawlability: number | null; readability: number | null; commercial: number | null; trust: number | null }>;
}

export default function SiteDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const [data, setData] = useState<SiteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/site/${params.id}`);
        if (!res.ok) { setError('Site not found'); return; }
        setData(await res.json());
      } catch { setError('Failed to load site'); }
      finally { setLoading(false); }
    }
    load();
  }, [params.id]);

  async function handleRescan() {
    if (!data || scanning) return;
    setScanning(true);
    try {
      const res = await fetch('/api/audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: data.site.url }) });
      const result = await res.json();
      if (res.ok) router.push(`/audit/${result.auditId}`);
      else setError(result.error || 'Scan failed');
    } catch { setError('Could not connect'); }
    finally { setScanning(false); }
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
          <p className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>{completedAudits.length} scan{completedAudits.length !== 1 ? 's' : ''} · Added {new Date(site.created_at).toLocaleDateString()}</p>
        </div>
        <button onClick={handleRescan} disabled={scanning}
          className="btn-primary px-5 py-2.5 text-sm font-medium inline-flex items-center gap-2" style={{ opacity: scanning ? 0.7 : 1 }}>
          {scanning ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Scanning…</> : <><Plus className="w-4 h-4" />New Scan</>}
        </button>
      </div>

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
                { label: 'Crawlability', score: latest.crawlability_score, prev: previous?.crawlability_score },
                { label: 'Readability', score: latest.machine_readability_score, prev: previous?.machine_readability_score },
                { label: 'Commercial', score: latest.commercial_clarity_score, prev: previous?.commercial_clarity_score },
                { label: 'Trust', score: latest.trust_clarity_score, prev: previous?.trust_clarity_score },
              ].map(({ label, score, prev }) => {
                const d = scoreDelta(score ?? null, prev ?? null);
                return (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-sm w-24" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                    <div className="flex-1 h-2 rounded-full" style={{ background: 'var(--bg-tertiary)' }}>
                      <div className="h-full rounded-full" style={{ width: `${score ?? 0}%`, background: scoreColor(score ?? 0) }} />
                    </div>
                    <span className="text-sm font-bold w-8 text-right" style={{ color: scoreColor(score ?? 0), fontFamily: 'var(--font-mono)' }}>{score ?? 0}</span>
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
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{audit.pages_scanned} pages scanned</p>
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
