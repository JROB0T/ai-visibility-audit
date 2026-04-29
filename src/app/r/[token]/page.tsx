'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface ShareData {
  html: string;
  domain: string;
  snapshot_date: string | null;
  report_generated_at: string | null;
}

export default function PublicReportPage(): React.ReactElement {
  const params = useParams<{ token: string }>();
  const token = (params?.token as string) || '';

  const [data, setData] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--background, #f5f5f5)' }}
      >
        <p className="text-sm" style={{ color: 'var(--text-tertiary, #666)' }}>
          Loading report…
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
        className="border-b py-3 px-4 flex items-center justify-between text-xs"
        style={{ background: '#fff', borderColor: 'var(--border, #e5e5e5)' }}
      >
        <span style={{ color: 'var(--text-tertiary, #888)' }}>
          AI Visibility Report · {data.domain}
        </span>
        <span style={{ color: 'var(--text-tertiary, #888)' }}>
          {data.report_generated_at && (
            <>Generated {new Date(data.report_generated_at).toLocaleDateString()}</>
          )}
        </span>
      </header>

      <iframe
        srcDoc={data.html}
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
