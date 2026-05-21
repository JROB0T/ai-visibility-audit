// ============================================================
// Global 404 — Next.js App Router not-found.tsx convention.
// Rendered whenever a route handler calls notFound() OR a path
// doesn't match any route. Wrapped by the root layout, so it
// inherits the AIVA nav and footer chrome.
// ============================================================

import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Page not found — AIVA',
};

export default function NotFound(): React.ReactElement {
  return (
    <div className="max-w-md mx-auto px-4 py-20 text-center">
      <p className="text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--text-tertiary)' }}>
        404
      </p>
      <h1 className="text-3xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
        Page not found
      </h1>
      <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>
        The link you followed may be broken, or the page may have moved.
      </p>
      <div className="flex items-center justify-center gap-3">
        <Link
          href="/"
          className="btn-primary px-4 py-2 text-sm font-medium rounded-lg"
        >
          Go home
        </Link>
        <Link
          href="/free-scan"
          className="px-4 py-2 text-sm font-medium rounded-lg border"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          Get a free sample
        </Link>
      </div>
    </div>
  );
}
