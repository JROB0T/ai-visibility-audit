'use client';

// ============================================================
// /pricing → Buy button
//
// Client component for a single tier card's CTA. Posts the sku to
// /api/checkout/tier and navigates to the returned Stripe URL.
// Disables itself during the request to avoid double-submits.
// ============================================================

import { useState } from 'react';
import type { TierSku } from '@/lib/pricing';

type Variant = 'primary' | 'secondary';

interface BuyButtonProps {
  sku: TierSku;
  label: string;
  variant?: Variant;
}

export default function BuyButton({ sku, label, variant = 'secondary' }: BuyButtonProps): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleClick(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/checkout/tier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
        detail?: string;
      };
      if (!res.ok || !data.url) {
        setErr(data.detail || data.error || 'Could not start checkout. Try again.');
        setBusy(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setErr('Network error. Try again.');
      setBusy(false);
    }
  }

  // primary = indigo brand button (used on the highlighted plan card)
  // secondary = subtle outlined button (used on the free / non-highlight card)
  const className =
    variant === 'primary'
      ? 'btn-primary w-full py-2.5 rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed'
      : 'w-full py-2.5 rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed';
  const inlineStyle =
    variant === 'secondary'
      ? { background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border)' }
      : undefined;

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className={className}
        style={inlineStyle}
      >
        {busy ? 'Starting checkout…' : label}
      </button>
      {err && <p className="text-xs mt-2" style={{ color: '#B91C1C' }}>{err}</p>}
    </div>
  );
}
