'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ScoreRing, { getScoreColor } from '@/components/ScoreRing';
import { clusterLabel } from '@/lib/discovery';
import type {
  DiscoveryCluster,
  DiscoveryInsight,
  DiscoveryPrompt,
  DiscoveryRecommendation,
  DiscoveryResult,
  DiscoveryScoreSnapshot,
  DiscoveryTier,
} from '@/lib/types';

const ALL_CLUSTERS: DiscoveryCluster[] = ['core', 'problem', 'comparison', 'long_tail', 'brand', 'adjacent'];
const CLUSTER_SUBLINE: Record<DiscoveryCluster, string> = {
  core: 'Direct purchase intent',
  problem: 'Problem-driven searches',
  comparison: 'Best-of and versus questions',
  long_tail: 'Specific service details',
  brand: 'Searches mentioning you by name',
  adjacent: 'Related service opportunities',
};

interface OverviewProps {
  snapshot: DiscoveryScoreSnapshot | null;
  prompts: DiscoveryPrompt[];
  siteId: string;
  latestRunId: string | null;
  tier: DiscoveryTier | null;
  isPaid: boolean;
  isAdmin: boolean;
  runningTier: DiscoveryTier | null;
  onRunTests: (tier: DiscoveryTier) => Promise<void>;
  onRefresh: () => Promise<void>;
  onClusterClick?: (cluster: DiscoveryCluster) => void;
}

function formatSnapshotDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function categoryMeta(cat: DiscoveryInsight['category']): { label: string; color: string; bg: string } {
  switch (cat) {
    case 'wins': return { label: 'Win', color: '#10B981', bg: 'rgba(16,185,129,0.12)' };
    case 'gaps': return { label: 'Gap', color: '#EF4444', bg: 'rgba(239,68,68,0.12)' };
    case 'competitor_advantages': return { label: 'Competitor', color: '#F97316', bg: 'rgba(249,115,22,0.12)' };
    case 'content_issues': return { label: 'Content', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' };
    case 'opportunities': return { label: 'Opportunity', color: '#6366F1', bg: 'rgba(99,102,241,0.12)' };
  }
}

function severityColor(sev: 'high' | 'medium' | 'low' | null | undefined): string {
  if (sev === 'high') return '#EF4444';
  if (sev === 'medium') return '#F59E0B';
  if (sev === 'low') return '#10B981';
  return '#94A3B8';
}

function ownerLabel(owner: string | null): string {
  switch (owner) {
    case 'developer': return 'Developer';
    case 'marketer': return 'Marketer';
    case 'business_owner': return 'Business Owner';
    default: return 'Team';
  }
}

export default function DiscoveryOverview(props: OverviewProps): React.ReactElement {
  const { snapshot, siteId, latestRunId, tier, isPaid, isAdmin, runningTier, onRunTests, onClusterClick } = props;

  // ============================================================
  // Insights polling
  // ============================================================
  const [insights, setInsights] = useState<DiscoveryInsight[]>([]);
  const [insightsLoaded, setInsightsLoaded] = useState(false);
  const [insightsGaveUp, setInsightsGaveUp] = useState(false);
  const insightsPolls = useRef(0);

  // ============================================================
  // Recommendations polling
  // ============================================================
  const [recommendations, setRecommendations] = useState<DiscoveryRecommendation[]>([]);
  const [recsLoaded, setRecsLoaded] = useState(false);
  const [recsGaveUp, setRecsGaveUp] = useState(false);
  const recsPolls = useRef(0);

  // ============================================================
  // Results (for competitor frequency)
  // ============================================================
  const [results, setResults] = useState<DiscoveryResult[]>([]);

  const loadInsights = useCallback(async (): Promise<boolean> => {
    try {
      const url = latestRunId
        ? `/api/discovery/insights?siteId=${encodeURIComponent(siteId)}&runId=${encodeURIComponent(latestRunId)}`
        : `/api/discovery/insights?siteId=${encodeURIComponent(siteId)}`;
      const res = await fetch(url);
      if (!res.ok) return false;
      const data = await res.json();
      const arr = (data.insights || []) as DiscoveryInsight[];
      if (arr.length > 0) {
        setInsights(arr);
        setInsightsLoaded(true);
        return true;
      }
      return false;
    } catch (err) {
      console.error('[DiscoveryOverview] insights fetch failed:', err);
      return false;
    }
  }, [siteId, latestRunId]);

  const loadRecs = useCallback(async (): Promise<boolean> => {
    try {
      const url = latestRunId
        ? `/api/discovery/recommendations?siteId=${encodeURIComponent(siteId)}&runId=${encodeURIComponent(latestRunId)}`
        : `/api/discovery/recommendations?siteId=${encodeURIComponent(siteId)}`;
      const res = await fetch(url);
      if (!res.ok) return false;
      const data = await res.json();
      const arr = (data.recommendations || []) as DiscoveryRecommendation[];
      if (arr.length > 0) {
        setRecommendations(arr);
        setRecsLoaded(true);
        return true;
      }
      return false;
    } catch (err) {
      console.error('[DiscoveryOverview] recs fetch failed:', err);
      return false;
    }
  }, [siteId, latestRunId]);

  const loadResults = useCallback(async () => {
    if (!latestRunId) return;
    try {
      const res = await fetch(`/api/discovery/results?siteId=${encodeURIComponent(siteId)}&runId=${encodeURIComponent(latestRunId)}`);
      if (!res.ok) return;
      const data = await res.json();
      setResults((data.results || []) as DiscoveryResult[]);
    } catch (err) {
      console.error('[DiscoveryOverview] results fetch failed:', err);
    }
  }, [siteId, latestRunId]);

  // Initial load + polling (up to 10 attempts × 3s = 30s)
  useEffect(() => {
    if (!snapshot) return;
    insightsPolls.current = 0;
    recsPolls.current = 0;
    setInsightsLoaded(false);
    setInsightsGaveUp(false);
    setRecsLoaded(false);
    setRecsGaveUp(false);
    void loadResults();
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      if (!insightsLoaded && !insightsGaveUp) {
        const ok = await loadInsights();
        if (!ok) {
          insightsPolls.current++;
          if (insightsPolls.current >= 10) setInsightsGaveUp(true);
        }
      }
      if (!recsLoaded && !recsGaveUp) {
        const ok = await loadRecs();
        if (!ok) {
          recsPolls.current++;
          if (recsPolls.current >= 10) setRecsGaveUp(true);
        }
      }
    };
    void tick();
    const interval = setInterval(tick, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, latestRunId]);

  // ============================================================
  // Empty state (no run yet)
  // ============================================================
  if (!snapshot) {
    const runningNow = !!runningTier;
    return (
      <div
        className="rounded-xl border p-10 text-center"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          You haven&rsquo;t tested your AI Discovery yet.
        </h3>
        <p className="mt-3 text-sm max-w-xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
          We&rsquo;ll ask AI tools realistic buyer questions about your business and measure how well you appear in their answers.
        </p>
        <div className="mt-6 flex items-center justify-center">
          {runningNow ? (
            <div className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <span
                className="inline-block w-3 h-3 rounded-full animate-pulse"
                style={{ background: 'var(--accent)' }}
              />
              Testing your visibility across AI answers… this takes 30&ndash;90 seconds for a preview, 1&ndash;3 minutes for a full run.
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onRunTests(isPaid || isAdmin ? 'full' : 'teaser')}
              className="btn-primary px-5 py-2.5 text-sm font-medium inline-flex items-center gap-2"
            >
              {isPaid || isAdmin ? 'Run Full AI Discovery' : 'Run Free Preview'}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ============================================================
  // BLOCK 1 — Hero score row
  // ============================================================
  const hero = (
    <div
      className="rounded-xl border p-6 mb-6 flex items-center gap-6 flex-wrap"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div className="shrink-0">
        <ScoreRing score={snapshot.overall_score ?? 0} label="AI Discovery Score" />
      </div>
      <div className="flex-1 min-w-[220px]">
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          Tested {snapshot.prompt_count} prompts on {formatSnapshotDate(snapshot.snapshot_date)}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Pill label={`${snapshot.strong_count} Strong`} color="#10B981" />
          <Pill label={`${snapshot.partial_count} Partial`} color="#F59E0B" />
          <Pill label={`${snapshot.absent_count} Absent`} color="#EF4444" />
          <Pill label={`${snapshot.competitor_dominant_count} Competitor-dominant`} color="#F97316" />
        </div>
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => onRunTests(isPaid || isAdmin ? 'full' : 'teaser')}
            disabled={!!runningTier}
            className="btn-primary px-4 py-2 text-sm font-medium"
          >
            {runningTier
              ? 'Running…'
              : (isPaid || isAdmin ? 'Run Full AI Discovery (25 prompts)' : 'Run Free Preview (5 prompts)')}
          </button>
          {!isPaid && !isAdmin && (
            <a href="/pricing" className="text-sm font-medium" style={{ color: 'var(--accent)' }}>
              Upgrade for full report
            </a>
          )}
        </div>
      </div>
    </div>
  );

  // ============================================================
  // BLOCK 2 — Cluster breakdown
  // ============================================================
  const clusterGrid = (
    <div className="mb-6">
      <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--text-primary)' }}>How you score by question type</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {ALL_CLUSTERS.map(cluster => {
          const raw = (snapshot.cluster_scores || {})[cluster];
          const score = typeof raw === 'number' ? raw : null;
          return (
            <div
              key={cluster}
              className="rounded-xl border p-4"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center justify-between">
                {onClusterClick ? (
                  <button
                    type="button"
                    onClick={() => onClusterClick(cluster)}
                    className="text-sm font-medium text-left hover:underline cursor-pointer"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {clusterLabel(cluster)}
                  </button>
                ) : (
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{clusterLabel(cluster)}</span>
                )}
                <span
                  className="text-sm font-bold"
                  style={{ color: score !== null ? getScoreColor(score) : 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}
                >
                  {score !== null ? score : 'No data'}
                </span>
              </div>
              <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: score !== null ? `${score}%` : '0%',
                    backgroundColor: score !== null ? getScoreColor(score) : 'transparent',
                  }}
                />
              </div>
              <p className="mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>{CLUSTER_SUBLINE[cluster]}</p>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ============================================================
  // BLOCK 3 — Top insights
  // ============================================================
  const insightsToShow = insights.slice(0, tier === 'teaser' ? 2 : 3);
  const insightsBlock = (
    <div className="mb-6">
      <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--text-primary)' }}>What we found</h3>
      {insightsToShow.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {insightsToShow.map(ins => {
            const meta = categoryMeta(ins.category);
            return (
              <div
                key={ins.id}
                className="rounded-xl border p-4"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full"
                    style={{ color: meta.color, background: meta.bg }}
                  >
                    {meta.label}
                  </span>
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ background: severityColor(ins.severity) }}
                    aria-label={`Severity ${ins.severity}`}
                  />
                </div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{ins.title}</p>
                {ins.description && (
                  <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>{ins.description}</p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div
          className="rounded-xl border p-6 text-center text-sm"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-tertiary)' }}
        >
          {insightsGaveUp
            ? 'Insights will appear here after your next run.'
            : 'Generating insights…'}
        </div>
      )}
    </div>
  );

  // ============================================================
  // BLOCK 4 — Top competitors surfacing (derived from results)
  // ============================================================
  const activeResults = results.filter(r => !r.suppressed);
  const compCounts = new Map<string, number>();
  for (const r of activeResults) {
    if (r.business_mentioned) continue;
    for (const name of (r.competitor_names_detected || [])) {
      compCounts.set(name, (compCounts.get(name) || 0) + 1);
    }
  }
  const topComps = Array.from(compCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const showCompBlock = tier !== 'teaser' || topComps.length >= 2;
  const competitorsBlock = showCompBlock ? (
    <div className="mb-6">
      <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Who&rsquo;s showing up instead of you</h3>
      {topComps.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {topComps.map(([name, count]) => (
            <div
              key={name}
              className="rounded-xl border p-4"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{name}</p>
              <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Mentioned in {count} prompt{count === 1 ? '' : 's'} where your business was absent.
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div
          className="rounded-xl border p-6 text-center text-sm"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          No dominant competitors detected — you&rsquo;re holding your ground.
        </div>
      )}
    </div>
  ) : null;

  // ============================================================
  // BLOCK 5 — Top recommendations
  // ============================================================
  const recLimit = tier === 'teaser' ? 1 : 3;
  const recsToShow = recommendations.slice(0, recLimit);
  const recsBlock = (
    <div className="mb-6">
      <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--text-primary)' }}>What to do next</h3>
      {recsToShow.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {recsToShow.map(rec => {
            const prio = rec.priority;
            const prioColor = severityColor(prio);
            return (
              <div
                key={rec.id}
                className="rounded-xl border p-4 flex flex-col"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full uppercase tracking-wide"
                    style={{ color: prioColor, background: `${prioColor}20` }}
                  >
                    {prio || 'medium'}
                  </span>
                </div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{rec.title}</p>
                {rec.why_it_matters && (
                  <p className="mt-1 text-xs flex-1" style={{ color: 'var(--text-secondary)' }}>{rec.why_it_matters}</p>
                )}
                <div className="mt-3 flex items-center justify-between text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  <span>{ownerLabel(rec.owner_type)}</span>
                  {rec.suggested_timeline && <span>{rec.suggested_timeline}</span>}
                </div>
              </div>
            );
          })}
          {tier === 'teaser' && (
            <a
              href="/pricing"
              className="rounded-xl border p-4 flex flex-col items-start justify-center text-left"
              style={{
                background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(16,185,129,0.06))',
                borderColor: 'var(--border)',
              }}
            >
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Unlock your full fix plan</p>
              <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                Get every recommendation tailored to your site — not just the first one.
              </p>
              <span className="mt-3 text-xs font-medium" style={{ color: 'var(--accent)' }}>Upgrade →</span>
            </a>
          )}
        </div>
      ) : (
        <div
          className="rounded-xl border p-6 text-center text-sm"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-tertiary)' }}
        >
          {recsGaveUp
            ? 'Recommendations will appear here after your next run.'
            : 'Generating recommendations…'}
        </div>
      )}
    </div>
  );

  return (
    <div>
      {hero}
      {clusterGrid}
      {insightsBlock}
      {competitorsBlock}
      {recsBlock}
    </div>
  );
}

function Pill({ label, color }: { label: string; color: string }): React.ReactElement {
  return (
    <span
      className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full"
      style={{ color, background: `${color}20` }}
    >
      {label}
    </span>
  );
}
