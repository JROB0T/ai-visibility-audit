'use client';

// ============================================================
// Route-segment error boundary — Next.js App Router error.tsx convention.
//
// Catches unhandled render/runtime errors thrown by any page or nested
// segment under the root layout (so it keeps the Aivascan nav + footer).
// Without this, such an error shows Next's default unstyled screen and
// — more importantly — goes uncaptured.
//
// Error monitoring (Vercel built-in): we console.error the digest +
// message here. Vercel automatically captures function/console output in
// the Logs/Observability dashboard, so this surfaces client and SSR
// render failures without any third-party SDK or API key. If the operator
// later wants richer tracking, swap the console.error for a Sentry call.
// ============================================================

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactElement {
  useEffect(() => {
    console.error('[APP_ERROR]', {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <div className="max-w-md mx-auto px-4 py-20 text-center">
      <p className="text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--text-tertiary)' }}>
        Something went wrong
      </p>
      <h1 className="text-3xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
        We hit an unexpected error
      </h1>
      <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>
        The issue has been logged. You can try again, or head back home.
      </p>
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={reset}
          className="btn-primary px-4 py-2 text-sm font-medium rounded-lg"
        >
          Try again
        </button>
        <a
          href="/"
          className="px-4 py-2 text-sm font-medium rounded-lg border"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          Go home
        </a>
      </div>
    </div>
  );
}
