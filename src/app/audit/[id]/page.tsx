'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { isAdminAccount } from '@/lib/entitlements';
import LegacyAuditPage from './page.legacy';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import DiscoveryDashboard from '@/components/discovery/DiscoveryDashboard';
import SiteReadiness from '@/components/dashboard/SiteReadiness';
import ClusterDrilldown from '@/components/dashboard/ClusterDrilldown';
import SidePanel from '@/components/dashboard/SidePanel';
import AutoRunProgress from '@/components/dashboard/AutoRunProgress';
import { clusterLabel } from '@/lib/discovery';
import type { DiscoveryCluster, DiscoveryScoreSnapshot } from '@/lib/types';

interface ShellAuditData {
  audit: {
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
  };
  hasEntitlement?: boolean;
}

export default function AuditPage(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
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

  const [data, setData] = useState<ShellAuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [snapshot, setSnapshot] = useState<DiscoveryScoreSnapshot | null>(null);
  const [reportAvailable, setReportAvailable] = useState(false);

  const [drilldownCluster, setDrilldownCluster] = useState<DiscoveryCluster | null>(null);

  // Auto-run state
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [autoRunError, setAutoRunError] = useState<string | null>(null);

  useEffect(() => {
    if (isLegacy) return;
    if (!auditId) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user;
        if (cancelled) return;
        setIsAuthenticated(!!user);
        setIsAdmin(isAdminAccount(user?.email));

        const res = await fetch(`/api/audit/${auditId}`);
        if (!res.ok) {
          if (!cancelled) setError('Audit not found');
          return;
        }
        const auditData = (await res.json()) as ShellAuditData;
        if (cancelled) return;
        setData(auditData);

        const siteId = auditData?.audit?.site_id;
        const hasPaid = !!auditData?.hasEntitlement;
        let haveSnapshot = false;
        if (siteId) {
          try {
            const snapRes = await fetch(`/api/discovery/results?siteId=${encodeURIComponent(siteId)}`);
            if (snapRes.ok) {
              const snapData = await snapRes.json();
              if (!cancelled) {
                setSnapshot(snapData.snapshot || null);
                setReportAvailable(!!snapData.snapshot);
                haveSnapshot = !!snapData.snapshot;
              }
            }
          } catch { /* non-fatal */ }
        }

        // Auto-fire first run for paid users with no snapshot.
        // run-and-report's "alreadyRunning: true" branch covers the case where
        // a job is already in flight (e.g. user refreshed mid-run).
        if (!cancelled && siteId && hasPaid && !haveSnapshot) {
          try {
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
          } catch (err) {
            if (!cancelled) setAutoRunError(err instanceof Error ? err.message : 'Could not start AI Discovery run');
          }
        }
      } catch {
        if (!cancelled) setError('Failed to load audit');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [auditId, isLegacy]);

  const handleJobComplete = useCallback(() => {
    // Cleanest correct behavior: full reload so the new snapshot, prompts,
    // insights, recs, and cached report all hydrate fresh.
    window.location.reload();
  }, []);

  const handleJobError = useCallback((msg: string) => {
    setActiveJobId(null);
    setAutoRunError(msg);
  }, []);

  if (isLegacy) {
    return <LegacyAuditPage />;
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading…</p>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <p className="text-sm" style={{ color: '#F87171' }}>{error || 'Audit not found'}</p>
      </div>
    );
  }

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
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
            {autoRunError}
          </p>
          <button
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
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <DashboardHeader
        auditId={audit.id}
        domain={audit.site?.domain || ''}
        businessName={audit.site?.domain || null}
        overallScore={snapshot?.overall_score ?? null}
        grade={null}
        strategicPosture={null}
        snapshotDate={snapshot?.snapshot_date ?? null}
        pagesScanned={audit.pages_scanned}
        hasPaid={hasPaid}
        onRunDiscovery={undefined}
        isRunningDiscovery={false}
        reportAvailable={reportAvailable}
      />

      {isAuthenticated && hasPaid && (
        <DiscoveryDashboard
          auditId={audit.id}
          siteId={audit.site_id}
          isPaid={hasPaid}
          isAdmin={isAdmin}
          reportAvailable={reportAvailable}
          onClusterDrilldown={(cluster) => setDrilldownCluster(cluster)}
        />
      )}

      {isAuthenticated && hasPaid && (
        <SiteReadiness
          crawlabilityScore={audit.crawlability_score}
          machineReadabilityScore={audit.machine_readability_score}
          commercialClarityScore={audit.commercial_clarity_score}
          trustClarityScore={audit.trust_clarity_score}
          auditId={audit.id}
          reportAvailable={reportAvailable}
        />
      )}

      <SidePanel
        open={drilldownCluster !== null}
        onClose={() => setDrilldownCluster(null)}
        title={drilldownCluster ? `${clusterLabel(drilldownCluster)} cluster` : ''}
        subtitle="Prompts in this cluster and how the business appeared"
      >
        {drilldownCluster && (
          <ClusterDrilldown
            siteId={audit.site_id}
            cluster={drilldownCluster}
          />
        )}
      </SidePanel>
    </div>
  );
}
