'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import ScoreRing from '@/components/ScoreRing';
import { Search, ArrowRight, Clock, Globe, LogOut, AlertTriangle, TrendingUp, BarChart3 } from 'lucide-react';

interface AuditRow {
  id: string;
  status: string;
  overall_score: number | null;
  pages_scanned: number;
  created_at: string;
  site: { domain: string; url: string };
}

export default function DashboardPage() {
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState('');
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const router = useRouter();

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth/login?redirect=/dashboard'); return; }
      setUserEmail(user.email || '');
      const { data } = await supabase
        .from('audits')
        .select('id, status, overall_score, pages_scanned, created_at, site:sites(domain, url)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      setAudits((data as unknown as AuditRow[]) || []);
      setLoading(false);
    }
    load();
  }, [router]);

  async function handleNewAudit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setScanning(true);
    setError('');
    try {
      const res = await fetch('/api/audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url.trim() }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Scan failed'); return; }
      router.push(`/audit/${data.auditId}`);
    } catch { setError('Could not connect'); }
    finally { setScanning(false); }
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  function getScoreColor(score: number | null) {
    if (score === null) return 'var(--text-tertiary)';
    if (score >= 80) return '#10B981';
    if (score >= 60) return '#F59E0B';
    return '#EF4444';
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <div className="animate-spin w-8 h-8 border-2 rounded-full mx-auto" style={{ borderColor: '#6366F1', borderTopColor: 'transparent' }} />
        <p className="mt-4" style={{ color: 'var(--text-tertiary)' }}>Loading your dashboard…</p>
      </div>
    );
  }

  const completedAudits = audits.filter(a => a.status === 'completed');
  const avgScore = completedAudits.length > 0
    ? Math.round(completedAudits.reduce((sum, a) => sum + (a.overall_score || 0), 0) / completedAudits.length)
    : null;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Dashboard</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>{userEmail}</p>
        </div>
        <button onClick={handleSignOut} className="flex items-center gap-1.5 text-sm transition-colors" style={{ color: 'var(--text-tertiary)' }}>
          <LogOut className="w-4 h-4" />Sign out
        </button>
      </div>

      {/* Stats row */}
      {completedAudits.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="card p-5 text-center">
            <BarChart3 className="w-5 h-5 mx-auto mb-2" style={{ color: '#6366F1' }} />
            <p className="text-2xl font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{completedAudits.length}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Audits Run</p>
          </div>
          <div className="card p-5 text-center">
            <TrendingUp className="w-5 h-5 mx-auto mb-2" style={{ color: getScoreColor(avgScore) }} />
            <p className="text-2xl font-bold font-mono" style={{ color: getScoreColor(avgScore) }}>{avgScore ?? '—'}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Avg Score</p>
          </div>
          <div className="card p-5 text-center">
            <Globe className="w-5 h-5 mx-auto mb-2" style={{ color: '#6366F1' }} />
            <p className="text-2xl font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{new Set(completedAudits.map(a => (a.site as unknown as { domain: string })?.domain)).size}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Sites Scanned</p>
          </div>
        </div>
      )}

      {/* New audit */}
      <div className="card-glow p-5 mb-8">
        <h2 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Run a new audit</h2>
        <form onSubmit={handleNewAudit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
            <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Enter a website URL" className="w-full pl-9 pr-4 py-2.5 input-light text-sm" disabled={scanning} />
          </div>
          <button type="submit" disabled={scanning || !url.trim()} className="px-5 py-2.5 btn-primary whitespace-nowrap">
            {scanning ? 'Scanning…' : 'Scan'}
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-red-500 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{error}</p>}
      </div>

      {/* Audit history */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Your Audits</h2>
        {audits.length > 0 && <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)' }}>{audits.length} total</span>}
      </div>

      {audits.length === 0 ? (
        <div className="card p-10 text-center">
          <Globe className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-tertiary)' }} />
          <p style={{ color: 'var(--text-secondary)' }}>No audits yet. Run your first one above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {audits.map((audit) => {
            const domain = (audit.site as unknown as { domain: string })?.domain || 'Unknown';
            return (
              <a key={audit.id} href={`/audit/${audit.id}`} className="block card-glow p-5 group">
                <div className="flex items-center gap-4">
                  {audit.overall_score !== null ? (
                    <div className="relative">
                      <svg width="52" height="52" viewBox="0 0 52 52">
                        <circle cx="26" cy="26" r="22" fill="none" strokeWidth="4" style={{ stroke: 'var(--border)' }} />
                        <circle cx="26" cy="26" r="22" fill="none" strokeWidth="4" strokeLinecap="round"
                          stroke={getScoreColor(audit.overall_score)}
                          strokeDasharray={138.2} strokeDashoffset={138.2 - (audit.overall_score / 100) * 138.2}
                          transform="rotate(-90 26 26)"
                          style={{ filter: `drop-shadow(0 0 4px ${getScoreColor(audit.overall_score)}30)` }}
                        />
                        <text x="26" y="29" textAnchor="middle" fontSize="14" fontWeight="700" fontFamily="var(--font-mono)" fill={getScoreColor(audit.overall_score)}>{audit.overall_score}</text>
                      </svg>
                    </div>
                  ) : (
                    <div className="w-[52px] h-[52px] rounded-full flex items-center justify-center" style={{ background: 'var(--bg-tertiary)' }}>
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{audit.status === 'running' ? '…' : '—'}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate text-[15px]" style={{ color: 'var(--text-primary)' }}>{domain}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(audit.created_at).toLocaleDateString()}</span>
                      {audit.pages_scanned > 0 && <span className="font-mono">{audit.pages_scanned} pages</span>}
                      <span className={`font-medium ${audit.status === 'completed' ? 'text-emerald-500' : audit.status === 'failed' ? 'text-red-500' : 'text-amber-500'}`}>{audit.status}</span>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 shrink-0 transition-transform group-hover:translate-x-1" style={{ color: 'var(--text-tertiary)' }} />
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
