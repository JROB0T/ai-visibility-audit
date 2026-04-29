// ============================================================
// /api/discovery/report
//
// GET/POST — returns the generated HTML report for a (siteId, runId).
//
// Flow:
//   1. Auth + ownership check (requireFullDiscoveryAccess).
//   2. Resolve runId (latest snapshot if not provided).
//   3. If snapshot has cached report_html AND !force → return cached.
//   4. Otherwise: call /api/discovery/export-report internally to get the
//      structured payload, run it through generateReportNarrative() to get
//      the prose, stamp the template with buildReportHtml(), persist on
//      the snapshot, return.
//
// Contract:
//   GET  /api/discovery/report?siteId=X[&runId=Y][&format=html|json]
//        force refresh requires POST (so accidental cache-busting can't
//        happen from a link).
//   POST /api/discovery/report  body: { siteId, runId?, force? }
//        same response shape; use this to explicitly regenerate.
//
// Response (format=html, default): text/html with the full document.
// Response (format=json): { html, narrative, model, generated_at, cached }
//   — useful for the viewer page which wants metadata alongside the HTML.
//
// Caching philosophy:
//   The narrative is deterministic-ish per (run_id, model) but not per
//   re-call — the LLM will vary slightly on retries. So we cache by run_id
//   to keep the report stable until the user explicitly regenerates.
//   If report_html is null, we generate. If report_html exists and the
//   caller didn't pass force=true, we return it unchanged.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireFullDiscoveryAccess } from '@/lib/discoveryAccess';
import { generateReportNarrative, type ReportExportPayload, type ReportNarrative } from '@/lib/reportNarrative';
import { buildReportHtml } from '@/lib/reportTemplate';

// Narrative generation is a single Claude call — typically 30-90s on Sonnet 4.6.
// Requires Vercel Pro (or higher) for this timeout.
export const maxDuration = 300;

function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface RunRequest {
  siteId: string;
  runId: string | null;
  format: 'html' | 'json';
  force: boolean;
}

function parseGet(request: NextRequest): RunRequest | { error: string } {
  const params = request.nextUrl.searchParams;
  const siteId = params.get('siteId');
  if (!siteId) return { error: 'siteId query param required' };
  const format = params.get('format') === 'json' ? 'json' : 'html';
  return { siteId, runId: params.get('runId'), format, force: false };
}

async function parsePost(request: NextRequest): Promise<RunRequest | { error: string }> {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return { error: 'Invalid JSON body' }; }
  const siteId = typeof body.siteId === 'string' ? body.siteId : null;
  if (!siteId) return { error: 'siteId is required' };
  return {
    siteId,
    runId: typeof body.runId === 'string' ? body.runId : null,
    format: body.format === 'html' ? 'html' : 'json',  // default JSON for POST; a UI regenerate flow usually wants the metadata
    force: body.force === true,
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const parsed = parseGet(request);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  return handleRequest(request, parsed);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed = await parsePost(request);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  return handleRequest(request, parsed);
}

async function handleRequest(request: NextRequest, req: RunRequest): Promise<NextResponse> {
  const auth = await requireFullDiscoveryAccess(request, req.siteId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getAdminClient();

  // ----- Resolve runId -----
  let runId = req.runId;
  if (!runId) {
    const { data: latest } = await admin
      .from('discovery_score_snapshots')
      .select('run_id')
      .eq('site_id', req.siteId)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    runId = latest?.run_id || null;
  }
  if (!runId) {
    return NextResponse.json({ error: 'No run found for this site' }, { status: 404 });
  }

  // ----- Cache check -----
  if (!req.force) {
    const { data: snap } = await admin
      .from('discovery_score_snapshots')
      .select('id, report_html, report_narrative, report_generated_at, report_model, share_token')
      .eq('site_id', req.siteId)
      .eq('run_id', runId)
      .maybeSingle();

    if (snap?.report_html) {
      return respond(req.format, {
        html: snap.report_html as string,
        narrative: snap.report_narrative as ReportNarrative | null,
        model: (snap.report_model as string) || null,
        generated_at: (snap.report_generated_at as string) || null,
        cached: true,
        run_id: runId,
        snapshot_id: snap.id as string,
        share_token: (snap.share_token as string | null) || null,
      });
    }
  }

  // ----- Generate fresh -----
  // We reuse the export-report endpoint logic by calling it as an internal
  // fetch. This keeps it as the single source of truth for the payload
  // shape. We forward the auth cookies so its own requireFullDiscoveryAccess
  // check passes with the same user identity.
  const origin = request.nextUrl.origin;
  const exportUrl = `${origin}/api/discovery/export-report?siteId=${encodeURIComponent(req.siteId)}&runId=${encodeURIComponent(runId)}`;
  const exportRes = await fetch(exportUrl, {
    headers: {
      cookie: request.headers.get('cookie') || '',
    },
    cache: 'no-store',
  });

  if (!exportRes.ok) {
    const errBody = await exportRes.text().catch(() => '');
    return NextResponse.json({
      error: `Failed to fetch export payload: ${exportRes.status}`,
      detail: errBody.slice(0, 500),
    }, { status: 502 });
  }

  const payload = await exportRes.json() as ReportExportPayload;

  // Narrative generation (Claude call).
  let narrative: ReportNarrative;
  let model: string;
  try {
    const out = await generateReportNarrative(payload);
    narrative = out.narrative;
    model = out.model;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      error: 'Narrative generation failed',
      detail: msg,
    }, { status: 502 });
  }

  // Stamp template.
  const html = buildReportHtml(payload, narrative);
  const generatedAt = new Date().toISOString();

  // Persist on the snapshot. Select() returns the row so we get
  // snapshot_id (and any pre-existing share_token) without a second fetch.
  const { data: updatedSnap, error: updateErr } = await admin
    .from('discovery_score_snapshots')
    .update({
      report_html: html,
      report_narrative: narrative,
      report_generated_at: generatedAt,
      report_model: model,
    })
    .eq('site_id', req.siteId)
    .eq('run_id', runId)
    .select('id, share_token')
    .maybeSingle();

  if (updateErr) {
    // Don't fail the request — the report was generated successfully, just
    // couldn't be cached. Log and return uncached.
    console.error('[api/discovery/report] Failed to cache report:', updateErr.message);
  }

  return respond(req.format, {
    html,
    narrative,
    model,
    generated_at: generatedAt,
    cached: false,
    run_id: runId,
    snapshot_id: (updatedSnap?.id as string) || '',
    share_token: (updatedSnap?.share_token as string | null) || null,
  });
}

interface ResponseBundle {
  html: string;
  narrative: ReportNarrative | null;
  model: string | null;
  generated_at: string | null;
  cached: boolean;
  run_id: string;
  // Phase 2 share-link addition: returned so the viewer can wire the
  // share toggle without an extra round-trip.
  snapshot_id: string;
  share_token: string | null;
}

function respond(format: 'html' | 'json', bundle: ResponseBundle): NextResponse {
  if (format === 'html') {
    return new NextResponse(bundle.html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // Short cache so browser can revalidate but not stale
        'Cache-Control': 'private, max-age=60, must-revalidate',
      },
    });
  }
  return NextResponse.json(bundle);
}
