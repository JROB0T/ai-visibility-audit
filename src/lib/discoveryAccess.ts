// ============================================================
// Shared access helpers for every /api/discovery/** route.
//
// Consolidates the auth + ownership + entitlement pattern so we don't
// repeat the same 15 lines in every route handler.
// ============================================================

import { createServerSupabase } from '@/lib/supabase/server';
import { isAdminAccount } from '@/lib/entitlements';

export type DiscoveryAccessResult =
  | { ok: true; userId: string; isAdmin: boolean; isPaid: boolean; siteId: string }
  | { ok: false; status: 401 | 403 | 404; error: string };

async function resolveAccess(siteId: string): Promise<DiscoveryAccessResult> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, status: 401, error: 'Authentication required' };
  }
  const isAdmin = isAdminAccount(user.email);

  // Ownership check (admins bypass)
  if (!isAdmin) {
    const { data: site } = await supabase
      .from('sites')
      .select('id, user_id')
      .eq('id', siteId)
      .maybeSingle();
    if (!site) {
      return { ok: false, status: 404, error: 'Site not found' };
    }
    if (site.user_id !== user.id) {
      return { ok: false, status: 403, error: 'Not authorized for this site' };
    }
  }

  // Paid check (admins are implicitly paid for the flag's purpose)
  let isPaid = isAdmin;
  if (!isAdmin) {
    const { data: entitlement } = await supabase
      .from('entitlements')
      .select('can_view_core')
      .eq('user_id', user.id)
      .eq('site_id', siteId)
      .maybeSingle();
    isPaid = !!entitlement?.can_view_core;
  }

  return { ok: true, userId: user.id, isAdmin, isPaid, siteId };
}

/**
 * Authenticated + site-owner (or admin). No paid gate.
 * Use for: GETs, prompt CRUD, competitor CRUD (non-infer), generate-prompts, run-tests
 * (run-tests applies its own tier-based paid gate after this).
 */
export async function requireDiscoveryAccess(
  _request: Request,
  siteId: string,
): Promise<DiscoveryAccessResult> {
  return resolveAccess(siteId);
}

/**
 * Authenticated + site-owner (or admin) + paid entitlement (or admin).
 * Use for: competitors/infer, generate-insights, generate-recommendations,
 * results PATCH, recommendations PATCH, export-report.
 */
export async function requireFullDiscoveryAccess(
  _request: Request,
  siteId: string,
): Promise<DiscoveryAccessResult> {
  const base = await resolveAccess(siteId);
  if (!base.ok) return base;
  if (!base.isAdmin && !base.isPaid) {
    return { ok: false, status: 403, error: 'Full discovery requires a paid plan' };
  }
  return base;
}
