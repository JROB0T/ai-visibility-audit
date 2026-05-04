// ============================================================
// /api/audit/[id]/fix-list/[itemId]
//
// PATCH → update status (and optionally notes) for one item.
//   Body: { source: 'audit' | 'discovery', status?: 'open'|'done'|'skipped', notes?: string }
//
// Upserts into fix_list_items keyed on (audit_id, source, source_id).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const maxDuration = 10;

function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface PatchBody {
  source?: 'audit' | 'discovery';
  status?: 'open' | 'done' | 'skipped';
  notes?: string;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
): Promise<NextResponse> {
  const { id: auditId, itemId } = await params;

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.source || (body.source !== 'audit' && body.source !== 'discovery')) {
    return NextResponse.json({ error: 'source must be audit or discovery' }, { status: 400 });
  }
  if (body.status && !['open', 'done', 'skipped'].includes(body.status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 });
  }

  const admin = getAdminClient();

  const { data: audit } = await admin
    .from('audits')
    .select('id, tier')
    .eq('id', auditId)
    .maybeSingle();
  if (!audit) return NextResponse.json({ error: 'Audit not found' }, { status: 404 });

  // Tier gate — see GET /api/audit/[id]/fix-list for rationale.
  if (audit.tier !== 'tier_2') {
    return NextResponse.json(
      { error: 'The operational fix list is available on Tier 2 only.' },
      { status: 403 },
    );
  }

  const { data, error } = await admin
    .from('fix_list_items')
    .upsert(
      {
        audit_id: auditId,
        source: body.source,
        source_id: itemId,
        status: body.status || 'open',
        notes: body.notes ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'audit_id,source,source_id' },
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ item: data });
}
