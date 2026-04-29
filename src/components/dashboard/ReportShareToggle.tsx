'use client';

import { useState } from 'react';
import { Check, Copy, Link as LinkIcon, Lock } from 'lucide-react';

interface ReportShareToggleProps {
  snapshotId: string;
  initialToken: string | null;
  onTokenChange?: (token: string | null) => void;
}

export default function ReportShareToggle({
  snapshotId,
  initialToken,
  onTokenChange,
}: ReportShareToggleProps): React.ReactElement {
  const [token, setToken] = useState<string | null>(initialToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justCopied, setJustCopied] = useState(false);

  const isShared = !!token;
  const shareUrl =
    token && typeof window !== 'undefined' ? `${window.location.origin}/r/${token}` : null;

  async function setEnabled(enable: boolean): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/discovery/report/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotId, enable }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Could not update sharing');
        return;
      }
      const data = await res.json();
      setToken(data.share_token);
      if (onTokenChange) onTokenChange(data.share_token);
    } catch {
      setError('Could not update sharing');
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(): Promise<void> {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), 2000);
    } catch {
      setError('Could not copy. Select the link manually.');
    }
  }

  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={isShared}
          onClick={() => setEnabled(!isShared)}
          disabled={busy}
          className="relative inline-flex w-9 h-5 rounded-full transition shrink-0 disabled:opacity-50"
          style={{ background: isShared ? 'var(--accent)' : 'var(--border)' }}
        >
          <span
            className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm"
            style={{ left: isShared ? '18px' : '2px' }}
          />
        </button>
        <div className="text-sm flex items-center gap-1.5">
          {isShared ? (
            <>
              <LinkIcon className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
              <span style={{ color: 'var(--text-primary)' }}>Shareable link active</span>
            </>
          ) : (
            <>
              <Lock className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
              <span style={{ color: 'var(--text-secondary)' }}>Private — only you can view</span>
            </>
          )}
        </div>
      </div>

      {isShared && shareUrl && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={shareUrl}
            onClick={(e) => (e.target as HTMLInputElement).select()}
            className="flex-1 min-w-0 px-2 py-1 rounded border text-xs"
            style={{
              background: 'var(--background)',
              borderColor: 'var(--border)',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)',
            }}
          />
          <button
            type="button"
            onClick={copyLink}
            className="text-xs px-2.5 py-1 rounded border inline-flex items-center gap-1 transition shrink-0"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            {justCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {justCopied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}

      {error && <p className="text-xs" style={{ color: '#EF4444' }}>{error}</p>}

      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
        {isShared
          ? 'Anyone with the link can view this report. Turning off sharing breaks the link.'
          : 'Generate an unlisted link to share this report with clients or team members without a login.'}
      </p>
    </div>
  );
}
