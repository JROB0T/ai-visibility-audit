'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface AutoRunProgressProps {
  siteId: string;
  jobId: string;
  onComplete: (runId: string | null) => void;
  onError: (msg: string) => void;
}

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_MS = 5 * 60 * 1000; // 5 minutes safety net

export default function AutoRunProgress({
  jobId,
  onComplete,
  onError,
}: AutoRunProgressProps): React.ReactElement {
  const [phase, setPhase] = useState<'discovery' | 'report' | null>(null);
  const [message, setMessage] = useState<string>('Starting…');
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    const startTime = Date.now();

    // Tick elapsed counter every second for the user-visible timer
    const tickInterval = setInterval(() => {
      if (!cancelled) setElapsedSec(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    const poll = async () => {
      if (cancelled) return;

      if (Date.now() - startTime > MAX_POLL_MS) {
        cancelled = true;
        onError('Job exceeded maximum wait time. Please refresh and try again.');
        return;
      }

      try {
        const res = await fetch(`/api/discovery/job-status?jobId=${jobId}`);
        if (!res.ok) {
          if (res.status >= 500) {
            // Transient — keep polling
            pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
            return;
          }
          const errBody = await res.json().catch(() => ({}));
          cancelled = true;
          onError(errBody?.error || `Status check failed (${res.status})`);
          return;
        }

        const data = await res.json();
        const job = data.job;

        if (!cancelled) {
          setPhase((job.phase as 'discovery' | 'report' | null) || null);
          if (job.progress_message) setMessage(job.progress_message);
        }

        if (job.status === 'complete') {
          cancelled = true;
          onComplete(job.run_id || null);
          return;
        }

        if (job.status === 'failed') {
          cancelled = true;
          onError(job.error || 'Job failed');
          return;
        }

        pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
      } catch {
        // Network error — try again
        pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
      clearInterval(tickInterval);
    };
  }, [jobId, onComplete, onError]);

  const discoveryDone = phase === 'report' || (phase === null && elapsedSec > 0 && message !== 'Starting…');
  const reportActive = phase === 'report';

  return (
    <div className="max-w-xl mx-auto py-16 sm:py-24 px-4 text-center">
      <div
        className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--accent)' }} />
      </div>

      <h1 className="text-2xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
        Generating your AI Positioning Brief
      </h1>
      <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
        This usually takes about 90 seconds.
      </p>

      <div className="mt-10">
        <p className="text-base" style={{ color: 'var(--text-secondary)' }}>
          {message}
        </p>
        <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
          {phase ? phase.toUpperCase() + ' · ' : ''}{formatElapsed(elapsedSec)}
        </p>
      </div>

      <div
        className="mt-12 flex items-center justify-center gap-6 text-xs"
        style={{ color: 'var(--text-tertiary)' }}
      >
        <Step active={phase === 'discovery'} done={discoveryDone} label="1 · Discovery" />
        <div className="w-8 h-px" style={{ background: 'var(--border)' }} />
        <Step active={reportActive} done={false} label="2 · Report" />
      </div>
    </div>
  );
}

function Step({
  active,
  done,
  label,
}: {
  active: boolean;
  done: boolean;
  label: string;
}): React.ReactElement {
  return (
    <span
      style={{
        color: active ? 'var(--accent)' : done ? 'var(--text-secondary)' : 'var(--text-tertiary)',
        fontWeight: active ? 600 : 400,
      }}
    >
      {label}
    </span>
  );
}

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
