'use client';

// ============================================================
// Root error boundary — Next.js App Router global-error.tsx convention.
//
// This is the last-resort boundary: it catches errors thrown in the root
// layout itself (which the segment-level error.tsx cannot). Because it
// REPLACES the root layout when it fires, it must render its own <html>
// and <body> tags and cannot rely on the app's nav/footer/theme chrome.
//
// Error monitoring (Vercel built-in): console.error here is captured by
// Vercel's Logs/Observability automatically — no SDK or key required.
// ============================================================

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactElement {
  useEffect(() => {
    console.error('[GLOBAL_ERROR]', {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          background: '#0a0a0a',
          color: '#fff',
        }}
      >
        <div style={{ textAlign: 'center', padding: '2rem', maxWidth: '28rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.75rem' }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: '0.875rem', opacity: 0.7, marginBottom: '1.5rem' }}>
            We hit an unexpected error. Please try again.
          </p>
          <button
            onClick={reset}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              borderRadius: '0.5rem',
              background: '#6366F1',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
