'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { scoreToGrade } from '@/components/ScoreRing';
import LegacyAuditPage from './page.legacy';
import PersistentHeader from '@/components/dashboard/PersistentHeader';
import OverviewTab from '@/components/dashboard/tabs/OverviewTab';
import FindingsTab from '@/components/dashboard/tabs/FindingsTab';
import PrioritiesTab from '@/components/dashboard/tabs/PrioritiesTab';
import CompetitorsTab from '@/components/dashboard/tabs/CompetitorsTab';
import TrendsTab from '@/components/dashboard/tabs/TrendsTab';
import SiteReadinessTab from '@/components/dashboard/tabs/SiteReadinessTab';
import SidePanel from '@/components/dashboard/SidePanel';
import ClusterDrilldown from '@/components/dashboard/ClusterDrilldown';
import AutoRunProgress from '@/components/dashboard/AutoRunProgress';
import { getLastVisitedTab, setLastVisitedTab } from '@/lib/dashboardTabPreferences';
import { type DashboardTabId } from '@/components/dashboard/TabNav';
import { clusterLabel } from '@/lib/discovery';
import type {
  AuditFinding,
  DiscoveryCluster,
  DiscoveryInsight,
  DiscoveryRecommendation,
  DiscoveryResult,
  DiscoveryScoreSnapshot,
} from '@/lib/types';

interface ShellAudit {
  id: string;
  site_id: string;
  site: { domain: string; url: string };
  overall_score: number | null;
  crawlability_score: number | null;
  machine_readability_score: number | null;
  commercial_clarity_score: number | null;
  trust_clarity_score: number | null;
  pages_scanned: number;
  created_at: string;
  completed_at: string | null;
}

interface ShellPage {
  id: string;
  url: string;
  page_type: string;
  title: string | null;
  has_schema: boolean;
  schema_types: string[];
  meta_description: string | null;
  h1_text: string | null;
  word_count: number | null;
  load_time_ms: number | null;
  status_code: number | null;
  issues: string[];
}

interface ShellAuditData {
  audit: ShellAudit;
  pages?: ShellPage[];
  findings?: AuditFinding[];
  hasEntitlement?: boolean;
}

type Drilldown =
  | { kind: 'cluster'; cluster: DiscoveryCluster }
  | { kind: 'rec'; recId: string }
  | { kind: 'page'; pageId: string };

export default function AuditPage(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <div className="max-w-5xl mx-auto px-4 py-8">
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading…</p>
        </div>
      }
    >
      <AuditPageInner />
    </Suspense>
  );
}

function AuditPageInner(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const auditId = (params?.id as string) || '';
  const isLegacy = searchParams?.get('legacy') === 'true';

  const [activeTab, setActiveTab] = useState<DashboardTabId>('overview');
  const [data, setData] = useState<ShellAuditData | null>(null);
  const [snapshot, setSnapshot] = useState<DiscoveryScoreSnapshot | null>(null);
  const [insights, setInsights] = useState<DiscoveryInsight[]>([]);
  const [recommendations, setRecommendations] = useState<DiscoveryRecommendation[]>([]);
  const [results, setResults] = useState<DiscoveryResult[]>([]);
  const [trendHistory, setTrendHistory] = useState<DiscoveryScoreSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportAvailable, setReportAvailable] = useState(false);

  // Auto-run state (Phase 1.5a)
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [autoRunError, setAutoRunError] = useState<string | null>(null);

  const [drilldown, setDrilldown] = useState<Drilldown | null>(null);

  useEffect(() => {
    if (isLegacy || !auditId) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        await supabase.auth.getUser(); // ensure session is fresh; admin check not needed in shell

        const auditRes = await fetch(`/api/audit/${auditId}`);
        if (!auditRes.ok) {
          if (!cancelled) setError('Audit not found');
          return;
        }
        const auditJson = (await auditRes.json()) as ShellAuditData;
        if (cancelled) return;
        setData(auditJson);

        // Restore last-visited tab now that audit is real
        setActiveTab(getLastVisitedTab(auditId));

        const siteId = auditJson.audit?.site_id;
        const hasPaid = !!auditJson.hasEntitlement;
        if (!siteId) return;

        // Parallel discovery loads. CompetitorsTab fetches its own list
        // since it owns the create/edit/delete flow — no point pre-fetching here.
        const [resultsRes, insightsRes, recsRes, trendsRes] = await Promise.all([
          fetch(`/api/discovery/results?siteId=${encodeURIComponent(siteId)}`),
          fetch(`/api/discovery/insights?siteId=${encodeURIComponent(siteId)}`),
          fetch(`/api/discovery/recommendations?siteId=${encodeURIComponent(siteId)}`),
          fetch(`/api/discovery/trends?siteId=${encodeURIComponent(siteId)}`),
        ]);

        let snapshotForAutoCheck: DiscoveryScoreSnapshot | null = null;
        if (!cancelled && resultsRes.ok) {
          const r = await resultsRes.json();
          snapshotForAutoCheck = r.snapshot || null;
          setSnapshot(snapshotForAutoCheck);
          setResults(r.results || []);
          setReportAvailable(!!snapshotForAutoCheck);
        }
        if (!cancelled && insightsRes.ok) {
          const data = await insightsRes.json();
          setInsights((data.insights || []) as DiscoveryInsight[]);
        }
        if (!cancelled && recsRes.ok) {
          const data = await recsRes.json();
          setRecommendations((data.recommendations || []) as DiscoveryRecommendation[]);
        }
        if (!cancelled && trendsRes.ok) {
          const data = await trendsRes.json();
          setTrendHistory((data.snapshots || []) as DiscoveryScoreSnapshot[]);
        }

        // Phase 1.5a: auto-fire first run for paid users with no snapshot
        if (!cancelled && hasPaid && !snapshotForAutoCheck) {
          const startRes = await fetch('/api/discovery/run-and-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ siteId, trigger: 'auto_first_run' }),
          });
          if (startRes.ok) {
            const startData = await startRes.json();
            if (!cancelled && startData.jobId) setActiveJobId(startData.jobId);
          } else {
            const errBody = await startRes.json().catch(() => ({}));
            if (!cancelled) setAutoRunError(errBody?.error || 'Could not start AI Discovery run');
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [auditId, isLegacy]);

  const handleTabChange = useCallback(
    (id: DashboardTabId) => {
      setActiveTab(id);
      setLastVisitedTab(auditId, id);
    },
    [auditId],
  );

  const handleRerun = useCallback(async () => {
    if (!data?.audit?.site_id) return;
    const siteId = data.audit.site_id;

    // Try the subscriber path first — rerun-now returns 402 for non-subscribers.
    try {
      const res = await fetch('/api/discovery/rerun-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId }),
      });

      if (res.ok) {
        // Subscriber — reload so the shell's in-flight job detection
        // picks up the new job and renders AutoRunProgress.
        window.location.reload();
        return;
      }

      if (res.status === 402) {
        // Tier 1 — kick off Stripe checkout for the rescan SKU.
        const checkoutRes = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteId, priceType: 'rescan' }),
        });
        if (checkoutRes.ok) {
          const { url } = await checkoutRes.json();
          window.location.href = url;
          return;
        }
        const errBody = await checkoutRes.json().catch(() => ({}));
        alert(errBody.error || 'Could not start checkout. Try again or contact support.');
        return;
      }

      const errBody = await res.json().catch(() => ({}));
      alert(errBody.error || 'Could not start re-scan. Try again or contact support.');
    } catch {
      alert('Could not start re-scan. Network error.');
    }
  }, [data]);

  const handleJobComplete = useCallback(() => {
    window.location.reload();
  }, []);
  const handleJobError = useCallback((msg: string) => {
    setActiveJobId(null);
    setAutoRunError(msg);
  }, []);

  if (isLegacy) {
    return <LegacyAuditPage />;
  }

  if (loading) return <LoadingScreen />;
  if (error || !data) return <ErrorScreen message={error || 'Not found'} />;

  if (activeJobId) {
    return (
      <AutoRunProgress
        siteId={data.audit.site_id}
        jobId={activeJobId}
        onComplete={handleJobComplete}
        onError={handleJobError}
      />
    );
  }

  if (autoRunError) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4">
        <div
          className="border rounded-xl p-6"
          style={{ borderColor: 'rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.05)' }}
        >
          <h2 className="font-semibold mb-2" style={{ color: '#F87171' }}>
            Couldn&rsquo;t start AI Discovery
          </h2>
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>{autoRunError}</p>
          <button
            type="button"
            onClick={() => { setAutoRunError(null); window.location.reload(); }}
            className="text-sm px-3 py-1.5 rounded border"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const audit = data.audit;
  const hasPaid = !!data.hasEntitlement;

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <PersistentHeader
        auditId={audit.id}
        domain={audit.site?.domain || ''}
        snapshotDate={snapshot?.snapshot_date ?? null}
        pagesScanned={audit.pages_scanned || 0}
        aiScore={snapshot?.overall_score ?? null}
        aiGrade={snapshot?.overall_score !== null && snapshot?.overall_score !== undefined ? scoreToGrade(snapshot.overall_score) : null}
        readinessScore={audit.overall_score}
        readinessGrade={audit.overall_score !== null ? scoreToGrade(audit.overall_score) : null}
        hasPaid={hasPaid}
        reportAvailable={reportAvailable}
        onRerun={handleRerun}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />

      <main>
        {activeTab === 'overview' && snapshot && (
          <OverviewTab
            snapshot={snapshot}
            insights={insights}
            recommendations={recommendations}
            onTabChange={(t) => handleTabChange(t)}
          />
        )}
        {activeTab === 'overview' && !snapshot && (
          <NoSnapshotState />
        )}
        {activeTab === 'findings' && snapshot && (
          <FindingsTab
            snapshot={snapshot}
            insights={insights}
            results={results}
            onPromptDrilldown={(cluster) => setDrilldown({ kind: 'cluster', cluster })}
          />
        )}
        {activeTab === 'findings' && !snapshot && <NoSnapshotState />}
        {activeTab === 'priorities' && (
          <PrioritiesTab
            auditId={audit.id}
            domain={audit.site?.domain}
            businessName={audit.site?.domain}
          />
        )}
        {activeTab === 'competitors' && (
          <CompetitorsTab siteId={audit.site_id} results={results} />
        )}
        {activeTab === 'trends' && (
          <TrendsTab currentSnapshot={snapshot} history={trendHistory} />
        )}
        {activeTab === 'readiness' && (
          <SiteReadinessTab
            auditId={audit.id}
            audit={audit}
            findings={data.findings || []}
            pages={data.pages || []}
            onPageDrilldown={(pageId) => setDrilldown({ kind: 'page', pageId })}
          />
        )}
      </main>

      <SidePanel
        open={drilldown !== null}
        onClose={() => setDrilldown(null)}
        title={drilldownTitle(drilldown)}
        subtitle={drilldownSubtitle(drilldown)}
      >
        {drilldown?.kind === 'cluster' && (
          <ClusterDrilldown siteId={audit.site_id} cluster={drilldown.cluster} />
        )}
        {drilldown?.kind === 'rec' && (
          <RecommendationDrilldown rec={recommendations.find((r) => r.id === drilldown.recId)} />
        )}
        {drilldown?.kind === 'page' && (
          <PageDrilldown page={(data.pages || []).find((p) => p.id === drilldown.pageId)} />
        )}
      </SidePanel>
    </div>
  );
}

function drilldownTitle(d: Drilldown | null): string {
  if (!d) return '';
  if (d.kind === 'cluster') return `${clusterLabel(d.cluster)} cluster`;
  if (d.kind === 'rec') return 'Recommendation details';
  if (d.kind === 'page') return 'Page details';
  return '';
}

function drilldownSubtitle(d: Drilldown | null): string | undefined {
  if (!d) return undefined;
  if (d.kind === 'cluster') return 'Prompts in this cluster and how the business appeared';
  if (d.kind === 'rec') return 'Full context and rationale';
  if (d.kind === 'page') return 'Audit findings for this page';
  return undefined;
}

function RecommendationDrilldown({
  rec,
}: {
  rec: DiscoveryRecommendation | undefined;
}): React.ReactElement | null {
  if (!rec) return null;
  return (
    <div className="p-6 space-y-4">
      <div>
        <h3 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>
          {rec.title}
        </h3>
        <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
          {[rec.priority && `${rec.priority} priority`, rec.impact_estimate && `Impact: ${rec.impact_estimate}`, rec.difficulty_estimate && `Effort: ${rec.difficulty_estimate}`, rec.owner_type]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      {rec.description && (
        <div>
          <h4 className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>
            What to do
          </h4>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
            {rec.description}
          </p>
        </div>
      )}
      {rec.why_it_matters && (
        <div>
          <h4 className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>
            Why it matters
          </h4>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
            {rec.why_it_matters}
          </p>
        </div>
      )}
      {rec.suggested_timeline && (
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Suggested timeline: {rec.suggested_timeline}
        </p>
      )}
    </div>
  );
}

function PageDrilldown({ page }: { page: ShellPage | undefined }): React.ReactElement {
  if (!page) {
    return (
      <div className="p-6">
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Page not found.</p>
      </div>
    );
  }
  return (
    <div className="p-6 space-y-4">
      <div>
        <h3 className="font-semibold text-lg break-all" style={{ color: 'var(--text-primary)' }}>
          {page.title || page.url}
        </h3>
        <a
          href={page.url}
          target="_blank"
          rel="noopener"
          className="text-xs break-all hover:underline"
          style={{ color: 'var(--accent)' }}
        >
          {page.url}
        </a>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
        <div><span style={{ color: 'var(--text-tertiary)' }}>Type:</span> {page.page_type || '—'}</div>
        <div><span style={{ color: 'var(--text-tertiary)' }}>Status:</span> {page.status_code ?? '—'}</div>
        <div><span style={{ color: 'var(--text-tertiary)' }}>Schema:</span> {page.has_schema ? page.schema_types.join(', ') : 'None'}</div>
        <div><span style={{ color: 'var(--text-tertiary)' }}>Words:</span> {page.word_count ?? '—'}</div>
      </div>
      {page.issues?.length > 0 && (
        <div>
          <h4 className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>
            Issues ({page.issues.length})
          </h4>
          <ul className="space-y-1.5 text-sm" style={{ color: 'var(--text-primary)' }}>
            {page.issues.map((iss, i) => (
              <li key={i}>• {iss}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function NoSnapshotState(): React.ReactElement {
  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
        AI Discovery hasn&rsquo;t been run for this audit yet.
      </p>
    </div>
  );
}

function LoadingScreen(): React.ReactElement {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading…</p>
    </div>
  );
}

function ErrorScreen({ message }: { message: string }): React.ReactElement {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <p className="text-sm" style={{ color: '#F87171' }}>{message}</p>
    </div>
  );
}

