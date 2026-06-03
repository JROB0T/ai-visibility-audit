'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface ShareData {
  html: string;
  domain: string;
  snapshot_date: string | null;
  report_generated_at: string | null;
}

// Reports are rendered inside an <iframe srcdoc>. Without this, the
// "Upgrade to the full report" anchor (and any other link) navigates
// the iframe itself — relative URLs resolve against about:srcdoc,
// which silently fails. Injecting <base target="_top"> makes every
// anchor break out to the top window so /pricing actually loads.
// Applies to ALL existing reports without a DB migration since we
// patch the persisted HTML at render time.
function injectTopTarget(html: string): string {
  const tag = '<base target="_top">';
  if (html.includes('<head>')) return html.replace('<head>', `<head>${tag}`);
  if (html.includes('<html>')) return html.replace('<html>', `<html><head>${tag}</head>`);
  return tag + html;
}

export default function PublicReportPage(): React.ReactElement {
  const params = useParams<{ token: string }>();
  const token = (params?.token as string) || '';

  const [data, setData] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfState, setPdfState] = useState<'idle' | 'loading' | 'error'>('idle');

  // Fetch the PDF as a blob then trigger a download. Previously this
  // was a bare <a href download> link, which had a nasty failure mode:
  // when chromium spin-up timed out, the server returned a JSON error
  // and the browser saved a "pdf.json" file with "Site wasn't available"
  // — confusing for recipients. Now we control the flow: 200 → real
  // download, anything else → inline "try again" message.
  async function handleDownloadPdf(): Promise<void> {
    if (pdfState === 'loading') return;
    setPdfState('loading');
    try {
      const res = await fetch(`/api/r/${encodeURIComponent(token)}/pdf`);
      if (!res.ok) {
        setPdfState('error');
        setTimeout(() => setPdfState('idle'), 5000);
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get('content-disposition') || '';
      const match = /filename="?([^"]+)"?/.exec(cd);
      const filename = match?.[1] || `ai-visibility-${token}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setPdfState('idle');
    } catch {
      setPdfState('error');
      setTimeout(() => setPdfState('idle'), 5000);
    }
  }

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/r/${encodeURIComponent(token)}`);
        if (!res.ok) {
          if (!cancelled) {
            setError(
              res.status === 404
                ? 'This share link is no longer active.'
                : 'Could not load report.',
            );
          }
          return;
        }
        const json = (await res.json()) as ShareData;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError('Could not load report.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (loading) {
    // Unlike the authed /audit/[id]/report view, this public endpoint only
    // ever serves the PERSISTED report_html (a sub-second DB read) — it
    // never runs a live Claude generation. So we show a quick spinner
    // rather than a "this takes ~20-30s" message, which would be wrong and
    // would itself look broken when the report pops in immediately.
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-3"
        style={{ background: 'var(--background, #f5f5f5)' }}
      >
        <div
          className="w-6 h-6 rounded-full animate-spin"
          style={{ border: '2px solid var(--border, #ddd)', borderTopColor: 'var(--text-tertiary, #888)' }}
        />
        <p className="text-sm" style={{ color: 'var(--text-tertiary, #666)' }}>
          Loading your report…
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-6"
        style={{ background: 'var(--background, #f5f5f5)' }}
      >
        <div className="max-w-md text-center">
          <h1
            className="text-xl font-semibold mb-2"
            style={{ color: 'var(--text-primary, #111)' }}
          >
            Report unavailable
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary, #666)' }}>
            {error || 'This share link is not currently active.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--background, #f5f5f5)' }}>
      {/* Minimal attribution header — does NOT shout the product brand. The
          report itself carries the strategic narrative weight. */}
      <header
        className="border-b py-3 px-4 flex items-center justify-between gap-3 text-xs"
        style={{ background: '#fff', borderColor: 'var(--border, #e5e5e5)' }}
      >
        <span className="truncate" style={{ color: 'var(--text-tertiary, #888)' }}>
          AI Visibility Report · {data.domain}
        </span>
        <div className="flex items-center gap-3 shrink-0">
          {data.report_generated_at && (
            <span style={{ color: 'var(--text-tertiary, #888)' }}>
              Generated {new Date(data.report_generated_at).toLocaleDateString()}
            </span>
          )}
          {/* Public PDF download — JS-driven so we can surface server
              failures inline instead of saving a bogus "pdf.json" file
              when chromium spin-up times out. */}
          <button
            type="button"
            onClick={() => void handleDownloadPdf()}
            disabled={pdfState === 'loading'}
            className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium transition"
            style={{
              background: pdfState === 'error' ? '#7c2d12' : '#1a1a1a',
              color: '#ffffff',
              opacity: pdfState === 'loading' ? 0.7 : 1,
              cursor: pdfState === 'loading' ? 'wait' : 'pointer',
              border: 'none',
            }}
          >
            {pdfState === 'loading'
              ? 'Generating…'
              : pdfState === 'error'
              ? 'Try again'
              : 'Download PDF'}
          </button>
        </div>
      </header>

      <iframe
        srcDoc={injectTopTarget(data.html)}
        title={`AI Visibility Report for ${data.domain}`}
        style={{
          width: '100%',
          height: 'calc(100vh - 50px)',
          border: 'none',
          display: 'block',
        }}
      />
    </div>
  );
}
