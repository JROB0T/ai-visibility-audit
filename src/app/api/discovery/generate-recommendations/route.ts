import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';
import { isAdminAccount } from '@/lib/entitlements';
import { detectInsightSignals } from '@/lib/discoveryInsights';
import {
  draftRecommendations,
  persistRecommendations,
  polishRecommendationsWithClaude,
} from '@/lib/discoveryRecommendations';
import type { DiscoveryCompetitor, DiscoveryProfile, DiscoveryResult, DiscoveryTier } from '@/lib/types';

export const maxDuration = 60;

function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function inferTierFromResults(results: DiscoveryResult[]): DiscoveryTier {
  if (results.length === 0) return 'full';
  const first = results[0];
  if (typeof first.internal_notes === 'string' && first.internal_notes.startsWith('tier:teaser')) return 'teaser';
  return 'full';
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const siteId = typeof body.siteId === 'string' ? body.siteId : null;
  const runIdInput = typeof body.runId === 'string' ? body.runId : null;
  const polish = body.polish !== false;
  if (!siteId) {
    return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const isAdmin = isAdminAccount(user.email);

  const { data: site } = await supabase.from('sites').select('id, user_id').eq('id', siteId).maybeSingle();
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 });
  if (!isAdmin && site.user_id !== user.id) {
    return NextResponse.json({ error: 'Not authorized for this site' }, { status: 403 });
  }
  if (!isAdmin) {
    const { data: entitlement } = await supabase
      .from('entitlements')
      .select('can_view_core')
      .eq('user_id', user.id)
      .eq('site_id', siteId)
      .single();
    if (!entitlement?.can_view_core) {
      return NextResponse.json({ error: 'Premium feature — purchase required' }, { status: 403 });
    }
  }

  const admin = getAdminClient();

  let runId = runIdInput;
  if (!runId) {
    const { data: latest } = await admin
      .from('discovery_score_snapshots')
      .select('run_id')
      .eq('site_id', siteId)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    runId = latest?.run_id || null;
  }
  if (!runId) {
    return NextResponse.json({ error: 'No run found for this site' }, { status: 404 });
  }

  const [{ data: resultRows }, { data: compRows }, { data: profileRow }] = await Promise.all([
    admin.from('discovery_results').select('*').eq('site_id', siteId).eq('run_id', runId).eq('suppressed', false),
    admin.from('discovery_competitors').select('*').eq('site_id', siteId).eq('active', true),
    admin.from('discovery_profiles').select('*').eq('site_id', siteId).maybeSingle(),
  ]);

  const results = (resultRows || []) as DiscoveryResult[];
  const competitors = (compRows || []) as DiscoveryCompetitor[];
  const profile = profileRow as DiscoveryProfile | null;
  if (!profile) {
    return NextResponse.json({ error: 'Discovery profile not found' }, { status: 404 });
  }

  const tier = inferTierFromResults(results);
  const ctx = { results, competitors, profile, tier };
  const signals = detectInsightSignals(ctx);
  let drafts = draftRecommendations(signals, ctx);
  let polished = false;
  if (polish && drafts.length > 0) {
    const before = drafts;
    drafts = await polishRecommendationsWithClaude(drafts, profile, { timeoutMs: 15000 });
    polished = drafts !== before;
  }

  try {
    const inserted = await persistRecommendations(admin, siteId, runId, drafts, competitors);
    return NextResponse.json({
      recommendations: inserted,
      count: inserted.length,
      polished,
      tier,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
