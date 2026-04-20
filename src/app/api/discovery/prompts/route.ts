import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';
import { isAdminAccount } from '@/lib/entitlements';
import type { DiscoveryCluster, DiscoveryPriority } from '@/lib/types';

export const maxDuration = 30;

const VALID_CLUSTERS: DiscoveryCluster[] = ['core', 'problem', 'comparison', 'long_tail', 'brand', 'adjacent'];
const VALID_PRIORITIES: DiscoveryPriority[] = ['high', 'medium', 'low'];

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

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

  const { data: site, error } = await supabase
    .from('sites')
    .select('id, user_id')
    .eq('id', siteId)
    .maybeSingle();
  if (error || !site) {
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
    .from('discovery_prompts')
    .select('*')
    .eq('site_id', siteId)
    .order('cluster', { ascending: true })
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[discovery/prompts GET] error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch prompts' }, { status: 500 });
  }
  return NextResponse.json({ prompts: data || [] });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const siteId = typeof body.siteId === 'string' ? body.siteId : null;
  const promptText = typeof body.prompt_text === 'string' ? body.prompt_text.trim() : '';
  const cluster = typeof body.cluster === 'string' ? body.cluster : '';
  if (!siteId || !promptText || !cluster) {
    return NextResponse.json({ error: 'siteId, prompt_text, and cluster are required' }, { status: 400 });
  }
  if (!VALID_CLUSTERS.includes(cluster as DiscoveryCluster)) {
    return NextResponse.json({ error: 'Invalid cluster value' }, { status: 400 });
  }
  const priority = typeof body.priority === 'string' && VALID_PRIORITIES.includes(body.priority as DiscoveryPriority)
    ? body.priority
    : 'medium';

  const auth = await authorizeSiteAccess(siteId);
  if (!auth.ok) return auth.response;

  const admin = getAdminClient();
  const insertRow = {
    site_id: siteId,
    prompt_text: promptText,
    cluster,
    priority,
    service_line_tag: typeof body.service_line_tag === 'string' ? body.service_line_tag.trim() || null : null,
    importance_tag: typeof body.importance_tag === 'string' ? body.importance_tag.trim() || null : null,
    notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
    source: 'custom' as const,
    active: true,
  };
  const { data, error } = await admin
    .from('discovery_prompts')
    .insert(insertRow)
    .select()
    .single();
  if (error) {
    console.error('[discovery/prompts POST] error:', error.message);
    return NextResponse.json({ error: 'Failed to create prompt' }, { status: 500 });
  }
  return NextResponse.json({ prompt: data });
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
    .from('discovery_prompts')
    .select('id, site_id, source')
    .eq('id', id)
    .maybeSingle();
  if (findErr || !existing) {
    return NextResponse.json({ error: 'Prompt not found' }, { status: 404 });
  }
  const auth = await authorizeSiteAccess(existing.site_id);
  if (!auth.ok) return auth.response;

  const updates: Record<string, unknown> = {};
  if (typeof body.prompt_text === 'string') {
    updates.prompt_text = body.prompt_text.trim();
    // If the user edited a generated prompt, mark it as edited to preserve
    // the distinction from pure 'generated' prompts on next regeneration.
    if (existing.source === 'generated') updates.source = 'edited';
  }
  if (typeof body.priority === 'string' && VALID_PRIORITIES.includes(body.priority as DiscoveryPriority)) {
    updates.priority = body.priority;
  }
  if (typeof body.active === 'boolean') updates.active = body.active;
  if ('notes' in body) updates.notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;
  if ('service_line_tag' in body) updates.service_line_tag = typeof body.service_line_tag === 'string' ? body.service_line_tag.trim() || null : null;
  if ('importance_tag' in body) updates.importance_tag = typeof body.importance_tag === 'string' ? body.importance_tag.trim() || null : null;
  updates.updated_at = new Date().toISOString();

  const { data, error } = await admin
    .from('discovery_prompts')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('[discovery/prompts PATCH] error:', error.message);
    return NextResponse.json({ error: 'Failed to update prompt' }, { status: 500 });
  }
  return NextResponse.json({ prompt: data });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id query param required' }, { status: 400 });
  }
  const admin = getAdminClient();
  const { data: existing, error: findErr } = await admin
    .from('discovery_prompts')
    .select('id, site_id')
    .eq('id', id)
    .maybeSingle();
  if (findErr || !existing) {
    return NextResponse.json({ error: 'Prompt not found' }, { status: 404 });
  }
  const auth = await authorizeSiteAccess(existing.site_id);
  if (!auth.ok) return auth.response;

  // Soft delete: set active=false
  const { data, error } = await admin
    .from('discovery_prompts')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('[discovery/prompts DELETE] error:', error.message);
    return NextResponse.json({ error: 'Failed to soft-delete prompt' }, { status: 500 });
  }
  return NextResponse.json({ success: true, prompt: data });
}
