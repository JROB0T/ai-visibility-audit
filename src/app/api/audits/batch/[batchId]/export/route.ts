// ============================================================
// GET /api/audits/batch/[batchId]/export
//
// Thin wrapper over /api/audits/export. Resolves the batch's
// completed audit IDs and forwards them as the `audit_ids` filter
// to the generic exporter — same data shape, batch-scoped.
//
// Why a wrapper instead of duplicating the assembly logic:
// the spec wants per-batch export, but integrations that hold raw
// audit IDs (e.g. Clay enrichments) also benefit from the generic
// path. One implementation, two surfaces.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireApiKeyOrSession } from '@/lib/apiAuth';

export const maxDuration = 60;

function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function appBaseUrl(request: NextRequest): string {
  const host = request.headers.get('host');
  const isLocalhost = host ? /^(localhost|127\.|0\.0\.0\.0)/i.test(host) : false;
  if (host) return `${isLocalhost ? 'http' : 'https'}://${host}`;
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
): Promise<NextResponse> {
  const auth = await requireApiKeyOrSession(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { batchId } = await params;
  if (!batchId) {
    return NextResponse.json({ error: 'batchId required' }, { status: 400 });
  }

  const admin = getAdminClient();

  // Ownership check.
  const { data: batch } = await admin
    .from('audit_batches')
    .select('id, created_by')
    .eq('id', batchId)
    .maybeSingle();
  if (!batch || batch.created_by !== auth.userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Gather completed audit IDs for this batch.
  const { data: jobs } = await admin
    .from('audit_jobs')
    .select('audit_id')
    .eq('batch_id', batchId)
    .eq('status', 'completed');
  const auditIds = (jobs || [])
    .map(j => j.audit_id as string | null)
    .filter((x): x is string => !!x);

  // Forward to the generic exporter with the audit_ids filter. We
  // build a URL on the same origin and proxy the auth header forward
  // so the generic route's own auth check passes.
  const params2 = request.nextUrl.searchParams;
  const format = params2.get('format') === 'json' ? 'json' : 'csv';
  const forwardUrl = new URL(`${appBaseUrl(request)}/api/audits/export`);
  forwardUrl.searchParams.set('format', format);
  if (auditIds.length > 0) {
    forwardUrl.searchParams.set('audit_ids', auditIds.join(','));
  } else {
    // No completed audits yet → return an empty payload directly so
    // the caller can distinguish "batch is still running" from "batch
    // has no data".
    if (format === 'json') {
      return NextResponse.json({ rows: [] });
    }
    return new NextResponse('', {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="batch-${batchId.slice(0, 8)}-empty.csv"`,
      },
    });
  }

  // Proxy with the original auth header so the export route's gate
  // re-runs against the same caller identity.
  const authHeader = request.headers.get('authorization');
  const cookieHeader = request.headers.get('cookie');
  const proxied = await fetch(forwardUrl.toString(), {
    headers: {
      ...(authHeader ? { authorization: authHeader } : {}),
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
    cache: 'no-store',
  });

  // Stream the proxied response back with a batch-scoped filename.
  const body = await proxied.arrayBuffer();
  const datePart = new Date().toISOString().slice(0, 10);
  const filename = `batch-${batchId.slice(0, 8)}-${datePart}.${format}`;
  const headers = new Headers();
  headers.set('Content-Type', proxied.headers.get('content-type') || (format === 'json' ? 'application/json' : 'text/csv; charset=utf-8'));
  if (format === 'csv') {
    headers.set('Content-Disposition', `attachment; filename="${filename}"`);
  }
  headers.set('Cache-Control', 'no-store');
  return new NextResponse(body, { status: proxied.status, headers });
}
