// ============================================================
// DELETE /api/keys/[id]
//
// Revoke an API key. Soft-delete: sets revoked_at, leaves the row
// in place so audit logs ("this key fetched X at Y") still resolve.
// Idempotent — revoking an already-revoked key returns 200.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { revokeApiKey } from '@/lib/apiKeys';
import { isOperatorAccount } from '@/lib/entitlements';

export const maxDuration = 10;

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  if (!isOperatorAccount(data.user.email)) {
    return NextResponse.json({ error: 'API keys are not enabled for this account' }, { status: 403 });
  }

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'key id required' }, { status: 400 });
  }

  try {
    await revokeApiKey(data.user.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[API_KEYS_ERROR]', { phase: 'revoke', keyId: id, message });
    return NextResponse.json({ error: 'Could not revoke API key' }, { status: 500 });
  }
}
