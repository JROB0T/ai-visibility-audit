'use client';

import { useCallback, useEffect, useState } from 'react';
import { Sparkles, Target, ListChecks, BarChart3, Users, Lightbulb, TrendingUp } from 'lucide-react';
import type {
  DiscoveryPrompt,
  DiscoveryScoreSnapshot,
  DiscoveryTier,
} from '@/lib/types';
import DiscoveryOverview from './DiscoveryOverview';
import DiscoveryPrompts from './DiscoveryPrompts';

type SubTab = 'overview' | 'prompts' | 'results' | 'competitors' | 'recommendations' | 'trends';

interface DiscoveryTabProps {
  auditId: string;
  siteId: string;
  isPaid: boolean;
  isAdmin: boolean;
}

const SUB_TABS: { id: SubTab; label: string; icon: typeof Sparkles }[] = [
  { id: 'overview', label: 'Overview', icon: Target },
  { id: 'prompts', label: 'Prompts', icon: ListChecks },
  { id: 'results', label: 'Results', icon: BarChart3 },
  { id: 'competitors', label: 'Competitors', icon: Users },
  { id: 'recommendations', label: 'Recommendations', icon: Lightbulb },
  { id: 'trends', label: 'Trends', icon: TrendingUp },
];

export default function DiscoveryTab({ siteId, isPaid, isAdmin }: DiscoveryTabProps): React.ReactElement {
  const [activeSub, setActiveSub] = useState<SubTab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<DiscoveryScoreSnapshot | null>(null);
  const [latestRunId, setLatestRunId] = useState<string | null>(null);
  const [prompts, setPrompts] = useState<DiscoveryPrompt[]>([]);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const [resultsRes, promptsRes] = await Promise.all([
        fetch(`/api/discovery/results?siteId=${encodeURIComponent(siteId)}`),
        fetch(`/api/discovery/prompts?siteId=${encodeURIComponent(siteId)}`),
      ]);
      if (resultsRes.ok) {
        const rdata = await resultsRes.json();
        setSnapshot(rdata.snapshot || null);
        setLatestRunId(rdata.runId || null);
      }
      if (promptsRes.ok) {
        const pdata = await promptsRes.json();
        setPrompts((pdata.prompts || []) as DiscoveryPrompt[]);
      }
    } catch (err) {
      console.error('[DiscoveryTab] load failed:', err);
      setError('Could not load AI Discovery data. Try refreshing the page.');
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Derive tier from snapshot.prompt_count (<=5 → teaser)
  const tier: DiscoveryTier | null = snapshot
    ? (snapshot.prompt_count <= 5 ? 'teaser' : 'full')
    : null;

  const [runningTier, setRunningTier] = useState<DiscoveryTier | null>(null);
  const handleRunTests = useCallback(async (tierToRun: DiscoveryTier) => {
    if (runningTier) return;
    setRunningTier(tierToRun);
    try {
      const res = await fetch('/api/discovery/run-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, tier: tierToRun }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Run failed' }));
        setError(data.error || 'Run failed');
        return;
      }
      await loadAll();
    } catch (err) {
      console.error('[DiscoveryTab] run failed:', err);
      setError('Could not start the discovery run. Try again.');
    } finally {
      setRunningTier(null);
    }
  }, [siteId, loadAll, runningTier]);

  const showUpgradeBanner = tier === 'teaser' && !isPaid && !isAdmin;
  const tierLabel = tier === 'teaser' ? 'Free preview' : (tier === 'full' ? 'Full report' : null);

  return (
    <div>
      {/* HEADER */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" style={{ color: 'var(--accent)' }} />
              <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>AI Discovery</h2>
              {tierLabel && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full"
                  style={{
                    background: tier === 'full' ? 'rgba(16,185,129,0.12)' : 'rgba(99,102,241,0.12)',
                    color: tier === 'full' ? '#10B981' : '#6366F1',
                  }}
                >
                  {tierLabel}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
              See how AI tools answer real buyer questions about your business.
            </p>
          </div>
          {!snapshot && !loading && (
            <button
              type="button"
              onClick={() => handleRunTests(isPaid || isAdmin ? 'full' : 'teaser')}
              disabled={!!runningTier}
              className="btn-primary px-5 py-2.5 text-sm font-medium inline-flex items-center gap-2 whitespace-nowrap"
            >
              {runningTier
                ? 'Running…'
                : (isPaid || isAdmin ? 'Run Full AI Discovery' : 'Run Free Preview')}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          className="mb-4 p-3 rounded-md border text-sm"
          style={{ borderColor: 'rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)', color: '#F87171' }}
        >
          {error}
        </div>
      )}

      {/* SUB-TAB BAR */}
      <div
        className="flex items-center gap-1 overflow-x-auto mb-6 pb-1 rounded-lg p-1"
        style={{ background: 'var(--bg-tertiary)' }}
      >
        {SUB_TABS.map(sub => {
          const active = activeSub === sub.id;
          return (
            <button
              key={sub.id}
              type="button"
              onClick={() => setActiveSub(sub.id)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-colors"
              style={{
                background: active ? 'var(--surface)' : 'transparent',
                color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
                boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              <sub.icon className="w-3.5 h-3.5" />{sub.label}
            </button>
          );
        })}
      </div>

      {/* UPGRADE BANNER (teaser for non-paid/non-admin) */}
      {showUpgradeBanner && (
        <div
          className="mb-6 p-4 rounded-xl border flex items-center justify-between gap-4 flex-wrap"
          style={{
            background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(16,185,129,0.06))',
            borderColor: 'var(--border)',
          }}
        >
          <div className="flex-1 min-w-[240px]">
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              You&rsquo;re viewing a free preview based on 5 prompts.
            </p>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Upgrade to see your full 25-prompt report with competitor analysis and recommendations.
            </p>
          </div>
          {/* TODO: wire this to the real upgrade/checkout flow once the page-level handler is accessible */}
          <a href="/pricing" className="btn-primary px-4 py-2 text-sm font-medium inline-flex items-center gap-2">
            Upgrade
          </a>
        </div>
      )}

      {/* LOADING STATE */}
      {loading && (
        <div
          className="rounded-xl border p-8 text-center"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading AI Discovery…</p>
        </div>
      )}

      {/* SUB-SCREENS */}
      {!loading && activeSub === 'overview' && (
        <DiscoveryOverview
          snapshot={snapshot}
          prompts={prompts}
          siteId={siteId}
          latestRunId={latestRunId}
          tier={tier}
          isPaid={isPaid}
          isAdmin={isAdmin}
          runningTier={runningTier}
          onRunTests={handleRunTests}
          onRefresh={loadAll}
        />
      )}

      {!loading && activeSub === 'prompts' && (
        <DiscoveryPrompts
          prompts={prompts}
          siteId={siteId}
          isPaid={isPaid}
          isAdmin={isAdmin}
          onRefresh={loadAll}
        />
      )}

      {!loading && activeSub === 'results' && <ComingSoon label="Results" />}
      {!loading && activeSub === 'competitors' && <ComingSoon label="Competitors" />}
      {!loading && activeSub === 'recommendations' && <ComingSoon label="Recommendations" />}
      {!loading && activeSub === 'trends' && <ComingSoon label="Trends" />}
    </div>
  );
}

// ============================================================
// ComingSoon placeholder
// ============================================================
function ComingSoon({ label }: { label: string }): React.ReactElement {
  return (
    <div
      className="rounded-xl border p-10 text-center"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</h3>
      <p className="mt-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
        Coming in the next update.
      </p>
    </div>
  );
}
