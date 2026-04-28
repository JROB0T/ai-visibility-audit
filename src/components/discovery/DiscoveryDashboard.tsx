'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  DiscoveryCluster,
  DiscoveryPrompt,
  DiscoveryScoreSnapshot,
  DiscoveryTier,
} from '@/lib/types';
import DashboardSection from '@/components/dashboard/DashboardSection';
import DiscoveryOverview from './DiscoveryOverview';
import DiscoveryCompetitors from './DiscoveryCompetitors';
import DiscoveryRecommendations from './DiscoveryRecommendations';
import DiscoveryTrends from './DiscoveryTrends';

interface DiscoveryDashboardProps {
  auditId: string;
  siteId: string;
  isPaid: boolean;
  isAdmin: boolean;
  reportAvailable: boolean;
  onClusterDrilldown: (cluster: DiscoveryCluster) => void;
}

function friendlyRunError(raw: string | undefined | null): string {
  const msg = (raw || '').toLowerCase();
  if (!msg) return 'Run failed. Please try again.';
  if (msg.includes('profile not found') || msg.includes('no active prompts') || msg.includes('seed it via generate-prompts')) {
    return 'Something went wrong preparing your discovery run. Please try again in a moment.';
  }
  return raw || 'Run failed. Please try again.';
}

export default function DiscoveryDashboard({
  auditId,
  siteId,
  isPaid,
  isAdmin,
  reportAvailable,
  onClusterDrilldown,
}: DiscoveryDashboardProps): React.ReactElement {
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
      console.error('[DiscoveryDashboard] load failed:', err);
      setError('Could not load AI Discovery data. Try refreshing the page.');
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Pre-1.5a snapshots with ≤5 prompts surface as 'teaser_legacy'. New runs
  // always have a full prompt set, so the heuristic only matches old data.
  const tier: DiscoveryTier | null = snapshot
    ? (snapshot.prompt_count <= 5 ? 'teaser_legacy' : 'full')
    : null;

  const [runningTier, setRunningTier] = useState<DiscoveryTier | null>(null);
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
      console.error('[DiscoveryDashboard] run failed:', err);
      setError('Could not start the discovery run. Try again.');
    } finally {
      isRunningRef.current = false;
      setRunningTier(null);
    }
  }, [siteId, loadAll]);

  return (
    <div>
      {error && (
        <div
          className="mb-4 p-3 rounded-md border text-sm"
          style={{ borderColor: 'rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)', color: '#F87171' }}
        >
          {error}
        </div>
      )}

      {loading && (
        <div
          className="rounded-xl border p-8 text-center mb-12"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading AI Discovery…</p>
        </div>
      )}

      {!loading && (
        <>
          <DashboardSection
            title="How AI sees you"
            subtitle="Cluster performance and visibility distribution"
            reportPage={1}
            reportAuditId={auditId}
            reportAvailable={reportAvailable}
          >
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
              onClusterClick={onClusterDrilldown}
            />
          </DashboardSection>

          <DashboardSection
            title="Trending"
            subtitle="How your AI visibility is moving over time"
            reportPage={5}
            reportAuditId={auditId}
            reportAvailable={reportAvailable}
          >
            <DiscoveryTrends
              siteId={siteId}
              tier={tier}
              isPaid={isPaid}
              isAdmin={isAdmin}
            />
          </DashboardSection>

          <DashboardSection
            title="The field"
            subtitle="Competitors detected and directory pressure"
            reportPage={4}
            reportAuditId={auditId}
            reportAvailable={reportAvailable}
          >
            <DiscoveryCompetitors
              siteId={siteId}
              tier={tier}
              isPaid={isPaid}
              isAdmin={isAdmin}
              onRefresh={loadAll}
            />
          </DashboardSection>

          <DashboardSection
            title="Priorities"
            subtitle="Recommended moves, ordered by impact"
            reportPage={6}
            reportAuditId={auditId}
            reportAvailable={reportAvailable}
          >
            <DiscoveryRecommendations
              siteId={siteId}
              latestRunId={latestRunId}
              tier={tier}
              isPaid={isPaid}
              isAdmin={isAdmin}
              onRefresh={loadAll}
            />
          </DashboardSection>
        </>
      )}
    </div>
  );
}
