// ============================================================
// Find-or-create a Supabase auth user by email.
//
// Used by the Stripe webhook to provision an account for a paying
// customer who hit /pricing → Stripe → /checkout/success without
// previously having a Supabase account.
//
// Strategy: query auth.users via the admin API to find an existing
// row by email. If absent, create one with email_confirm=true so
// the user can sign in without an extra "verify your email" step —
// they prove ownership of the email by completing Stripe checkout
// from it.
//
// Returns { userId, isNew } so callers can decide whether to send
// a "welcome / account-created" affordance (currently the
// report-ready email handles both cases, with a magic-link sign-in
// CTA).
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface ProvisionedUser {
  userId: string;
  isNew: boolean;
}

function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Look up a user by email. Returns null if not found.
 * Paginated through the admin API; we cap at 500 results which is
 * more than enough for our scale. Email match is case-insensitive
 * because Supabase normalizes emails on storage.
 */
async function findUserByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) {
    throw new Error(`listUsers failed: ${error.message}`);
  }
  const found = data.users.find(u => (u.email || '').toLowerCase() === normalized);
  return found?.id || null;
}

/**
 * Find an existing auth user for this email, or create one.
 * The newly-created user is auto-confirmed (no email verification
 * loop) because the buyer just authenticated themselves to Stripe
 * with the same address.
 */
export async function findOrCreateUserByEmail(email: string): Promise<ProvisionedUser> {
  const admin = getAdminClient();
  const normalized = email.trim().toLowerCase();

  const existing = await findUserByEmail(admin, normalized);
  if (existing) return { userId: existing, isNew: false };

  const { data, error } = await admin.auth.admin.createUser({
    email: normalized,
    email_confirm: true,
    user_metadata: { signup_source: 'stripe_checkout' },
  });

  if (error || !data.user) {
    // 23505 / duplicate: a race between our listUsers and createUser
    // call. Re-query for the existing user; if still missing, surface
    // the original error.
    if (error && /duplicate|already.*registered/i.test(error.message)) {
      const second = await findUserByEmail(admin, normalized);
      if (second) return { userId: second, isNew: false };
    }
    throw new Error(`createUser failed: ${error?.message || 'no user returned'}`);
  }

  return { userId: data.user.id, isNew: true };
}
