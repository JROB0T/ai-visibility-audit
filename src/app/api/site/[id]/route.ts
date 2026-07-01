import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { getDisplayPricing, formatDollars, getRescanPriceDollars } from '@/lib/pricing';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabase();

    // Fetch site
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('*')
      .eq('id', id)
      .single();

    if (siteError || !site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Fetch all audits for this site, ordered by date
    const { data: audits } = await supabase
      .from('audits')
      .select('id, status, overall_score, crawlability_score, machine_readability_score, commercial_clarity_score, trust_clarity_score, pages_scanned, summary, run_type, created_at, completed_at')
      .eq('site_id', id)
      .order('created_at', { ascending: false });

    // Get finding counts for the latest audit
    const latestAudit = audits?.[0];
    const latestFindings: { high: number; medium: number; low: number } = { high: 0, medium: 0, low: 0 };
    if (latestAudit) {
      const { data: findings } = await supabase
        .from('audit_findings')
        .select('severity')
        .eq('audit_id', latestAudit.id);
      if (findings) {
        latestFindings.high = findings.filter(f => f.severity === 'high').length;
        latestFindings.medium = findings.filter(f => f.severity === 'medium').length;
        latestFindings.low = findings.filter(f => f.severity === 'low').length;
      }
    }

    // Build trend data (score over time)
    const trendData = (audits || [])
      .filter(a => a.status === 'completed' && a.overall_score !== null)
      .reverse()
      .map(a => ({
        date: a.created_at,
        overall: a.overall_score,
        crawlability: a.crawlability_score,
        readability: a.machine_readability_score,
        commercial: a.commercial_clarity_score,
        trust: a.trust_clarity_score,
      }));

    // Single source of truth for the monthly price (env-driven via
    // src/lib/pricing.ts). Surfaced here as an additive field so the
    // client renders the same value /pricing shows instead of a
    // hardcoded number that can drift. Server-only env can't be read
    // from the client component, hence plumbing it through the response.
    const monthlyDollars = getDisplayPricing().tier_1.monthly;
    const rescanDollars = getRescanPriceDollars();

    // All snapshots for this site — powers per-month PDF downloads
    // in Scan History. Only include snapshots that actually have
    // report_html (empty ones can't produce a PDF and would give a
    // "Report not found" error if the button were rendered).
    const { data: snapRows } = await supabase
      .from('discovery_score_snapshots')
      .select('id, share_token, snapshot_date, report_html')
      .eq('site_id', id)
      .order('snapshot_date', { ascending: false });
    const snapshots = (snapRows || [])
      .filter(s => !!s.report_html)
      .map(s => ({
        id: s.id as string,
        snapshot_date: s.snapshot_date as string,
        share_token: (s.share_token as string | null) ?? null,
      }));
    // Latest snapshot's id + share_token — back-compat convenience
    // fields for existing UI that only cares about the newest one.
    const latest = snapshots[0];
    const shareToken = latest?.share_token ?? null;
    const snapshotId = latest?.id ?? null;

    return NextResponse.json({
      site,
      audits: audits || [],
      latestFindings,
      trendData,
      shareToken,
      snapshotId,
      snapshots,
      monthlyPrice: {
        dollars: monthlyDollars,
        formatted: formatDollars(monthlyDollars),
      },
      rescanPrice: {
        dollars: rescanDollars,
        formatted: formatDollars(rescanDollars),
      },
    });
  } catch (error) {
    console.error('Site API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const supabase = await createServerSupabase();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { data: site } = await supabase.from('sites').select('id, user_id').eq('id', id).single();
    if (!site || site.user_id !== user.id) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const validVerticals = ['saas', 'professional_services', 'local_service', 'ecommerce', 'healthcare', 'law_firm', 'restaurant', 'other'];
    const updateData: Record<string, string> = {};

    if (body.vertical && validVerticals.includes(body.vertical)) {
      updateData.vertical = body.vertical;
    }

    if (Object.keys(updateData).length > 0) {
      await supabase.from('sites').update(updateData).eq('id', id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Site PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
