// ============================================================
// /audit/[id]/report — report viewer page
//
// The report HTML is a complete standalone document (its own
// <html>/<body>, its own styles, its own fonts). Rendering it
// inside the existing app chrome with other React components
// would break the paper-styled fixed-width page layout.
//
// We solve this by iframing the HTML via srcDoc. That gives:
//   - full visual fidelity (paper background, Fraunces/Geist
//     fonts, 8.5x11 pages with drop shadows)
//   - clean print behaviour (user's print dialog captures only
//     the iframe contents; the surrounding chrome is hidden by
//     the @media print rules already in the CSS)
//   - zero style bleed in either direction
//
// PDF export uses window.print() on the iframe. That's browser-
// native, works on all major browsers, and respects @page CSS
// for pagination. If we later need server-side PDFs (e.g. for
// automated email reports), we add @sparticuz/chromium +
// puppeteer-core to the API route — this UI doesn't change.
//
// Regenerate button POSTs { force: true } to /api/discovery/report
// and reloads the iframe contents.
// ============================================================

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ReportShareToggle from '@/components/dashboard/ReportShareToggle';

interface ReportMetadata {
  run_id: string;
  generated_at: string | null;
  cached: boolean;
  model: string | null;
}

export default function ReportPage() {
  const params = useParams<{ id: string }>();
  const auditId = params?.id;
  const router = useRouter();

  // We need the site_id to call /api/discovery/report. Audit page
  // already has this; fetch the audit record to get it.
  const [siteId, setSiteId] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [meta, setMeta] = useState<ReportMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);


  // ----- Step 1: fetch the audit to get site_id -----
  useEffect(() => {
    if (!auditId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/audit/${auditId}`);
        if (!res.ok) throw new Error(`Failed to load audit (${res.status})`);
        const data = await res.json();
        if (cancelled) return;
        // The audit API returns { audit: { site_id, ... }, pages, findings, ... }
        // — not a flat { site_id } object. Pull from data.audit.site_id.
        // Fall back to data.audit.site?.id for the edge case where the FK
        // column is null but the embedded site row is present.
        const resolvedSiteId = data?.audit?.site_id || data?.audit?.site?.id || null;
        if (!resolvedSiteId) throw new Error('Audit has no site_id');
        setSiteId(resolvedSiteId);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [auditId]);

  // ----- Step 2: load (or generate-and-load) the report -----
  const loadReport = useCallback(async (force: boolean) => {
    if (!siteId) return;
    setError(null);
    if (force) setGenerating(true); else setLoading(true);

    try {
      // Use POST so force=true is clean; POST always returns JSON
      // for us so we get metadata alongside HTML.
      const res = await fetch('/api/discovery/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, format: 'json', force }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || body?.error || `Request failed (${res.status})`);
      }
      const data = await res.json();
      setHtml(data.html);
      setMeta({
        run_id: data.run_id,
        generated_at: data.generated_at,
        cached: data.cached,
        model: data.model,
      });
      // Phase 2 share-link: capture snapshot id + token for the toggle
      if (typeof data.snapshot_id === 'string' && data.snapshot_id) {
        setSnapshotId(data.snapshot_id);
      }
      setShareToken((data.share_token as string | null) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setGenerating(false);
    }
  }, [siteId]);

  useEffect(() => {
    if (siteId) loadReport(false);
  }, [siteId, loadReport]);

  // ----- Actions -----
  const [downloading, setDownloading] = useState(false);

  const handlePrint = async (): Promise<void> => {
    if (!snapshotId || downloading) return;
    setDownloading(true);
    try {
      const res = await fetch('/api/discovery/report/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotId }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        alert(errBody.error || 'PDF download failed. Try again.');
        return;
      }

      // Pull filename out of Content-Disposition; fall back to a generic name.
      const contentDisposition = res.headers.get('Content-Disposition') || '';
      const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
      const filename = filenameMatch?.[1] || 'ai-visibility-report.pdf';

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF download error:', err);
      alert('PDF download failed. Network error.');
    } finally {
      setDownloading(false);
    }
  };

  const handleRegenerate = () => {
    if (!confirm('Regenerate the report? This will re-run the narrative generation and may take 15-30 seconds.')) return;
    loadReport(true);
  };

  const handleBack = () => router.back();

  // ----- Render -----
  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 bg-neutral-950 border-b border-neutral-800">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <button
            onClick={handleBack}
            className="text-xs text-neutral-400 hover:text-neutral-100 transition px-2 py-1"
          >
            ← Back
          </button>
          <div className="text-sm font-medium">AI Positioning Brief</div>
          <div className="flex-1" />
          {meta && (
            <div className="text-xs text-neutral-500">
              {meta.cached ? 'Cached' : 'Fresh'}
              {meta.generated_at && ` · Generated ${new Date(meta.generated_at).toLocaleString()}`}
              {meta.model && ` · ${meta.model}`}
            </div>
          )}
          <button
            onClick={handleRegenerate}
            disabled={loading || generating || !html}
            className="text-xs px-3 py-1.5 border border-neutral-700 rounded hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
            title="Re-run narrative generation and rebuild the report"
          >
            {generating ? 'Regenerating…' : 'Regenerate'}
          </button>
          <button
            onClick={handlePrint}
            disabled={!html || downloading}
            className="text-xs px-3 py-1.5 bg-white text-neutral-900 rounded hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium"
          >
            {downloading ? 'Generating PDF…' : 'Download PDF'}
          </button>
        </div>

        {/* Share toggle row — wrapped in a light surface and forced into
            light-mode CSS-variable values, so the toggle reads correctly
            regardless of the user's app-level theme. The surrounding report
            viewer is hardcoded dark (Tailwind bg-neutral-900) — this carve-out
            keeps the share controls legible. */}
        {snapshotId && html && (
          <div className="max-w-6xl mx-auto px-4 pb-3">
            <div
              className="rounded-lg p-3"
              style={{
                background: '#ffffff',
                color: '#0f172a',
                '--text-primary': '#0f172a',
                '--text-secondary': '#475569',
                '--text-tertiary': '#94a3b8',
                '--background': '#ffffff',
                '--border': '#e2e8f0',
                '--bg-tertiary': '#f1f5f9',
                '--accent': '#6366F1',
              } as React.CSSProperties}
            >
              <ReportShareToggle
                snapshotId={snapshotId}
                initialToken={shareToken}
                onTokenChange={(t) => setShareToken(t)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Status */}
      {error && (
        <div className="max-w-2xl mx-auto mt-12 px-4">
          <div className="border border-red-800 bg-red-950/40 text-red-200 rounded p-6">
            <div className="text-sm font-medium mb-2">Couldn&apos;t load the report</div>
            <div className="text-xs text-red-300 font-mono mb-4">{error}</div>
            <button
              onClick={() => loadReport(false)}
              className="text-xs px-3 py-1.5 border border-red-800 rounded hover:bg-red-900/40 transition"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {(loading || generating) && !error && (
        <div className="max-w-2xl mx-auto mt-24 px-4 text-center">
          <div className="text-sm text-neutral-400">
            {generating ? 'Generating report…' : 'Loading report…'}
          </div>
          <div className="text-xs text-neutral-600 mt-1">
            {generating ? 'This takes 15-30 seconds.' : null}
          </div>
        </div>
      )}

      {/* Report iframe */}
      {html && !error && (
        <iframe
          srcDoc={html}
          title="AI Positioning Brief"
          className="w-full block"
          style={{
            // Height sized for 7 letter pages + spacing. The iframe doesn't
            // auto-grow to content, and cross-origin srcdoc makes measuring
            // the inner document fiddly. A fixed generous height scrolls
            // naturally within.
            height: 'calc(11.5in * 7 + 400px)',
            minHeight: '200vh',
            border: 'none',
            background: '#1e1a12',
          }}
          sandbox="allow-same-origin allow-modals allow-popups"
        />
      )}
    </div>
  );
}
