'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import ScoreRing from '@/components/ScoreRing';
import { Search, ArrowRight, Clock, Globe, LogOut } from 'lucide-react';

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

      if (!user) {
        router.push('/auth/login?redirect=/dashboard');
        return;
      }

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
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Scan failed');
        return;
      }

      router.push(`/audit/${data.auditId}`);
    } catch {
      setError('Could not connect');
    } finally {
      setScanning(false);
    }
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto" />
        <p className="mt-4 text-gray-500">Loading your dashboard…</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">{userEmail}</p>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>

      {/* New audit */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8">
        <h2 className="font-semibold text-gray-900 mb-3">Run a new audit</h2>
        <form onSubmit={handleNewAudit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Enter a website URL"
              className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={scanning}
            />
          </div>
          <button
            type="submit"
            disabled={scanning || !url.trim()}
            className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {scanning ? 'Scanning…' : 'Scan'}
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      {/* Audit history */}
      <h2 className="font-semibold text-gray-900 mb-4">Your Audits</h2>
      {audits.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <Globe className="w-10 h-10 text-gray-300 mx-auto" />
          <p className="mt-3 text-gray-500">No audits yet. Run your first one above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {audits.map((audit) => (
            <a
              key={audit.id}
              href={`/audit/${audit.id}`}
              className="block bg-white rounded-xl border border-gray-200 p-5 transition-card"
            >
              <div className="flex items-center gap-4">
                {audit.overall_score !== null ? (
                  <ScoreRing score={audit.overall_score} size={56} strokeWidth={5} />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
                    <span className="text-xs text-gray-400">
                      {audit.status === 'running' ? '…' : '—'}
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {(audit.site as unknown as { domain: string })?.domain || 'Unknown'}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(audit.created_at).toLocaleDateString()}
                    </span>
                    {audit.pages_scanned > 0 && (
                      <span>{audit.pages_scanned} pages</span>
                    )}
                    <span className={`capitalize ${
                      audit.status === 'completed' ? 'text-green-600' :
                      audit.status === 'failed' ? 'text-red-600' : 'text-amber-600'
                    }`}>
                      {audit.status}
                    </span>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" />
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
