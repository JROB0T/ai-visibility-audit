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
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ background: 'var(--background, #0a0a0a)', color: 'var(--text-primary, #fff)' }}
    >
      <div
        className="w-full max-w-lg rounded-xl border p-8"
        style={{
          background: 'var(--bg-secondary, #111)',
          borderColor: 'var(--border, #2a2a2a)',
        }}
      >
        <h1
          className="text-2xl font-semibold mb-2"
          style={{ color: 'var(--text-primary, #fff)', fontFamily: 'serif' }}
        >
          See how AI sees your business.
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary, #999)' }}>
          We&rsquo;ll run a 6-prompt sample and email you a 2-page summary showing where you appear, where you don&rsquo;t, and who&rsquo;s being recommended in your place.
        </p>

        {state.kind === 'success' ? (
          <SuccessView shareUrl={state.shareUrl} />
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <fieldset disabled={submitting} className="space-y-4">
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary, #aaa)' }}>
                  Your email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  autoComplete="email"
                  className="w-full px-3 py-2 rounded-md text-sm border outline-none"
                  style={{
                    background: 'var(--bg-tertiary, #0a0a0a)',
                    borderColor: 'var(--border, #2a2a2a)',
                    color: 'var(--text-primary, #fff)',
                  }}
                />
              </div>
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary, #aaa)' }}>
                  Your website
                </label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="example.com"
                  required
                  autoComplete="url"
                  className="w-full px-3 py-2 rounded-md text-sm border outline-none"
                  style={{
                    background: 'var(--bg-tertiary, #0a0a0a)',
                    borderColor: 'var(--border, #2a2a2a)',
                    color: 'var(--text-primary, #fff)',
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
                className="w-full py-2.5 rounded-md text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: '#fff', color: '#0a0a0a' }}
              >
                {submitting ? 'Running your scan…' : 'Get my free sample'}
              </button>

              {submitting && (
                <p className="text-xs text-center" style={{ color: 'var(--text-tertiary, #888)' }}>
                  {PROGRESS_MESSAGES[progressIdx]} (about a minute total)
                </p>
              )}
            </fieldset>

            {state.kind === 'conflict' && (
              <div
                className="mt-4 rounded-md p-3 text-sm"
                style={{
                  background: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  color: '#f5b042',
                }}
              >
                <p className="mb-2">{state.message}</p>
                <Link
                  href={state.upgradeUrl}
                  className="text-xs font-medium underline"
                  style={{ color: '#fbbf24' }}
                >
                  See pricing →
                </Link>
              </div>
            )}
            {state.kind === 'error' && (
              <div
                className="mt-4 rounded-md p-3 text-sm"
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                }}
              >
                {state.message}
              </div>
            )}
          </form>
        )}

        <p className="text-xs mt-6" style={{ color: 'var(--text-tertiary, #666)' }}>
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
        className="rounded-md p-4"
        style={{
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
        }}
      >
        <p className="text-sm font-medium mb-1" style={{ color: '#34d399' }}>
          Your sample is ready.
        </p>
        <p className="text-xs" style={{ color: 'var(--text-secondary, #999)' }}>
          Bookmark this link — it&rsquo;s yours to share. We&rsquo;ll also email it to you shortly.
        </p>
      </div>

      <Link
        href={shareUrl}
        className="block w-full py-2.5 rounded-md text-sm font-medium text-center transition"
        style={{ background: '#fff', color: '#0a0a0a' }}
      >
        Open my sample →
      </Link>

      <Link
        href="/pricing"
        className="block text-xs text-center underline"
        style={{ color: 'var(--text-tertiary, #888)' }}
      >
        See what the full report includes
      </Link>
    </div>
  );
}
