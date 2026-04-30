// ============================================================
// /api/discovery/report/pdf
//
// POST → generate a PDF of the cached report HTML for a snapshot
// and return it as a binary download.
//
//   Body: { snapshotId }
//   Response: application/pdf binary stream with a Content-Disposition
//             header so the browser downloads it.
//
// Auth: same ownership check as the report fetch endpoint —
// requireFullDiscoveryAccess on the snapshot's site_id.
//
// Implementation:
//   1. Look up snapshot.report_html (must exist; 404 if null)
//   2. Launch chromium via puppeteer-core
//   3. setContent the HTML into a page
//   4. page.pdf() to generate the binary
//   5. Stream it back with proper headers
//
// IMPORTANT: CHROMIUM_REMOTE_URL must match the @sparticuz/chromium-min
// version pinned in package.json. If you bump that package, update the
// URL too.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireFullDiscoveryAccess } from '@/lib/discoveryAccess';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';

// PDF generation needs more time + memory than typical routes.
export const maxDuration = 60;
export const runtime = 'nodejs';

function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface PdfRequest {
  snapshotId?: string;
}

// Pinned to match @sparticuz/chromium-min ^131.0.0 in package.json.
// Update both together.
const CHROMIUM_REMOTE_URL =
  'https://github.com/Sparticuz/chromium/releases/download/v131.0.0/chromium-v131.0.0-pack.tar';

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: PdfRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.snapshotId) {
    return NextResponse.json({ error: 'snapshotId required' }, { status: 400 });
  }

  const admin = getAdminClient();

  const { data: snapshot, error: snapErr } = await admin
    .from('discovery_score_snapshots')
    .select('id, site_id, report_html, snapshot_date, sites(domain)')
    .eq('id', body.snapshotId)
    .maybeSingle();

  if (snapErr || !snapshot || !snapshot.report_html) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  const auth = await requireFullDiscoveryAccess(request, snapshot.site_id as string);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // Filename: <domain>-ai-visibility-<YYYY-MM-DD>.pdf
  const site = Array.isArray(snapshot.sites) ? snapshot.sites[0] : snapshot.sites;
  const domain = ((site as { domain?: string } | null)?.domain as string) || 'report';
  const dateStr = snapshot.snapshot_date
    ? new Date(snapshot.snapshot_date as string).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const filename = `${domain.replace(/[^a-z0-9.-]/gi, '-')}-ai-visibility-${dateStr}.pdf`;

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(CHROMIUM_REMOTE_URL),
      headless: true,
    });

    const page = await browser.newPage();

    // setContent with networkidle0 waits for fonts + images to settle.
    await page.setContent(snapshot.report_html as string, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    const pdfBuffer = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: {
        top: '0.5in',
        bottom: '0.5in',
        left: '0.5in',
        right: '0.5in',
      },
      preferCSSPageSize: false,
    });

    await browser.close();
    browser = null;

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffer.length.toString(),
        'Cache-Control': 'private, no-cache',
      },
    });
  } catch (err) {
    console.error('[PDF_GENERATION_ERROR]', {
      errorName: err instanceof Error ? err.name : 'UnknownError',
      errorMessage: err instanceof Error ? err.message : String(err),
      errorStack: err instanceof Error ? err.stack : undefined,
      snapshotId: body.snapshotId,
    });
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 });
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* swallow */
      }
    }
  }
}
