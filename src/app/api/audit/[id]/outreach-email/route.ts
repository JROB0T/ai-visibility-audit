// ============================================================
// GET /api/audit/[id]/outreach-email
//
// Generates a pre-written cold-outreach email for the given audit.
// Pulls real data — business name, score, grade, two highest-priority
// "absent" prompts, and the public share URL — and stamps the spec's
// template.
//
// Returns the snippet as structured JSON so the UI can show it,
// copy parts of it, edit before sending — whatever the operator wants.
// No sending happens from this app.
//
// Auth: owner-only (session OR API key). The /r/[token] public viewer
// does NOT expose this; the snippet is for the seller, not the recipient.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireApiKeyOrSession } from '@/lib/apiAuth';

export const maxDuration = 15;

function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function appBaseUrl(request: NextRequest): string {
  const host = request.headers.get('host');
  const isLocalhost = host ? /^(localhost|127\.|0\.0\.0\.0)/i.test(host) : false;
  if (host) return `${isLocalhost ? 'http' : 'https'}://${host}`;
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

function gradeFor(score: number | null): string {
  if (score === null) return '';
  if (score >= 90) return 'A';
  if (score >= 80) return 'A-';
  if (score >= 70) return 'B';
  if (score >= 60) return 'B-';
  if (score >= 50) return 'C';
  if (score >= 40) return 'C-';
  if (score >= 30) return 'D';
  return 'F';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireApiKeyOrSession(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id: auditId } = await params;
  if (!auditId) {
    return NextResponse.json({ error: 'auditId required' }, { status: 400 });
  }

  const admin = getAdminClient();

  // Ownership check + audit load.
  const { data: audit } = await admin
    .from('audits')
    .select('id, site_id, user_id, tier, status')
    .eq('id', auditId)
    .maybeSingle();
  if (!audit || audit.user_id !== auth.userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (audit.status !== 'completed') {
    return NextResponse.json(
      { error: 'Audit not yet completed', status: audit.status },
      { status: 409 },
    );
  }

  // Pull the data the email template needs in three queries.
  const siteId = audit.site_id as string;
  const [{ data: site }, { data: profile }, { data: snapshot }] = await Promise.all([
    admin.from('sites').select('domain').eq('id', siteId).maybeSingle(),
    admin
      .from('discovery_profiles')
      .select('business_name')
      .eq('site_id', siteId)
      .maybeSingle(),
    admin
      .from('discovery_score_snapshots')
      .select('run_id, overall_score, share_token, snapshot_date')
      .eq('site_id', siteId)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!snapshot) {
    return NextResponse.json({ error: 'No completed snapshot for this audit' }, { status: 409 });
  }

  const businessName =
    (profile?.business_name as string | null) || (site?.domain as string | null) || 'this business';
  const domain = (site?.domain as string | null) || '';
  const score = (snapshot.overall_score as number | null) ?? 0;
  const grade = gradeFor(score);

  // Pick the two highest-priority missing queries: prompts where the
  // business wasn't mentioned AND wasn't cited, sorted by lowest score
  // (= most absent). The export endpoint uses the same heuristic so
  // outreach copy and CSV always agree.
  const { data: missing } = await admin
    .from('discovery_results')
    .select('prompt_text, prompt_score')
    .eq('run_id', snapshot.run_id as string)
    .eq('business_mentioned', false)
    .eq('business_cited', false)
    .order('prompt_score', { ascending: true })
    .limit(2);
  const missingQ1 = (missing?.[0]?.prompt_text as string | undefined) || '';
  const missingQ2 = (missing?.[1]?.prompt_text as string | undefined) || '';

  const baseUrl = appBaseUrl(request);
  const shareUrl = snapshot.share_token
    ? `${baseUrl}/r/${snapshot.share_token as string}`
    : '';

  // ----- Template -----
  const subject = `${businessName}'s AI visibility score: ${score}/100`;

  // Recipient first name comes from outreach tools' merge fields (e.g.
  // {{firstName}} in Instantly). We leave a placeholder so the operator
  // can wire the merge tag into their own tool without editing copy.
  const greeting = `Hey {{firstName | there}},`;

  // Body assembly — two variants depending on whether we have the top-2
  // missing queries. Below ~5 prompts tested we sometimes don't.
  const missingLine = missingQ1 && missingQ2
    ? `The biggest gap: you're not showing up at all for "${missingQ1}" or "${missingQ2}" — the exact searches that drive real buyer decisions.`
    : missingQ1
    ? `The biggest gap: you're not showing up for "${missingQ1}" — exactly the kind of search that drives real buyer decisions.`
    : `What stood out: across the buyer-intent prompts we tested, your visibility was inconsistent — competitors were getting recommended for searches you should be winning.`;

  const reportLine = shareUrl
    ? `I put together your full report here: ${shareUrl}`
    : `I put together your full report — happy to send it over when you have a minute.`;

  const closer = `Worth a 15-minute call to walk through what it means?`;
  const signoff = `{{senderName | -- }}`;

  const bodyLines: string[] = [
    greeting,
    '',
    `I ran ${businessName} through our AI visibility checker — you scored ${score}/100 (grade ${grade || '—'}).`,
    '',
    missingLine,
    '',
    reportLine,
    '',
    closer,
    '',
    signoff,
  ];
  const body = bodyLines.join('\n');

  return NextResponse.json({
    subject,
    body,
    // Metadata so the UI can also render a stat strip alongside the
    // raw copy without re-fetching.
    meta: {
      business_name: businessName,
      domain,
      overall_score: score,
      grade,
      share_url: shareUrl,
      top_missing_query_1: missingQ1,
      top_missing_query_2: missingQ2,
    },
  });
}
