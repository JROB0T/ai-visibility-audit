// ============================================================
// POST /api/internal/paid-scan/run
//
// Long-running worker that does the actual scan + report build +
// email for a paid audit. Called by the Stripe webhook in fire-
// and-forget fashion: webhook responds 200 in < 5s, this worker
// runs ~60-90s independently.
//
// Auth: bearer ADMIN_TRIGGER_TOKEN (same gate as the admin free-
// scan trigger). Caller is always our own webhook running on the
// same Vercel project — never a customer.
//
// Body: { auditId }
//
// Returns 202 immediately if the audit isn't already completed.
// The actual work runs synchronously within this function's
// maxDuration=300 budget. If the function times out, the audit
// stays in 'running' state and Phase 5's catch-up cron is the
// safety net.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { runPaidScan } from '@/lib/paidScan';

export const maxDuration = 300;

function authorized(request: NextRequest): boolean {
  const expected = process.env.ADMIN_TRIGGER_TOKEN;
  if (!expected || expected.length < 8) return false;
  const header = request.headers.get('authorization') || '';
  return header === `Bearer ${expected}`;
}

interface WorkerBody {
  auditId?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: WorkerBody;
  try {
    body = (await request.json()) as WorkerBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const auditId = body.auditId;
  if (!auditId || typeof auditId !== 'string') {
    return NextResponse.json({ error: 'auditId required' }, { status: 400 });
  }

  try {
    await runPaidScan({ auditId });
    return NextResponse.json({ ok: true, auditId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[PAID_SCAN_WORKER_ERROR]', {
      auditId,
      errorMessage: message,
      errorStack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json({ error: 'Paid scan failed', detail: message }, { status: 500 });
  }
}
