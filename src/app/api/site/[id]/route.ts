import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

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
      .select('id, status, overall_score, crawlability_score, machine_readability_score, commercial_clarity_score, trust_clarity_score, pages_scanned, summary, created_at, completed_at')
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

    return NextResponse.json({
      site,
      audits: audits || [],
      latestFindings,
      trendData,
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

    const validVerticals = ['saas', 'professional_services', 'local_service', 'ecommerce', 'healthcare', 'law_firm', 'other'];
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
