// ============================================================
// Pricing config + Stripe price-ID resolution.
//
// Single source of truth for tier pricing. Reads dollar amounts +
// Stripe price IDs from env vars so the operator can change either
// side (display price, Stripe product) without a code change.
//
// Pricing-page UI consumes getDisplayPricing(); the checkout route
// consumes resolveStripePriceId(sku).
//
// Tier 2 is intentionally hidden from the public pricing page until
// spec 2 ships. The SKUs and price IDs still resolve here so the
// webhook handler in Phase 4b.2 can route them — they're just not
// rendered on /pricing.
// ============================================================

import type { BillingEventType } from '@/lib/types';

// The four new SKUs introduced in Phase 1's billing_events constraint.
export type TierSku =
  | 'tier_1_one_time'
  | 'tier_1_monthly'
  | 'tier_2_one_time'
  | 'tier_2_monthly';

export type Cadence = 'one_time' | 'monthly';

const STRIPE_PRICE_ENV: Record<TierSku, string> = {
  tier_1_one_time: 'STRIPE_PRICE_TIER_1_ONE_TIME',
  tier_1_monthly: 'STRIPE_PRICE_TIER_1_MONTHLY',
  tier_2_one_time: 'STRIPE_PRICE_TIER_2_ONE_TIME',
  tier_2_monthly: 'STRIPE_PRICE_TIER_2_MONTHLY',
};

const DOLLAR_ENV: Record<TierSku, string> = {
  tier_1_one_time: 'PRICE_TIER_1_ONE_TIME_DOLLARS',
  tier_1_monthly: 'PRICE_TIER_1_MONTHLY_DOLLARS',
  tier_2_one_time: 'PRICE_TIER_2_ONE_TIME_DOLLARS',
  tier_2_monthly: 'PRICE_TIER_2_MONTHLY_DOLLARS',
};

// Sensible defaults so the page renders even if env vars aren't set
// in development. Production should always have the env vars set —
// the deployed price MUST match what's in Stripe, and that pairing
// only happens via env config.
const DEFAULT_DOLLARS: Record<TierSku, number> = {
  tier_1_one_time: 50,
  tier_1_monthly: 30,
  tier_2_one_time: 60,
  tier_2_monthly: 40,
};

export interface TierDisplay {
  oneTime: number;
  monthly: number;
}

export interface DisplayPricing {
  tier_1: TierDisplay;
  tier_2: TierDisplay;
}

export function getDisplayPricing(): DisplayPricing {
  return {
    tier_1: {
      oneTime: dollarOrDefault('tier_1_one_time'),
      monthly: dollarOrDefault('tier_1_monthly'),
    },
    tier_2: {
      oneTime: dollarOrDefault('tier_2_one_time'),
      monthly: dollarOrDefault('tier_2_monthly'),
    },
  };
}

function dollarOrDefault(sku: TierSku): number {
  const raw = process.env[DOLLAR_ENV[sku]];
  if (!raw) return DEFAULT_DOLLARS[sku];
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DOLLARS[sku];
}

/**
 * Resolves a SKU to its Stripe price ID. Returns null when the
 * STRIPE_PRICE_* env var is missing — caller (checkout route) maps
 * that to a 500 with a clear "missing config" message.
 */
export function resolveStripePriceId(sku: TierSku): string | null {
  const raw = process.env[STRIPE_PRICE_ENV[sku]];
  return raw && raw.startsWith('price_') ? raw : null;
}

export function isTierSku(s: string): s is TierSku {
  return (
    s === 'tier_1_one_time' ||
    s === 'tier_1_monthly' ||
    s === 'tier_2_one_time' ||
    s === 'tier_2_monthly'
  );
}

export function cadenceOf(sku: TierSku): Cadence {
  return sku.endsWith('_monthly') ? 'monthly' : 'one_time';
}

export function tierOf(sku: TierSku): 'tier_1' | 'tier_2' {
  return sku.startsWith('tier_1') ? 'tier_1' : 'tier_2';
}

/**
 * Maps a SKU to its corresponding billing_events.event_type. This is
 * an identity mapping today (the SKU names match the event_type values
 * exactly), but going through this helper makes the dependency
 * explicit and keeps refactors safe.
 */
export function billingEventTypeFor(sku: TierSku): BillingEventType {
  return sku;
}

/**
 * Stripe checkout-session mode. One-time payments are 'payment'; monthly
 * subscriptions are 'subscription'.
 */
export function stripeModeFor(sku: TierSku): 'payment' | 'subscription' {
  return cadenceOf(sku) === 'monthly' ? 'subscription' : 'payment';
}

export function formatDollars(n: number): string {
  return `$${n}`;
}
