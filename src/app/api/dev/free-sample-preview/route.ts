// ============================================================
// GET /api/dev/free-sample-preview
//
// Renders the free-tier 2-page sample with a hardcoded mock payload.
// No DB reads, no Anthropic calls, no row creation. Pure template
// preview for design iteration.
//
// Auth: gated on ADMIN_TRIGGER_TOKEN. Pass via ?token=<value> so the
// URL is bookmarkable. Without a valid token the route 404s — that
// keeps it indistinguishable from a non-existent route to anyone
// without the secret.
//
// Query params (all optional, all override the mock fixture):
//   ?token=<ADMIN_TRIGGER_TOKEN>   required
//   &score=72                      overall_score (0-100)
//   &domain=example.com            displayed domain
//   &name=Acme+Coffee              business_name
//
// Examples:
//   /api/dev/free-sample-preview?token=...
//   /api/dev/free-sample-preview?token=...&score=28&name=Sunset+HVAC
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { buildFreeSampleHtml } from '@/lib/reportTemplate';
import type { ReportExportPayload, ClusterKey } from '@/lib/reportNarrative';

export const maxDuration = 10;

function authorized(request: NextRequest): boolean {
  const expected = process.env.ADMIN_TRIGGER_TOKEN;
  if (!expected || expected.length < 8) return false;
  const token = request.nextUrl.searchParams.get('token');
  return token === expected;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const params = request.nextUrl.searchParams;
  const score = clampInt(params.get('score'), 0, 100, 47);
  const domain = (params.get('domain') || 'sunsethvac.com').toLowerCase().trim();
  const name = (params.get('name') || 'Sunset HVAC').trim();

  // Mock cluster scores — chosen to exercise all three heatmap states
  // (strong/medium/weak) plus one "not measured" cell so visual review
  // catches issues in any cell type.
  const clusterScores: Record<ClusterKey, number | null> = {
    core: clamp(score + 18, 0, 100),     // typically strongest
    problem: clamp(score - 4, 0, 100),
    comparison: clamp(score - 22, 0, 100),
    long_tail: clamp(score - 8, 0, 100),
    brand: clamp(score + 25, 0, 100),
    adjacent: null,                       // 'not measured' state
  };

  const payload = buildMockPayload({ score, domain, name, clusterScores });
  const html = buildFreeSampleHtml(payload);

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // No caching — the whole point is fast iteration after redeploys.
      'Cache-Control': 'no-store',
    },
  });
}

// ------------------------------------------------------------
// Mock payload — realistic enough to spot layout problems
// ------------------------------------------------------------

function buildMockPayload(input: {
  score: number;
  domain: string;
  name: string;
  clusterScores: Record<ClusterKey, number | null>;
}): ReportExportPayload {
  const { score, domain, name, clusterScores } = input;
  const promptCount = 6;
  const strongCount = score >= 70 ? 3 : score >= 40 ? 2 : 0;
  const partialCount = score >= 40 ? 2 : 1;
  const absentCount = promptCount - strongCount - partialCount;

  return {
    meta: {
      site_id: 'mock-site',
      run_id: 'mock-run',
      business_name: name,
      domain,
      primary_category: 'hvac',
      service_area: 'Belford NJ and Central New Jersey',
      tier: 'full',
      snapshot_date: new Date().toISOString(),
      report_generated_at: new Date().toISOString(),
      prompt_count: promptCount,
    },
    scores: {
      overall_score: score,
      overall_grade: gradeFor(score),
      cluster_scores: clusterScores,
      visibility_distribution: {},
      counts: {
        prompt_count: promptCount,
        strong_count: strongCount,
        partial_count: partialCount,
        absent_count: absentCount,
        competitor_dominant_count: Math.max(absentCount - 1, 0),
      },
    },
    prompts_tested: [
      {
        id: 'mock-prompt-1',
        prompt_text: `Best ${name.toLowerCase().includes('hvac') ? 'HVAC contractors' : 'options'} near Belford NJ for emergency repair`,
        cluster: 'comparison',
        priority: 'high',
        score: 12,
        visibility_status: 'absent',
        business_position_type: 'not_present',
        business_mentioned: false,
        business_cited: false,
        result_type_summary: 'editorial comparison',
        normalized_response_summary: null,
        raw_response_excerpt:
          'For emergency HVAC repair in Belford NJ, the most frequently recommended options are AirPro Heating & Cooling, Garden State HVAC, and Monmouth Mechanical. AirPro is typically named first because of their 24-hour dispatch and strong review history. Garden State is often called out as the budget pick for straightforward repairs.',
        competitor_names_detected: ['AirPro Heating & Cooling', 'Garden State HVAC', 'Monmouth Mechanical'],
        competitor_domains_detected: ['airprohvac.com'],
        directories_detected: [],
        marketplaces_detected: [],
        confidence_score: 0.9,
      },
      {
        id: 'mock-prompt-2',
        prompt_text: 'Who installs heat pumps in Monmouth County',
        cluster: 'core',
        priority: 'high',
        score: 75,
        visibility_status: 'partial_presence',
        business_position_type: 'listed_among_options',
        business_mentioned: true,
        business_cited: true,
        result_type_summary: 'local recommendation',
        normalized_response_summary: null,
        raw_response_excerpt: `Several Monmouth County contractors install heat pumps, including ${name}, AirPro, and Garden State HVAC.`,
        competitor_names_detected: ['AirPro', 'Garden State HVAC'],
        competitor_domains_detected: [],
        directories_detected: [],
        marketplaces_detected: [],
        confidence_score: 0.85,
      },
    ],
    competitors: [],
    insights: [],
    recommendations: [],
    trend: {
      available: false,
      snapshots_count: 1,
      history: [],
      overall_change_from_first: null,
      overall_change_from_previous: null,
      cluster_changes_from_previous: null,
    },
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function clampInt(raw: string | null, lo: number, hi: number, fallback: number): number {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return clamp(n, lo, hi);
}

function gradeFor(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'A-';
  if (score >= 70) return 'B';
  if (score >= 60) return 'B-';
  if (score >= 50) return 'C';
  if (score >= 40) return 'C-';
  if (score >= 30) return 'D';
  return 'F';
}
