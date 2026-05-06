// ============================================================
// POST /api/free-scan/request
//
// Public, no auth. Synchronous: ~60-90s response time (technical scan +
// 6-prompt discovery + report HTML build). The client UI shows a
// progress state during the wait — see src/app/free-scan/page.tsx.
//
// Flow:
//   1. Parse JSON body { email, url, honeypot }
//   2. Honeypot — if filled, return fake success (don't tip off bots)
//   3. Validate email + url
//   4. Rate-limit by IP (5/hour)
//   5. Uniqueness check on email_normalized OR domain_normalized
//   6. Insert free_scan_requests row (triggered_by='public')
//   7. Run the scan (runFreeScan)
//   8. On success: update audit_id on request row, return /r/[token]
//   9. On failure: update failed_at + failure_reason, return 500
//
// Returns:
//   { success: true, shareUrl: '/r/<token>' }
//   { error: string }                                with appropriate status
//   { error: string, upgradeUrl: '/pricing' }        on 409 conflict
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
import {
  checkRateLimit,
  getClientIp,
  RateLimitError,
} from '@/lib/rateLimit';

export const maxDuration = 300;

interface FreeScanRequestBody {
  email?: string;
  url?: string;
  honeypot?: string;
}

function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ----- Parse -----
  let body: FreeScanRequestBody;
  try {
    body = (await request.json()) as FreeScanRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // ----- Honeypot -----
  // If a bot filled the hidden field, return a 200 success-shaped response
  // without doing any work. Don't echo state that lets them detect the trap.
  if (body.honeypot && body.honeypot.length > 0) {
    return NextResponse.json({ success: true });
  }

  // ----- Validate -----
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

  // ----- Rate limit (per IP) -----
  const ip = getClientIp(request.headers);
  try {
    await checkRateLimit(`free-scan:${ip}`, { max: 5, windowSeconds: 3600 });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'Too many requests. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(err.retryAfterSeconds) } },
      );
    }
    throw err; // unexpected; bubble to outer handler
  }

  const admin = getAdminClient();

  // ----- Uniqueness — public path only -----
  // Migration 010 enforces this at the DB level via partial unique indexes
  // gated on triggered_by='public'. We pre-check here so we can return a
  // friendly 409 with the upgrade nudge instead of a generic 23505.
  const { data: existing, error: existingErr } = await admin
    .from('free_scan_requests')
    .select('id')
    .or(`email_normalized.eq.${emailNormalized},domain_normalized.eq.${domainNormalized}`)
    .eq('triggered_by', 'public')
    .limit(1)
    .maybeSingle();
  if (existingErr) {
    console.error('[FREE_SCAN_ERROR]', {
      phase: 'uniqueness_check',
      errorMessage: existingErr.message,
    });
    return NextResponse.json({ error: 'Could not start scan' }, { status: 500 });
  }
  if (existing) {
    return NextResponse.json(
      {
        error:
          'A free sample has already been generated for this email or website. To get an updated scan, sign up for a paid tier.',
        upgradeUrl: '/pricing',
      },
      { status: 409 },
    );
  }

  // ----- Insert request row -----
  const userAgent = request.headers.get('user-agent');
  const { data: requestRow, error: insertErr } = await admin
    .from('free_scan_requests')
    .insert({
      email: rawEmail,
      email_normalized: emailNormalized,
      domain: rawUrl,
      domain_normalized: domainNormalized,
      ip_address: ip === 'unknown' ? null : ip,
      user_agent: userAgent,
      triggered_by: 'public',
    })
    .select('id')
    .single();
  if (insertErr || !requestRow) {
    // 23505 means the partial unique index caught a race we missed in the
    // pre-check. Surface as a 409 like a normal duplicate.
    if (insertErr?.code === '23505') {
      return NextResponse.json(
        {
          error:
            'A free sample has already been generated for this email or website. To get an updated scan, sign up for a paid tier.',
          upgradeUrl: '/pricing',
        },
        { status: 409 },
      );
    }
    console.error('[FREE_SCAN_ERROR]', {
      phase: 'insert_request',
      errorMessage: insertErr?.message,
    });
    return NextResponse.json({ error: 'Could not start scan' }, { status: 500 });
  }
  const requestId = requestRow.id as string;

  // ----- Run the scan -----
  try {
    const result = await runFreeScan({ domain: domainNormalized, requestId });

    // Send the delivery email best-effort. Failure here does NOT fail the
    // request — the share link is already valid and the client will show
    // it in the success state. delivered_at only gets set on a confirmed
    // send; if the email failed the operator can manually re-send the
    // share URL from the row.
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
      shareUrl,
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
      requestId,
      domain: domainNormalized,
      errorName: err instanceof Error ? err.name : 'UnknownError',
      errorMessage: message,
      errorStack: err instanceof Error ? err.stack : undefined,
    });

    // Don't roll back the row — keeping it preserves the per-domain /
    // per-email uniqueness invariant on the public path even when the
    // scan failed. Operator can manually delete on customer request.
    return NextResponse.json(
      { error: 'Scan failed. Please try again later.' },
      { status: 500 },
    );
  }
}
