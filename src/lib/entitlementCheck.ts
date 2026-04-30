// ============================================================
// Entitlement helpers for paid actions.
//
// Subscribers (has_monthly_monitoring=true on entitlements with
// active stripe_subscription_id) get re-runs for free.
//
// One-time-payment users (Tier 1 with can_view_core entitlement
// but no monthly subscription) must pay per re-run.
//
// Pure server-side helper — takes a SupabaseClient and returns
// a verdict. No HTTP, no caching.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export interface EntitlementVerdict {
  hasActiveSubscription: boolean;
  hasInitialPayment: boolean;
  reason: 'subscriber' | 'tier1' | 'unpaid';
}

export async function checkRescanEntitlement(
  admin: SupabaseClient,
  userId: string,
  siteId: string,
): Promise<EntitlementVerdict> {
  const { data: entitlement } = await admin
    .from('entitlements')
    .select('has_monthly_monitoring, can_view_core, can_export, stripe_subscription_id')
    .eq('user_id', userId)
    .eq('site_id', siteId)
    .maybeSingle();

  if (!entitlement) {
    return { hasActiveSubscription: false, hasInitialPayment: false, reason: 'unpaid' };
  }

  if (entitlement.has_monthly_monitoring && entitlement.stripe_subscription_id) {
    return { hasActiveSubscription: true, hasInitialPayment: true, reason: 'subscriber' };
  }

  if (entitlement.can_view_core || entitlement.can_export) {
    return { hasActiveSubscription: false, hasInitialPayment: true, reason: 'tier1' };
  }

  return { hasActiveSubscription: false, hasInitialPayment: false, reason: 'unpaid' };
}
