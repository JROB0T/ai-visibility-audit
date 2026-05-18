// ============================================================
// /api/keys
//
// GET   → list the current user's API keys (active + revoked).
//          Hashes are never returned; only id/name/prefix/timestamps.
// POST  → create a new API key. Returns the raw key in the
//          response — once. Caller is responsible for copying it.
//
// Both routes require a signed-in browser session (cookie auth) —
// the dashboard UI is the only intended caller. Programmatic
// callers shouldn't be minting their own keys.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createApiKey, listApiKeys } from '@/lib/apiKeys';

export const maxDuration = 10;

interface CreateBody {
  name?: string;
}

async function requireUser(): Promise<
  | { ok: true; userId: string }
  | { ok: false; status: number; error: string }
> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { ok: false, status: 401, error: 'Authentication required' };
  }
  return { ok: true, userId: data.user.id };
}

export async function GET(): Promise<NextResponse> {
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const keys = await listApiKeys(auth.userId);
    return NextResponse.json({ keys });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[API_KEYS_ERROR]', { phase: 'list', message });
    return NextResponse.json({ error: 'Could not list API keys' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = (body.name || '').trim();
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  try {
    const result = await createApiKey(auth.userId, name);
    // Returning rawKey ONCE. The UI is responsible for prompting the
    // user to copy it before navigating away — there's no recovery path.
    return NextResponse.json({
      id: result.id,
      name: result.name,
      prefix: result.prefix,
      created_at: result.createdAt,
      raw_key: result.rawKey,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[API_KEYS_ERROR]', { phase: 'create', message });
    return NextResponse.json({ error: 'Could not create API key' }, { status: 500 });
  }
}
