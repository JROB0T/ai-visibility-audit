// ============================================================
// GET /api/r/[token]/pdf
//
// Public PDF download for a shared report. Anyone with the share
// token can fetch the binary — same authorization model as the
// /r/[token] HTML viewer.
//
// Implementation mirrors /api/discovery/report/pdf:
//   1. Look up snapshot.report_html via share_token (404 if absent)
//   2. Launch chromium via puppeteer-core
//   3. setContent the HTML into a page
//   4. page.pdf() to generate the binary
//   5. Stream it back with proper headers + filename
//
// No rate limiting on this route — the share token is the access
// gate. If abuse becomes an issue later, drop it behind the same
// IP rate-limit helper used by /api/free-scan/request.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { looksLikeShareToken } from '@/lib/shareTokens';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';

// PDF generation needs the same time + memory budget as the
// authenticated counterpart.
export const maxDuration = 60;
export const runtime = 'nodejs';

function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Keep this URL in lockstep with the @sparticuz/chromium-min version
// pinned in package.json — mismatch causes "executable not found"
// errors at runtime.
const CHROMIUM_REMOTE_URL =
  'https://github.com/Sparticuz/chromium/releases/download/v133.0.0/chromium-v133.0.0-pack.tar';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  if (!looksLikeShareToken(token)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const admin = getAdminClient();

  const { data: snapshot, error } = await admin
    .from('discovery_score_snapshots')
    .select('id, site_id, snapshot_date, report_html, sites(domain)')
    .eq('share_token', token)
    .maybeSingle();

  if (error || !snapshot || !snapshot.report_html) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Build the download filename from domain + date so saved PDFs are
  // self-describing in the recipient's downloads folder.
  const site = Array.isArray(snapshot.sites) ? snapshot.sites[0] : snapshot.sites;
  const domain = ((site as { domain?: string } | null)?.domain as string) || 'report';
  const dateStr = snapshot.snapshot_date
    ? new Date(snapshot.snapshot_date as string).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const filename = `${domain.replace(/[^a-z0-9.-]/gi, '-')}-ai-visibility-${dateStr}.pdf`;

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    // Cold-start race: @sparticuz/chromium-min downloads the binary on
    // first invocation per Lambda instance. The first launch sometimes
    // fails with "executable not found" or socket-timeout before the
    // download settles. A single quick retry clears this without
    // adding meaningful latency on the happy path.
    const launchBrowser = async () => puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(CHROMIUM_REMOTE_URL),
      headless: true,
    });
    try {
      browser = await launchBrowser();
    } catch (launchErr) {
      console.warn('[PUBLIC_PDF] chromium launch retry:', launchErr instanceof Error ? launchErr.message : launchErr);
      await new Promise(r => setTimeout(r, 500));
      browser = await launchBrowser();
    }

    const page = await browser.newPage();

    // networkidle0 waits for fonts + images to settle so embedded
    // Google Fonts render in the PDF rather than falling back.
    await page.setContent(snapshot.report_html as string, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    const pdfBuffer = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '0.5in', bottom: '0.5in', left: '0.5in', right: '0.5in' },
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
        // Public link — but PDFs are heavy; let proxies cache for a
        // short window so reload-spam doesn't re-render chromium.
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (err) {
    console.error('[PUBLIC_PDF_ERROR]', {
      errorName: err instanceof Error ? err.name : 'UnknownError',
      errorMessage: err instanceof Error ? err.message : String(err),
      errorStack: err instanceof Error ? err.stack : undefined,
      token,
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
