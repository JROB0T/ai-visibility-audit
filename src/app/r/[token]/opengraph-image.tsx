// ============================================================
// OG image for /r/[token] — when a share link is pasted into
// Slack, LinkedIn, iMessage, or email clients, it unfurls as a
// branded score card instead of a bare URL. This is the surface
// the cold-outreach funnel lives on, so it matters.
//
// Built with next/og ImageResponse (bundled with Next, no new
// dependency, default Inter font). If the snapshot lookup fails
// for any reason we render a generic Aivascan brand card rather than
// erroring — a link preview should never 500.
// ============================================================

import { ImageResponse } from 'next/og';
import { createClient } from '@supabase/supabase-js';
import { looksLikeShareToken } from '@/lib/shareTokens';

export const alt = 'AI Visibility Report — Aivascan';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

function scoreColor(score: number): string {
  if (score >= 70) return '#10B981';
  if (score >= 50) return '#F59E0B';
  return '#EF4444';
}

async function loadSnapshot(token: string): Promise<{
  score: number;
  domain: string;
  strong: number;
  total: number;
  dateLabel: string;
} | null> {
  try {
    if (!looksLikeShareToken(token)) return null;
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data, error } = await admin
      .from('discovery_score_snapshots')
      .select('overall_score, strong_count, prompt_count, snapshot_date, sites(domain)')
      .eq('share_token', token)
      .maybeSingle();
    if (error || !data || data.overall_score == null) return null;
    const site = Array.isArray(data.sites) ? data.sites[0] : data.sites;
    return {
      score: Math.max(0, Math.min(100, Math.round(data.overall_score))),
      domain: ((site as { domain?: string } | null)?.domain as string) || 'Your business',
      strong: data.strong_count ?? 0,
      total: data.prompt_count ?? 0,
      dateLabel: data.snapshot_date
        ? new Date(data.snapshot_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        : '',
    };
  } catch {
    return null;
  }
}

export default async function OgImage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const snap = await loadSnapshot(token);

  // Ring geometry: r=120 → circumference ≈ 753.98
  const score = snap?.score ?? null;
  const color = score != null ? scoreColor(score) : '#6366F1';
  const dash = score != null ? (753.98 * score) / 100 : 753.98 * 0.72;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          background: 'linear-gradient(135deg, #0F172A 0%, #1E1B4B 100%)',
          padding: '80px',
        }}
      >
        {/* Score ring */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: 300, height: 300 }}>
          <svg width="300" height="300" viewBox="0 0 300 300">
            <circle cx="150" cy="150" r="120" fill="none" stroke="#1E293B" strokeWidth="22" />
            <circle
              cx="150" cy="150" r="120" fill="none"
              stroke={color} strokeWidth="22" strokeLinecap="round"
              strokeDasharray={`${dash} 753.98`}
              transform="rotate(-90 150 150)"
            />
          </svg>
          <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ display: 'flex', fontSize: 96, fontWeight: 800, color: 'white', lineHeight: 1 }}>
              {score != null ? score : 'AI'}
            </div>
            <div style={{ display: 'flex', fontSize: 28, color: '#64748B' }}>{score != null ? '/ 100' : ''}</div>
          </div>
        </div>

        {/* Copy block */}
        <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 80, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 26, fontWeight: 700, color: '#818CF8', letterSpacing: 2 }}>
            Aivascan · AI VISIBILITY REPORT
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: snap && snap.domain.length > 24 ? 48 : 64,
              fontWeight: 800,
              color: 'white',
              marginTop: 24,
              lineHeight: 1.1,
            }}
          >
            {snap ? snap.domain : 'See how AI sees your business'}
          </div>
          <div style={{ display: 'flex', fontSize: 30, color: '#94A3B8', marginTop: 28, lineHeight: 1.4 }}>
            {snap
              ? `Recommended by AI in ${snap.strong} of ${snap.total} buyer questions${snap.dateLabel ? ` · ${snap.dateLabel}` : ''}`
              : 'How ChatGPT, Claude, Perplexity & Gemini answer buyer questions about you'}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginTop: 48,
              fontSize: 26,
              fontWeight: 700,
              color: '#0F172A',
              background: '#818CF8',
              borderRadius: 16,
              padding: '18px 36px',
              alignSelf: 'flex-start',
            }}
          >
            View the full report
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
