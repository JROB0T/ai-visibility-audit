import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { isAdminAccount } from '@/lib/entitlements';
import {
  ensureDiscoveryProfileAndPrompts,
  BootstrapError,
} from '@/lib/discoveryBootstrap';

export const maxDuration = 60;

function statusForBootstrapError(code: BootstrapError['code']): number {
  switch (code) {
    case 'site_not_found':
    case 'no_audit':
      return 404;
    case 'missing_api_key':
    case 'claude_failed':
    case 'claude_parse_failed':
    case 'no_prompts_generated':
    case 'profile_insert_failed':
    case 'prompt_insert_failed':
      return 500;
    default:
      return 500;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const siteId = typeof body.siteId === 'string' ? body.siteId : null;
  const auditIdInput = typeof body.auditId === 'string' ? body.auditId : null;
  const force = body.force === true;
  if (!siteId) {
    return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
  }

  // Auth + ownership (user-scoped client)
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const isAdmin = isAdminAccount(user.email);

  const { data: site, error: siteErr } = await supabase
    .from('sites')
    .select('id, user_id')
    .eq('id', siteId)
    .maybeSingle();
  if (siteErr || !site) {
    return NextResponse.json({ error: 'Site not found' }, { status: 404 });
  }
  if (!isAdmin && site.user_id !== user.id) {
    return NextResponse.json({ error: 'Not authorized for this site' }, { status: 403 });
  }

  try {
    const result = await ensureDiscoveryProfileAndPrompts({
      siteId,
      auditId: auditIdInput ?? undefined,
      force,
    });
    return NextResponse.json({
      profile: result.profile,
      prompts: result.prompts,
      generated: result.generated,
      count: result.prompts.length,
    });
  } catch (err) {
    if (err instanceof BootstrapError) {
      return NextResponse.json({ error: err.message }, { status: statusForBootstrapError(err.code) });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[discovery/generate-prompts] unexpected error:', msg);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
