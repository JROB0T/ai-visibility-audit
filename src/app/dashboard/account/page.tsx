// ============================================================
// /dashboard/account
//
// Account + billing landing page. Shows the signed-in user's email
// and subscription status, with a primary CTA that opens the
// Stripe-hosted Customer Portal where they can manage payment
// methods, view invoices, or cancel.
//
// Subscription state is inferred from `sites.has_monthly_monitoring`.
// If any site they own has it true, they're considered an active
// monthly subscriber. The Stripe Portal itself is the authoritative
// source — this UI is just the shortcut.
// ============================================================

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CreditCard, Loader2, AlertTriangle, ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface AccountState {
  email: string;
  hasSubscription: boolean;
}

export default function AccountPage(): React.ReactElement {
  const router = useRouter();
  const [state, setState] = useState<AccountState | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load(): Promise<void> {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth/login?redirect=/dashboard/account');
        return;
      }
      const { data: subSites } = await supabase
        .from('sites')
        .select('has_monthly_monitoring')
        .eq('user_id', user.id)
        .eq('has_monthly_monitoring', true)
        .limit(1);
      setState({
        email: user.email || '',
        hasSubscription: (subSites?.length ?? 0) > 0,
      });
      setLoading(false);
    }
    void load();
  }, [router]);

  const handleOpenPortal = useCallback(async (): Promise<void> => {
    setPortalLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/account/portal', { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error || 'Could not open billing portal.');
        setPortalLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError('Network error. Try again.');
      setPortalLoading(false);
    }
  }, []);

  const handleSignOut = useCallback(async (): Promise<void> => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }, [router]);

  if (loading || !state) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
        Loading…
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-xs mb-4"
        style={{ color: 'var(--text-tertiary)' }}
      >
        <ArrowLeft className="w-3 h-3" /> Dashboard
      </Link>

      <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
        Account
      </h1>
      <p className="text-sm mb-8" style={{ color: 'var(--text-tertiary)' }}>
        Manage your subscription, payment method, and account details.
      </p>

      {/* Account row */}
      <div className="card p-5 mb-5">
        <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Email</p>
        <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{state.email}</p>
      </div>

      {/* Subscription row */}
      <div className="card p-5 mb-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Subscription</p>
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
              {state.hasSubscription ? 'Monthly — Active' : 'No active subscription'}
            </p>
          </div>
          {state.hasSubscription ? (
            <button
              type="button"
              onClick={() => void handleOpenPortal()}
              disabled={portalLoading}
              className="btn-primary px-4 py-2 text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
            >
              {portalLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Opening…</>
              ) : (
                <><CreditCard className="w-4 h-4" /> Manage billing <ExternalLink className="w-3 h-3" /></>
              )}
            </button>
          ) : (
            <Link
              href="/pricing"
              className="btn-primary px-4 py-2 text-sm font-medium inline-flex items-center gap-2"
            >
              See plans
            </Link>
          )}
        </div>
        {state.hasSubscription && (
          <p className="text-xs mt-3" style={{ color: 'var(--text-tertiary)' }}>
            Update payment, view invoices, or cancel via the Stripe-hosted billing portal.
          </p>
        )}
      </div>

      {error && (
        <div className="mb-5 p-3 rounded-md text-sm flex items-start gap-2" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Sign out */}
      <div className="mt-8 text-center">
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="text-xs underline"
          style={{ color: 'var(--text-tertiary)' }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
