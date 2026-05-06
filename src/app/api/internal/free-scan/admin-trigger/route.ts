// ============================================================
// POST /api/internal/free-scan/admin-trigger
//
// Internal endpoint for sales-driven free scans. Same orchestrator as
// the public /api/free-scan/request, with three differences:
//
//   1. Authorization: Bearer <ADMIN_TRIGGER_TOKEN>  (env var)
//   2. Skips email + domain uniqueness checks (sales can re-trigger)
//   3. Skips IP rate limiting (the bearer token is the gate)
//
// triggered_by='admin' on the free_scan_requests row, which means the
// partial unique indexes from migration 010 do NOT apply — admin runs
// freely coexist with public submissions for the same email/domain.
//
// Set ADMIN_TRIGGER_TOKEN in .env.local. If unset, the route refuses
// every call (rather than running unauthenticated).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { runFreeScan } from '@/lib/freeScan';
import { sendFreeSampleEmail } from '@/lib/email';
import {
  isValidEmail,
  isValidDomain,
  normalizeEmail,
  normalizeDomain,
} from '@/lib/normalize';

export const maxDuration = 300;

interface AdminTriggerBody {
  email?: string;
  url?: string;
}

function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function authorized(request: NextRequest): boolean {
  const expected = process.env.ADMIN_TRIGGER_TOKEN;
  if (!expected || expected.length < 8) return false; // fail-closed if env missing
  const header = request.headers.get('authorization') || '';
  return header === `Bearer ${expected}`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: AdminTriggerBody;
  try {
    body = (await request.json()) as AdminTriggerBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const rawEmail = (body.email || '').trim();
  const rawUrl = (body.url || '').trim();
  if (!isValidEmail(rawEmail)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
  }
  if (!isValidDomain(rawUrl)) {
    return NextResponse.json({ error: 'Invalid website URL' }, { status: 400 });
  }
  const emailNormalized = normalizeEmail(rawEmail);
  const domainNormalized = normalizeDomain(rawUrl);

  const admin = getAdminClient();

  const { data: requestRow, error: insertErr } = await admin
    .from('free_scan_requests')
    .insert({
      email: rawEmail,
      email_normalized: emailNormalized,
      domain: rawUrl,
      domain_normalized: domainNormalized,
      ip_address: null,
      user_agent: 'admin-trigger',
      triggered_by: 'admin',
    })
    .select('id')
    .single();
  if (insertErr || !requestRow) {
    console.error('[FREE_SCAN_ERROR]', {
      phase: 'insert_request',
      source: 'admin',
      errorMessage: insertErr?.message,
    });
    return NextResponse.json({ error: 'Could not start scan' }, { status: 500 });
  }
  const requestId = requestRow.id as string;

  try {
    const result = await runFreeScan({ domain: domainNormalized, requestId });

    // Best-effort email delivery, same semantics as the public path.
    const shareUrl = `/r/${result.shareToken}`;
    const emailResult = await sendFreeSampleEmail({
      to: rawEmail,
      domain: domainNormalized,
      shareUrl,
    });

    const updates: Record<string, string> = { audit_id: result.auditId };
    if (emailResult.sent) {
      updates.delivered_at = new Date().toISOString();
    }
    await admin.from('free_scan_requests').update(updates).eq('id', requestId);

    return NextResponse.json({
      success: true,
      requestId,
      auditId: result.auditId,
      shareUrl,
      emailSent: emailResult.sent,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin
      .from('free_scan_requests')
      .update({
        failed_at: new Date().toISOString(),
        failure_reason: message.slice(0, 500),
      })
      .eq('id', requestId);

    console.error('[FREE_SCAN_ERROR]', {
      phase: 'run_scan',
      source: 'admin',
      requestId,
      domain: domainNormalized,
      errorName: err instanceof Error ? err.name : 'UnknownError',
      errorMessage: message,
      errorStack: err instanceof Error ? err.stack : undefined,
    });

    return NextResponse.json(
      { error: 'Scan failed.', detail: message.slice(0, 200) },
      { status: 500 },
    );
  }
}
