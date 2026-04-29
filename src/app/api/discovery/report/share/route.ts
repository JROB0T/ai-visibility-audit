// ============================================================
// /api/discovery/report/share
//
// POST → toggle sharing on/off for a snapshot.
//   Body: { snapshotId, enable: boolean }
//   Returns: { share_token: string | null, shared_at: string | null }
//
// Auth: requires the user to own the site the snapshot belongs to.
// Reuses the existing requireFullDiscoveryAccess pattern with the
// snapshot's site_id.
//
// Idempotent:
//   - enable=true on already-shared returns existing token
//   - enable=false on not-shared is a no-op success
//
// Re-enabling after disabling generates a NEW token. Old links 404.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireFullDiscoveryAccess } from '@/lib/discoveryAccess';
import { generateShareToken } from '@/lib/shareTokens';

export const maxDuration = 10;

function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface PostBody {
  snapshotId?: string;
  enable?: boolean;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: PostBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.snapshotId || typeof body.enable !== 'boolean') {
    return NextResponse.json({ error: 'snapshotId and enable required' }, { status: 400 });
  }

  const admin = getAdminClient();

  const { data: snapshot, error: snapErr } = await admin
    .from('discovery_score_snapshots')
    .select('id, site_id, share_token, shared_at')
    .eq('id', body.snapshotId)
    .maybeSingle();
  if (snapErr || !snapshot) {
    return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
  }

  const auth = await requireFullDiscoveryAccess(request, snapshot.site_id as string);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (body.enable) {
    if (snapshot.share_token) {
      return NextResponse.json({
        share_token: snapshot.share_token,
        shared_at: snapshot.shared_at,
      });
    }

    let token = generateShareToken();
    let attempt = 0;
    while (attempt < 3) {
      const now = new Date().toISOString();
      const { data, error } = await admin
        .from('discovery_score_snapshots')
        .update({ share_token: token, shared_at: now })
        .eq('id', snapshot.id)
        .select('share_token, shared_at')
        .single();

      if (!error) {
        return NextResponse.json({
          share_token: data.share_token,
          shared_at: data.shared_at,
        });
      }
      // Unique violation — retry with a fresh token (cosmically unlikely)
      if (error.code === '23505') {
        token = generateShareToken();
        attempt++;
        continue;
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ error: 'Could not generate token' }, { status: 500 });
  }

  // enable=false → revoke
  if (!snapshot.share_token) {
    return NextResponse.json({ share_token: null, shared_at: null });
  }

  const { error: updErr } = await admin
    .from('discovery_score_snapshots')
    .update({ share_token: null, shared_at: null })
    .eq('id', snapshot.id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ share_token: null, shared_at: null });
}
