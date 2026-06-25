// ============================================================
// /checkout/success
//
// Stripe redirects here after a successful checkout. Phase 4b.1
// shows a static confirmation; the webhook handler in Phase 4b.2
// is what actually creates the audit and triggers the scan.
//
// We don't read session_id here — it's in the URL but the
// provisioning happens server-side via webhook, not via this page.
// Reading it would just couple the success-page UX to webhook
// timing, which is fragile (the webhook may land before or after
// the user gets here).
// ============================================================

import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';

export default function CheckoutSuccessPage(): React.ReactElement {
  return (
    <div className="max-w-lg mx-auto px-4 py-16 sm:py-24">
      <div className="card p-8 text-center">
        <CheckCircle2 className="w-12 h-12 mx-auto mb-4" style={{ color: '#10B981' }} />

        <h1 className="text-2xl font-bold mb-3 tracking-tight" style={{ color: 'var(--text-primary)' }}>
          Payment received.
        </h1>

        <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          We&rsquo;re running your AI visibility scan now. You&rsquo;ll receive an email with your full report shortly &mdash; usually within a couple of minutes.
        </p>

        <p className="text-xs mb-8" style={{ color: 'var(--text-tertiary)' }}>
          You can close this tab. The email will include a link to your dashboard.
        </p>

        <Link
          href="/"
          className="inline-block text-xs px-4 py-2 rounded-lg border transition"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
