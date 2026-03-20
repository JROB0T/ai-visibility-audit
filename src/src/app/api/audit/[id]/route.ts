import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabase();

    // Fetch audit with site info
    const { data: audit, error: auditError } = await supabase
      .from('audits')
      .select('*, site:sites(*)')
      .eq('id', id)
      .single();

    if (auditError || !audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }

    // Fetch pages
    const { data: pages } = await supabase
      .from('audit_pages')
      .select('*')
      .eq('audit_id', id)
      .order('page_type');

    // Fetch findings
    const { data: findings } = await supabase
      .from('audit_findings')
      .select('*')
      .eq('audit_id', id)
      .order('severity');

    // Fetch recommendations
    const { data: recommendations } = await supabase
      .from('audit_recommendations')
      .select('*')
      .eq('audit_id', id)
      .order('priority_order');

    return NextResponse.json({
      audit,
      pages: pages || [],
      findings: findings || [],
      recommendations: recommendations || [],
    });
  } catch (error) {
    console.error('Fetch audit error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Claim an anonymous audit after user signs up
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { userId } = await request.json();
    const supabase = await createServerSupabase();

    // Only claim audits that have no user
    await supabase
      .from('audits')
      .update({ user_id: userId })
      .eq('id', id)
      .is('user_id', null);

    // Also claim the site
    const { data: audit } = await supabase
      .from('audits')
      .select('site_id')
      .eq('id', id)
      .single();

    if (audit) {
      await supabase
        .from('sites')
        .update({ user_id: userId })
        .eq('id', audit.site_id)
        .is('user_id', null);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Claim audit error:', error);
    return NextResponse.json({ error: 'Failed to claim audit' }, { status: 500 });
  }
}
