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

interface OutreachEmail {
  subject: string;
  body: string;
  meta: {
    business_name: string;
    domain: string;
    overall_score: number;
    grade: string;
    share_url: string;
    top_missing_query_1: string;
    top_missing_query_2: string;
  };
}

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
  // A plain load hits the cache and returns near-instantly. If it's still
  // running after a short beat, we're almost certainly in a live (cache
  // miss) generation — flip to the progress message so it doesn't look
  // broken. Cache hits resolve before this fires, so they never show it.
  const [slowLoad, setSlowLoad] = useState(false);
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
    // Show the "Generating…" progress copy if a plain load runs long
    // (cache miss → live generation). Forced regens always generate, so
    // they don't need the delay.
    setSlowLoad(false);
    const slowTimer = force ? null : setTimeout(() => setSlowLoad(true), 2500);

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
      if (slowTimer) clearTimeout(slowTimer);
      setSlowLoad(false);
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

  // ----- Outreach email snippet (Phase 9) -----
  // Pulls a pre-written cold email from the server (uses real audit
  // data — business name, score, top-2 missing queries, share URL).
  // We don't try to compose it client-side because the data isn't all
  // loaded here (top-missing queries especially need a DB read).
  const [outreach, setOutreach] = useState<OutreachEmail | null>(null);
  const [outreachLoading, setOutreachLoading] = useState(false);
  const [outreachError, setOutreachError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<'subject' | 'body' | 'both' | null>(null);

  const handleGenerateOutreach = useCallback(async (): Promise<void> => {
    if (!auditId) return;
    setOutreachLoading(true);
    setOutreachError(null);
    try {
      const res = await fetch(`/api/audit/${auditId}/outreach-email`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOutreachError(data.error || 'Could not generate the outreach email.');
        setOutreach(null);
        return;
      }
      setOutreach(data as OutreachEmail);
    } catch {
      setOutreachError('Network error.');
    } finally {
      setOutreachLoading(false);
    }
  }, [auditId]);

  const handleCopyOutreach = useCallback(async (field: 'subject' | 'body' | 'both'): Promise<void> => {
    if (!outreach) return;
    const text =
      field === 'subject' ? outreach.subject :
      field === 'body' ? outreach.body :
      `${outreach.subject}\n\n${outreach.body}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2200);
    } catch {
      // Fallback — user can still select/copy from the textarea manually.
    }
  }, [outreach]);

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
            onClick={handleGenerateOutreach}
            disabled={outreachLoading || !html}
            className="text-xs px-3 py-1.5 border border-neutral-700 rounded hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
            title="Pre-write a cold outreach email using this report's data"
          >
            {outreachLoading ? 'Generating…' : 'Outreach email'}
          </button>
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

      {/* ===== Outreach email modal (Phase 9) ===== */}
      {(outreach || outreachError) && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center px-4 py-12 overflow-y-auto"
          style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={() => { setOutreach(null); setOutreachError(null); }}
        >
          <div
            className="w-full max-w-2xl rounded-xl border bg-neutral-950 border-neutral-800 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-neutral-100">Outreach email</h2>
              <button
                type="button"
                onClick={() => { setOutreach(null); setOutreachError(null); }}
                className="text-xs text-neutral-400 hover:text-neutral-100"
              >
                Close
              </button>
            </div>

            {outreachError && (
              <div className="rounded-md border border-red-800 bg-red-950/40 text-red-200 text-xs p-3 mb-4">
                {outreachError}
              </div>
            )}

            {outreach && (
              <>
                <p className="text-xs text-neutral-400 mb-3">
                  Pre-written using <span className="text-neutral-200">{outreach.meta.business_name}</span>&rsquo;s
                  data — score {outreach.meta.overall_score}/100 (grade {outreach.meta.grade}).
                  Replace <code className="text-neutral-200">{'{{firstName | there}}'}</code> and
                  <code className="text-neutral-200"> {'{{senderName | -- }}'}</code> with your outreach tool&rsquo;s merge fields
                  (or hardcode them).
                </p>

                {/* Subject */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-neutral-400 uppercase tracking-wider">Subject</label>
                    <button
                      type="button"
                      onClick={() => handleCopyOutreach('subject')}
                      className="text-xs px-2 py-0.5 rounded border border-neutral-700 hover:bg-neutral-800 transition"
                    >
                      {copiedField === 'subject' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <input
                    type="text"
                    readOnly
                    value={outreach.subject}
                    className="w-full px-3 py-2 rounded-md text-sm bg-neutral-900 text-neutral-100 border border-neutral-800"
                  />
                </div>

                {/* Body */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-neutral-400 uppercase tracking-wider">Body</label>
                    <button
                      type="button"
                      onClick={() => handleCopyOutreach('body')}
                      className="text-xs px-2 py-0.5 rounded border border-neutral-700 hover:bg-neutral-800 transition"
                    >
                      {copiedField === 'body' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <textarea
                    readOnly
                    value={outreach.body}
                    rows={10}
                    className="w-full px-3 py-2 rounded-md text-sm font-mono bg-neutral-900 text-neutral-100 border border-neutral-800 leading-relaxed"
                  />
                </div>

                {/* Copy everything */}
                <button
                  type="button"
                  onClick={() => handleCopyOutreach('both')}
                  className="w-full py-2 rounded-md text-sm font-medium bg-white text-neutral-900 hover:bg-neutral-200 transition"
                >
                  {copiedField === 'both' ? 'Copied subject + body' : 'Copy subject + body'}
                </button>

                <p className="text-xs text-neutral-500 mt-4">
                  We don&rsquo;t send the email from here — paste it into Instantly, Apollo, Clay, or your tool of choice.
                </p>
              </>
            )}
          </div>
        </div>
      )}

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
          {generating || slowLoad ? (
            <>
              <div
                className="inline-block w-6 h-6 mb-4 rounded-full animate-spin"
                style={{ border: '2px solid #404040', borderTopColor: '#e5e5e5' }}
              />
              <div className="text-sm text-neutral-200">
                Generating your brief — this takes ~20–30s
              </div>
              <div className="text-xs text-neutral-500 mt-1">
                We&apos;re running the analysis now. This page updates automatically when it&apos;s ready.
              </div>
            </>
          ) : (
            <div className="text-sm text-neutral-400">Loading report…</div>
          )}
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
