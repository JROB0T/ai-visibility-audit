// ============================================================
// /api/badge/[token] — live embeddable AI Visibility Score badge.
//
// GET → SVG. No auth; the share token is the auth, same model as
// /api/r/[token]. Businesses embed this on their own sites:
//
//   <a href="{APP}/r/TOKEN"><img src="{APP}/api/badge/TOKEN" /></a>
//
// Growth loop: every embedded badge is an Aivascan ad with a link back
// to a live report. The badge always reflects the snapshot's
// current stored score, so monthly reruns keep it fresh without
// the customer touching their site.
//
// ?style=compact (default, 220×48 pill) | card (260×120).
// Score colors match the app: ≥70 green, ≥50 amber, else red.
//
// Failure behavior: invalid/unknown token → 404 JSON (a broken
// image is the correct signal for a revoked share). DB *errors*
// (as opposed to not-found) → 503 with no-store so a transient
// outage never gets cached as a dead badge.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { looksLikeShareToken } from '@/lib/shareTokens';

export const maxDuration = 10;

function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function scoreColor(score: number): string {
  if (score >= 70) return '#10B981';
  if (score >= 50) return '#F59E0B';
  return '#EF4444';
}

function compactBadge(score: number, domain: string): string {
  const color = scoreColor(score);
  const label = domain.length > 22 ? `${domain.slice(0, 21)}…` : domain;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="48" viewBox="0 0 220 48" role="img" aria-label="AI Visibility Score ${score} out of 100">
  <rect width="220" height="48" rx="10" fill="#0F172A"/>
  <rect x="0.5" y="0.5" width="219" height="47" rx="9.5" fill="none" stroke="#1E293B"/>
  <circle cx="24" cy="24" r="14" fill="none" stroke="#1E293B" stroke-width="3"/>
  <circle cx="24" cy="24" r="14" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"
    stroke-dasharray="${(87.96 * score) / 100} 87.96" transform="rotate(-90 24 24)"/>
  <text x="24" y="28" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="11" font-weight="700" fill="#FFFFFF">${score}</text>
  <text x="46" y="20" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="10" font-weight="600" fill="#94A3B8" letter-spacing="0.4">AI VISIBILITY SCORE</text>
  <text x="46" y="35" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="11" fill="#E2E8F0">${esc(label)}</text>
  <!-- AIVA mark, scaled to 14px from its 512×512 viewBox (factor 14/512 ≈ 0.02734) -->
  <g transform="translate(174 17) scale(0.02734)" opacity="0.95">
    <path d="M 178 372 L 256 152 L 334 372" fill="none" stroke="#6366F1" stroke-width="60" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M 219.6 304 L 292.4 304" fill="none" stroke="#6366F1" stroke-width="60" stroke-linecap="round"/>
    <circle cx="256" cy="264" r="188" fill="none" stroke="#6366F1" stroke-width="28" stroke-linecap="round" opacity="0.55" stroke-dasharray="897.7 285.7" transform="rotate(-90 256 264)"/>
  </g>
  <text x="212" y="35" text-anchor="end" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="9" font-weight="700" fill="#6366F1">Aivascan</text>
</svg>`;
}

function cardBadge(score: number, domain: string, dateLabel: string): string {
  const color = scoreColor(score);
  const label = domain.length > 26 ? `${domain.slice(0, 25)}…` : domain;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="120" viewBox="0 0 260 120" role="img" aria-label="AI Visibility Score ${score} out of 100">
  <rect width="260" height="120" rx="14" fill="#0F172A"/>
  <rect x="0.5" y="0.5" width="259" height="119" rx="13.5" fill="none" stroke="#1E293B"/>
  <circle cx="58" cy="60" r="34" fill="none" stroke="#1E293B" stroke-width="6"/>
  <circle cx="58" cy="60" r="34" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round"
    stroke-dasharray="${(213.6 * score) / 100} 213.6" transform="rotate(-90 58 60)"/>
  <text x="58" y="63" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="24" font-weight="800" fill="#FFFFFF">${score}</text>
  <text x="58" y="77" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="9" fill="#64748B">/ 100</text>
  <text x="110" y="40" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="10" font-weight="600" fill="#94A3B8" letter-spacing="0.5">AI VISIBILITY SCORE</text>
  <text x="110" y="60" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="13" font-weight="600" fill="#FFFFFF">${esc(label)}</text>
  <text x="110" y="78" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="9" fill="#64748B">${esc(dateLabel)}</text>
  <!-- AIVA mark, 14px next to the verified line -->
  <g transform="translate(110 90) scale(0.02734)" opacity="0.95">
    <path d="M 178 372 L 256 152 L 334 372" fill="none" stroke="#6366F1" stroke-width="60" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M 219.6 304 L 292.4 304" fill="none" stroke="#6366F1" stroke-width="60" stroke-linecap="round"/>
    <circle cx="256" cy="264" r="188" fill="none" stroke="#6366F1" stroke-width="28" stroke-linecap="round" opacity="0.55" stroke-dasharray="897.7 285.7" transform="rotate(-90 256 264)"/>
  </g>
  <text x="128" y="100" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="10" font-weight="700" fill="#6366F1">Verified by Aivascan</text>
</svg>`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse | Response> {
  const { token } = await params;

  if (!looksLikeShareToken(token)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let snapshot: {
    overall_score: number | null;
    snapshot_date: string | null;
    sites: unknown;
  } | null = null;
  try {
    const admin = getAdminClient();
    const { data, error } = await admin
      .from('discovery_score_snapshots')
      .select('overall_score, snapshot_date, sites(domain)')
      .eq('share_token', token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    snapshot = data;
  } catch {
    // Transient DB failure — don't let CDNs cache a dead badge.
    return NextResponse.json(
      { error: 'Temporarily unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (!snapshot || snapshot.overall_score == null) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const site = Array.isArray(snapshot.sites) ? snapshot.sites[0] : snapshot.sites;
  const domain = ((site as { domain?: string } | null)?.domain as string) || 'Verified business';
  const score = Math.max(0, Math.min(100, Math.round(snapshot.overall_score)));
  const dateLabel = snapshot.snapshot_date
    ? `Scanned ${new Date(snapshot.snapshot_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
    : 'Live score';

  const style = request.nextUrl.searchParams.get('style');
  const svg = style === 'card' ? cardBadge(score, domain, dateLabel) : compactBadge(score, domain);

  return new Response(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      // 1h fresh, a day of stale-while-revalidate: monthly reruns
      // propagate within the hour without hammering the DB.
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
