// ============================================================
// API auth helper.
//
// Two callable patterns for protected endpoints:
//
//   requireApiKey(req)
//     Strict Bearer-token auth. Use for endpoints that should ONLY
//     accept programmatic access (e.g. batch processing, exports
//     embedded in outreach tools). Returns 401 on missing/bad/revoked
//     tokens.
//
//   requireApiKeyOrSession(req)
//     Accepts either a Bearer token OR a signed-in browser session.
//     Use for endpoints that serve both the dashboard UI and external
//     callers — typically read-only (export, status). Returns 401 if
//     neither succeeds.
//
// On success: { ok: true, userId, source: 'api_key' | 'session' }.
// On failure: { ok: false, error, status }.
// ============================================================

import type { NextRequest } from 'next/server';
import { verifyApiKey } from '@/lib/apiKeys';
import { createServerSupabase } from '@/lib/supabase/server';

export type ApiAuthSuccess = {
  ok: true;
  userId: string;
  source: 'api_key' | 'session';
};

export type ApiAuthFailure = {
  ok: false;
  error: string;
  status: number;
};

export type ApiAuthResult = ApiAuthSuccess | ApiAuthFailure;

function extractBearer(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : null;
}

export async function requireApiKey(request: NextRequest): Promise<ApiAuthResult> {
  const raw = extractBearer(request.headers.get('authorization'));
  if (!raw) {
    return { ok: false, error: 'Missing or malformed Authorization header', status: 401 };
  }
  const result = await verifyApiKey(raw);
  if (!result) {
    return { ok: false, error: 'Invalid or revoked API key', status: 401 };
  }
  return { ok: true, userId: result.userId, source: 'api_key' };
}

export async function requireApiKeyOrSession(request: NextRequest): Promise<ApiAuthResult> {
  // Try API key first — cheaper than a Supabase round-trip when the
  // caller is a programmatic client.
  const raw = extractBearer(request.headers.get('authorization'));
  if (raw) {
    const result = await verifyApiKey(raw);
    if (result) return { ok: true, userId: result.userId, source: 'api_key' };
    // Bearer header was present but invalid: surface clearly rather
    // than silently falling back to session — the caller almost
    // certainly meant to use the key.
    return { ok: false, error: 'Invalid or revoked API key', status: 401 };
  }

  // Fall through to session cookie.
  try {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return { ok: false, error: 'Authentication required', status: 401 };
    }
    return { ok: true, userId: data.user.id, source: 'session' };
  } catch (err) {
    console.error('[API_AUTH_ERROR]', { phase: 'session_lookup', message: err instanceof Error ? err.message : String(err) });
    return { ok: false, error: 'Authentication required', status: 401 };
  }
}
