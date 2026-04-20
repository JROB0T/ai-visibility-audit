import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';
import { isAdminAccount } from '@/lib/entitlements';

export const maxDuration = 30;

const MAX_COMPETITORS_PER_SITE = 10;

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Verify the caller is authenticated and either an admin or the owner of the site.
 * Returns { ok: true, userId, isAdmin } on success, or an error response on failure.
 */
async function authorizeSiteAccess(siteId: string): Promise<
  | { ok: true; userId: string; isAdmin: boolean }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) };
  }
  const isAdmin = isAdminAccount(user.email);
  if (isAdmin) return { ok: true, userId: user.id, isAdmin: true };

  const { data: site, error: siteErr } = await supabase
    .from('sites')
    .select('id, user_id')
    .eq('id', siteId)
    .maybeSingle();
  if (siteErr || !site) {
    return { ok: false, response: NextResponse.json({ error: 'Site not found' }, { status: 404 }) };
  }
  if (site.user_id !== user.id) {
    return { ok: false, response: NextResponse.json({ error: 'Not authorized for this site' }, { status: 403 }) };
  }
  return { ok: true, userId: user.id, isAdmin: false };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const siteId = request.nextUrl.searchParams.get('siteId');
  if (!siteId) {
    return NextResponse.json({ error: 'siteId query param required' }, { status: 400 });
  }
  const auth = await authorizeSiteAccess(siteId);
  if (!auth.ok) return auth.response;

  const admin = getAdminClient();
  const { data, error } = await admin
    .from('discovery_competitors')
    .select('*')
    .eq('site_id', siteId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[discovery/competitors GET] error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch competitors' }, { status: 500 });
  }
  return NextResponse.json({ competitors: data || [] });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const siteId = typeof body.siteId === 'string' ? body.siteId : null;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!siteId || !name) {
    return NextResponse.json({ error: 'siteId and name are required' }, { status: 400 });
  }
  const auth = await authorizeSiteAccess(siteId);
  if (!auth.ok) return auth.response;

  const admin = getAdminClient();

  // Enforce max competitors per site
  const { count, error: countErr } = await admin
    .from('discovery_competitors')
    .select('id', { count: 'exact', head: true })
    .eq('site_id', siteId);
  if (countErr) {
    console.error('[discovery/competitors POST] count error:', countErr.message);
    return NextResponse.json({ error: 'Failed to check competitor count' }, { status: 500 });
  }
  if ((count || 0) >= MAX_COMPETITORS_PER_SITE) {
    return NextResponse.json({ error: `Maximum ${MAX_COMPETITORS_PER_SITE} competitors per site` }, { status: 400 });
  }

  const insertRow = {
    site_id: siteId,
    name,
    domain: typeof body.domain === 'string' ? body.domain.trim() || null : null,
    location: typeof body.location === 'string' ? body.location.trim() || null : null,
    category: typeof body.category === 'string' ? body.category.trim() || null : null,
    source: 'manual' as const,
  };
  const { data, error } = await admin
    .from('discovery_competitors')
    .insert(insertRow)
    .select()
    .single();
  if (error) {
    console.error('[discovery/competitors POST] insert error:', error.message);
    return NextResponse.json({ error: 'Failed to create competitor' }, { status: 500 });
  }
  return NextResponse.json({ competitor: data });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const id = typeof body.id === 'string' ? body.id : null;
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const admin = getAdminClient();
  const { data: existing, error: findErr } = await admin
    .from('discovery_competitors')
    .select('id, site_id')
    .eq('id', id)
    .maybeSingle();
  if (findErr || !existing) {
    return NextResponse.json({ error: 'Competitor not found' }, { status: 404 });
  }
  const auth = await authorizeSiteAccess(existing.site_id);
  if (!auth.ok) return auth.response;

  const updates: Record<string, unknown> = {};
  if (typeof body.name === 'string') updates.name = body.name.trim();
  if ('domain' in body) updates.domain = typeof body.domain === 'string' ? body.domain.trim() || null : null;
  if ('location' in body) updates.location = typeof body.location === 'string' ? body.location.trim() || null : null;
  if ('category' in body) updates.category = typeof body.category === 'string' ? body.category.trim() || null : null;
  if (typeof body.active === 'boolean') updates.active = body.active;
  updates.updated_at = new Date().toISOString();

  const { data, error } = await admin
    .from('discovery_competitors')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('[discovery/competitors PATCH] error:', error.message);
    return NextResponse.json({ error: 'Failed to update competitor' }, { status: 500 });
  }
  return NextResponse.json({ competitor: data });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id query param required' }, { status: 400 });
  }
  const admin = getAdminClient();
  const { data: existing, error: findErr } = await admin
    .from('discovery_competitors')
    .select('id, site_id')
    .eq('id', id)
    .maybeSingle();
  if (findErr || !existing) {
    return NextResponse.json({ error: 'Competitor not found' }, { status: 404 });
  }
  const auth = await authorizeSiteAccess(existing.site_id);
  if (!auth.ok) return auth.response;

  const { error } = await admin
    .from('discovery_competitors')
    .delete()
    .eq('id', id);
  if (error) {
    console.error('[discovery/competitors DELETE] error:', error.message);
    return NextResponse.json({ error: 'Failed to delete competitor' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
