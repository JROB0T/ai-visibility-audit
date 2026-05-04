// ============================================================
// Rate limiting via Supabase rate_limit_buckets table.
//
// Pattern: read counter for key → if window expired reset, else
// increment, throw if over the limit. NOT atomic under concurrent
// writers; acceptable for the volumes we'll see on free-scan
// (5/hour/IP). For stricter guarantees, wrap in a SECURITY DEFINER
// RPC with row-level locking — see migration 012 header.
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export class RateLimitError extends Error {
  readonly statusCode = 429;
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super('Rate limit exceeded');
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface RateLimitOptions {
  /** Maximum requests allowed within the window. */
  max: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

/**
 * Throws RateLimitError when the key exceeds `max` requests within
 * `windowSeconds`. On success, increments the counter (creating or
 * resetting the bucket as needed) and returns.
 *
 * Best-effort: if the counter can't be persisted (e.g. transient DB
 * error), the call returns silently rather than locking out a real
 * user. Logged so unusual patterns surface in monitoring.
 */
export async function checkRateLimit(
  key: string,
  opts: RateLimitOptions,
): Promise<void> {
  const admin = getAdminClient();
  const now = new Date();
  const windowMs = opts.windowSeconds * 1000;

  const { data: existing, error: selectErr } = await admin
    .from('rate_limit_buckets')
    .select('count, window_start')
    .eq('key', key)
    .maybeSingle();

  if (selectErr) {
    console.warn('[RATE_LIMIT_WARN]', { phase: 'select', key, error: selectErr.message });
    return; // fail open
  }

  if (!existing) {
    const { error: insertErr } = await admin
      .from('rate_limit_buckets')
      .insert({ key, count: 1, window_start: now.toISOString() });
    if (insertErr && insertErr.code !== '23505') {
      console.warn('[RATE_LIMIT_WARN]', { phase: 'insert', key, error: insertErr.message });
    }
    // 23505 means a concurrent insert already happened — fine; the next
    // call will hit the existing-row branch.
    return;
  }

  const windowAge = now.getTime() - new Date(existing.window_start).getTime();

  if (windowAge >= windowMs) {
    // Window expired — reset.
    const { error: resetErr } = await admin
      .from('rate_limit_buckets')
      .update({ count: 1, window_start: now.toISOString() })
      .eq('key', key);
    if (resetErr) {
      console.warn('[RATE_LIMIT_WARN]', { phase: 'reset', key, error: resetErr.message });
    }
    return;
  }

  if (existing.count >= opts.max) {
    const remainingMs = windowMs - windowAge;
    throw new RateLimitError(Math.max(1, Math.ceil(remainingMs / 1000)));
  }

  const { error: incErr } = await admin
    .from('rate_limit_buckets')
    .update({ count: existing.count + 1 })
    .eq('key', key);
  if (incErr) {
    console.warn('[RATE_LIMIT_WARN]', { phase: 'increment', key, error: incErr.message });
  }
}

/**
 * Best-effort IP extraction from request headers. Never throws.
 * Returns 'unknown' if no usable header is present, so the caller
 * still rate-limits something rather than nothing.
 */
export function getClientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0].trim();
    if (first) return first;
  }
  const real = headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}
