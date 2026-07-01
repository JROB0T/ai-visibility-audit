// ============================================================
// /free-scan — public form for the free email-capture sample.
//
// State machine:
//   idle       → form visible
//   submitting → form disabled, cycling progress copy
//   success    → form replaced with share-link CTA
//   conflict   → 409 message + upgrade nudge (re-enables form)
//   error      → generic error, form re-enabled
//
// The endpoint is synchronous (~60-90s). We don't poll progress —
// just rotate static copy on a timer so the page feels alive.
// ============================================================

'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type FormState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; shareUrl: string }
  | { kind: 'conflict'; message: string; upgradeUrl: string }
  | { kind: 'error'; message: string };

const PROGRESS_MESSAGES = [
  'Looking up your business…',
  'Asking AI assistants buyer-intent questions…',
  'Recording how each one answers…',
  'Scoring the results and building your sample…',
];

export default function FreeScanPage(): React.ReactElement {
  const [email, setEmail] = useState('');
  const [url, setUrl] = useState('');
  const [honeypot, setHoneypot] = useState(''); // bots fill this; humans don't see it
  const [state, setState] = useState<FormState>({ kind: 'idle' });

  // Pre-fill the website field from ?url= (set by the homepage hero
  // input). Read via window.location instead of useSearchParams so we
  // don't need a Suspense boundary for a one-time read.
  useEffect(() => {
    const prefill = new URLSearchParams(window.location.search).get('url');
    if (prefill) setUrl(prefill);
  }, []);

  // Pre-fill the email field from the signed-in session so logged-in
  // users don't have to retype the address they already authenticated
  // with. If they're anonymous, the field stays empty as before.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) setEmail(data.user.email);
    });
  }, []);

  // Cycling progress copy during submitting state.
  const [progressIdx, setProgressIdx] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (state.kind !== 'submitting') {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setProgressIdx(0);
      return;
    }
    intervalRef.current = setInterval(() => {
      setProgressIdx((i) => Math.min(i + 1, PROGRESS_MESSAGES.length - 1));
    }, 12_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [state.kind]);

  const submitting = state.kind === 'submitting';

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (submitting) return;
    setState({ kind: 'submitting' });

    try {
      const res = await fetch('/api/free-scan/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, url, honeypot }),
      });
      const data: {
        success?: boolean;
        shareUrl?: string;
        error?: string;
        upgradeUrl?: string;
      } = await res.json().catch(() => ({}));

      if (res.ok && data.success && data.shareUrl) {
        setState({ kind: 'success', shareUrl: data.shareUrl });
        return;
      }

      if (res.status === 409) {
        setState({
          kind: 'conflict',
          message: data.error || 'A free sample has already been generated for this email or website.',
          upgradeUrl: data.upgradeUrl || '/pricing',
        });
        return;
      }

      if (res.status === 429) {
        setState({
          kind: 'error',
          message: 'Too many requests from your IP. Please try again in an hour.',
        });
        return;
      }

      setState({
        kind: 'error',
        message: data.error || 'Something went wrong. Please try again.',
      });
    } catch {
      setState({
        kind: 'error',
        message: 'Network error. Please check your connection and try again.',
      });
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-12 sm:py-16">
      <div className="card p-7 sm:p-8">
        <h1
          className="text-2xl font-bold mb-2 tracking-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          See how AI sees your business
        </h1>
        <p className="text-sm mb-7" style={{ color: 'var(--text-secondary)' }}>
          We&rsquo;ll run a 6-prompt sample and email you a 2-page summary showing where you appear, where you don&rsquo;t, and who&rsquo;s being recommended in your place.
        </p>

        {state.kind === 'success' ? (
          <SuccessView shareUrl={state.shareUrl} />
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <fieldset disabled={submitting} className="space-y-4">
              <div>
                <label className="block text-xs mb-1.5 font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Your email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  autoComplete="email"
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none focus:ring-2"
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
              <div>
                <label className="block text-xs mb-1.5 font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Your website
                </label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="example.com"
                  required
                  autoComplete="url"
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none focus:ring-2"
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              {/* Honeypot — hidden from real users, visible to bots that
                  scrape the DOM. Wrapped in a label-style div with
                  autocomplete='off' to avoid password managers filling. */}
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: '-9999px',
                  width: '1px',
                  height: '1px',
                  overflow: 'hidden',
                }}
              >
                <label>
                  Do not fill this in
                  <input
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    name="honeypot"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                  />
                </label>
              </div>

              <button
                type="submit"
                className="btn-primary w-full py-2.5 rounded-lg text-sm font-medium transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? 'Running your scan…' : 'Get my free sample'}
              </button>

              {submitting && (
                <p className="text-xs text-center" style={{ color: 'var(--text-tertiary)' }}>
                  {PROGRESS_MESSAGES[progressIdx]} (about a minute total)
                </p>
              )}
            </fieldset>

            {state.kind === 'conflict' && (
              <div
                className="mt-4 rounded-lg p-3 text-sm"
                style={{
                  background: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  color: '#92400E',
                }}
              >
                <p className="mb-2">{state.message}</p>
                <Link
                  href={state.upgradeUrl}
                  className="text-xs font-medium underline"
                  style={{ color: '#B45309' }}
                >
                  See pricing →
                </Link>
              </div>
            )}
            {state.kind === 'error' && (
              <div
                className="mt-4 rounded-lg p-3 text-sm"
                style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#B91C1C',
                }}
              >
                {state.message}
              </div>
            )}
          </form>
        )}

        <p className="text-xs mt-6" style={{ color: 'var(--text-tertiary)' }}>
          One free sample per email and per website. No credit card required. No account created.
        </p>
      </div>
    </div>
  );
}

function SuccessView({ shareUrl }: { shareUrl: string }): React.ReactElement {
  return (
    <div className="space-y-4">
      <div
        className="rounded-lg p-4"
        style={{
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
        }}
      >
        <p className="text-sm font-semibold mb-1" style={{ color: '#047857' }}>
          Your sample is ready.
        </p>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Bookmark this link — it&rsquo;s yours to share. We&rsquo;ll also email it to you shortly.
        </p>
      </div>

      <Link
        href={shareUrl}
        className="btn-primary block w-full py-2.5 rounded-lg text-sm font-medium text-center transition"
      >
        Open my sample →
      </Link>

      <Link
        href="/pricing"
        className="block text-xs text-center underline"
        style={{ color: 'var(--text-tertiary)' }}
      >
        See what the full report includes
      </Link>
    </div>
  );
}
