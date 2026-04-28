'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, Target, ListChecks, BarChart3, Users, Lightbulb, TrendingUp } from 'lucide-react';
import type {
  DiscoveryPrompt,
  DiscoveryScoreSnapshot,
  DiscoveryTier,
} from '@/lib/types';
import DiscoveryOverview from './DiscoveryOverview';
import DiscoveryPrompts from './DiscoveryPrompts';
import DiscoveryResults from './DiscoveryResults';
import DiscoveryCompetitors from './DiscoveryCompetitors';
import DiscoveryRecommendations from './DiscoveryRecommendations';
import DiscoveryTrends from './DiscoveryTrends';

type SubTab = 'overview' | 'prompts' | 'results' | 'competitors' | 'recommendations' | 'trends';

interface DiscoveryTabProps {
  auditId: string;
  siteId: string;
  isPaid: boolean;
  isAdmin: boolean;
}

/**
 * Map known backend error phrases to friendly copy. Unknown errors pass through
 * verbatim so we can still debug — but the Ticket 5.1 auto-bootstrap should make
 * this a rare path.
 */
function friendlyRunError(raw: string | undefined | null): string {
  const msg = (raw || '').toLowerCase();
  if (!msg) return 'Run failed. Please try again.';
  if (msg.includes('profile not found') || msg.includes('no active prompts') || msg.includes('seed it via generate-prompts')) {
    return 'Something went wrong preparing your discovery run. Please try again in a moment.';
  }
  return raw || 'Run failed. Please try again.';
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
    ? (snapshot.prompt_count <= 5 ? 'teaser_legacy' : 'full')
    : null;

  const [runningTier, setRunningTier] = useState<DiscoveryTier | null>(null);
  // Synchronous ref guard: state updates are async, so two rapid clicks (or a
  // double-fired effect) can both pass a state-based check. The ref flips
  // immediately and blocks the second invocation before any await.
  const isRunningRef = useRef(false);
  const handleRunTests = useCallback(async (tierToRun: DiscoveryTier) => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    setRunningTier(tierToRun);
    try {
      const res = await fetch('/api/discovery/run-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, tier: tierToRun }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Run failed' }));
        setError(friendlyRunError(data.error));
        return;
      }
      await loadAll();
    } catch (err) {
      console.error('[DiscoveryTab] run failed:', err);
      setError('Could not start the discovery run. Try again.');
    } finally {
      isRunningRef.current = false;
      setRunningTier(null);
    }
  }, [siteId, loadAll]);

  const showUpgradeBanner = tier === 'teaser_legacy' && !isPaid && !isAdmin;
  const tierLabel = tier === 'teaser_legacy' ? 'Free preview' : (tier === 'full' ? 'Full report' : null);

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
              onClick={() => handleRunTests(isPaid || isAdmin ? 'full' : 'teaser_legacy')}
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
          runningTier={runningTier}
          onRunTests={() => handleRunTests('full')}
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

      {!loading && activeSub === 'results' && (
        <DiscoveryResults
          siteId={siteId}
          latestRunId={latestRunId}
          tier={tier}
          isPaid={isPaid}
          isAdmin={isAdmin}
          onRefresh={loadAll}
        />
      )}

      {!loading && activeSub === 'competitors' && (
        <DiscoveryCompetitors
          siteId={siteId}
          tier={tier}
          isPaid={isPaid}
          isAdmin={isAdmin}
          onRefresh={loadAll}
        />
      )}

      {!loading && activeSub === 'recommendations' && (
        <DiscoveryRecommendations
          siteId={siteId}
          latestRunId={latestRunId}
          tier={tier}
          isPaid={isPaid}
          isAdmin={isAdmin}
          onRefresh={loadAll}
        />
      )}

      {!loading && activeSub === 'trends' && (
        <DiscoveryTrends
          siteId={siteId}
          tier={tier}
          isPaid={isPaid}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}
