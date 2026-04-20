import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';
import { isAdminAccount } from '@/lib/entitlements';
import { inferCompetitors } from '@/lib/competitorInference';

export const maxDuration = 60;

const MAX_INFERRED = 5;

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const siteId = typeof body.siteId === 'string' ? body.siteId : null;
  if (!siteId) {
    return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
  }

  // Auth + ownership
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const isAdmin = isAdminAccount(user.email);

  // Load the site (needed for domain + ownership check)
  const { data: site, error: siteErr } = await supabase
    .from('sites')
    .select('id, user_id, domain, vertical')
    .eq('id', siteId)
    .maybeSingle();
  if (siteErr || !site) {
    return NextResponse.json({ error: 'Site not found' }, { status: 404 });
  }
  if (!isAdmin && site.user_id !== user.id) {
    return NextResponse.json({ error: 'Not authorized for this site' }, { status: 403 });
  }

  const admin = getAdminClient();

  // Pull most recent completed audit to get h1/metaDescription/pageTypes
  const { data: recentAudit } = await admin
    .from('audits')
    .select('id')
    .eq('site_id', siteId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let h1: string | null = null;
  let metaDescription: string | null = null;
  let pageTypes: string[] = [];
  if (recentAudit?.id) {
    const { data: pages } = await admin
      .from('audit_pages')
      .select('page_type, h1_text, meta_description')
      .eq('audit_id', recentAudit.id);
    if (pages && pages.length > 0) {
      const homepage = pages.find(p => p.page_type === 'homepage') || pages[0];
      h1 = homepage?.h1_text || null;
      metaDescription = homepage?.meta_description || null;
      pageTypes = Array.from(new Set(pages.map(p => p.page_type).filter(Boolean) as string[]));
    }
  }

  // Call shared inference helper
  const estimates = await inferCompetitors({
    domain: site.domain,
    businessType: site.vertical || 'other',
    h1,
    metaDescription,
    pageTypes,
    count: MAX_INFERRED,
  });

  // Load existing competitors to dedupe by domain (case-insensitive)
  const { data: existing } = await admin
    .from('discovery_competitors')
    .select('domain')
    .eq('site_id', siteId);
  const existingDomains = new Set(
    (existing || [])
      .map(c => (c.domain || '').toLowerCase())
      .filter(d => d.length > 0)
  );

  const toInsert = estimates
    .filter(e => e.domain && !existingDomains.has(e.domain.toLowerCase()))
    .slice(0, MAX_INFERRED)
    .map(e => ({
      site_id: siteId,
      name: e.domain,
      domain: e.domain,
      location: null,
      category: null,
      source: 'growth_strategy' as const,
    }));

  let inserted: Record<string, unknown>[] = [];
  if (toInsert.length > 0) {
    const { data, error } = await admin
      .from('discovery_competitors')
      .insert(toInsert)
      .select();
    if (error) {
      console.error('[discovery/competitors/infer] insert error:', error.message);
      return NextResponse.json({ error: 'Failed to insert inferred competitors' }, { status: 500 });
    }
    inserted = data || [];
  }

  // Return full current list for the site
  const { data: all } = await admin
    .from('discovery_competitors')
    .select('*')
    .eq('site_id', siteId)
    .order('created_at', { ascending: true });

  return NextResponse.json({
    competitors: all || [],
    inferredCount: inserted.length,
  });
}
