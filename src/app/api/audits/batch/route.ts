// ============================================================
// POST /api/audits/batch
//
// Submit a batch of audits for asynchronous processing. The
// endpoint returns immediately with a batch id + per-job ids and
// share URLs; actual audit generation happens out-of-band via
// /api/cron/run-batch-jobs.
//
// Auth: API key (Bearer) OR signed-in session. Caller becomes the
// owner of all created audits.
//
// Body shape:
//   {
//     "businesses": [
//       { "name": "...", "website": "...", "location": "...",
//         "industry": "...", "tier": "free" | "tier_1" | "tier_2",
//         "email": "..." }
//     ],
//     "notify_webhook": "https://..."  // optional, currently stubbed
//   }
//
// `tier` defaults to 'free' per business if omitted. `email` is
// optional contact address passed through to the export CSV for
// cold-outreach workflows — never sent from this app.
//
// Constraints: max 50 businesses per submission (Vercel function
// + DB write budget). Larger jobs should be split client-side.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireApiKeyOrSession } from '@/lib/apiAuth';
import { isValidDomain, normalizeDomain } from '@/lib/normalize';
import type { AuditTier } from '@/lib/types';

export const maxDuration = 30;

interface BusinessInput {
  name?: unknown;
  website?: unknown;
  location?: unknown;
  industry?: unknown;
  tier?: unknown;
  email?: unknown;
}

interface BatchBody {
  businesses?: BusinessInput[];
  notify_webhook?: unknown;
}

const MAX_BUSINESSES_PER_BATCH = 50;
const VALID_TIERS: AuditTier[] = ['free', 'tier_1', 'tier_2'];

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

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireApiKeyOrSession(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: BatchBody;
  try {
    body = (await request.json()) as BatchBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const businesses = Array.isArray(body.businesses) ? body.businesses : null;
  if (!businesses || businesses.length === 0) {
    return NextResponse.json(
      { error: 'businesses array is required and must not be empty' },
      { status: 400 },
    );
  }
  if (businesses.length > MAX_BUSINESSES_PER_BATCH) {
    return NextResponse.json(
      { error: `max ${MAX_BUSINESSES_PER_BATCH} businesses per batch`, received: businesses.length },
      { status: 400 },
    );
  }

  // Validate notify_webhook shape if provided. Only http/https URLs;
  // localhost rejected so leaked secrets can't cause SSRF.
  let notifyWebhook: string | null = null;
  if (body.notify_webhook !== undefined && body.notify_webhook !== null && body.notify_webhook !== '') {
    if (typeof body.notify_webhook !== 'string') {
      return NextResponse.json({ error: 'notify_webhook must be a string' }, { status: 400 });
    }
    try {
      const u = new URL(body.notify_webhook);
      if (!/^https?:$/.test(u.protocol)) {
        return NextResponse.json({ error: 'notify_webhook must be http(s)' }, { status: 400 });
      }
      if (/^(localhost|127\.|0\.0\.0\.0|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(u.hostname)) {
        return NextResponse.json({ error: 'notify_webhook must be a public host' }, { status: 400 });
      }
      notifyWebhook = u.toString();
    } catch {
      return NextResponse.json({ error: 'notify_webhook is not a valid URL' }, { status: 400 });
    }
  }

  // Validate each business; build clean inputs OR collect per-row errors.
  const cleaned: Array<{
    business_name: string | null;
    website: string;
    location: string | null;
    industry: string | null;
    tier: AuditTier;
    email: string | null;
  }> = [];
  const errors: Array<{ index: number; error: string }> = [];

  for (let i = 0; i < businesses.length; i++) {
    const b = businesses[i];
    const websiteRaw = typeof b?.website === 'string' ? b.website.trim() : '';
    if (!websiteRaw) {
      errors.push({ index: i, error: 'website is required' });
      continue;
    }
    if (!isValidDomain(websiteRaw)) {
      errors.push({ index: i, error: `invalid website: ${websiteRaw}` });
      continue;
    }
    const tier: AuditTier =
      typeof b?.tier === 'string' && VALID_TIERS.includes(b.tier as AuditTier)
        ? (b.tier as AuditTier)
        : 'free';
    // Email is passed through — no strict validation (operator owns
    // the list, may contain merge tags or placeholders). Just trim.
    const emailRaw = typeof b?.email === 'string' ? b.email.trim().slice(0, 320) : '';
    cleaned.push({
      business_name: typeof b?.name === 'string' ? b.name.trim().slice(0, 200) || null : null,
      website: normalizeDomain(websiteRaw),
      location: typeof b?.location === 'string' ? b.location.trim().slice(0, 200) || null : null,
      industry: typeof b?.industry === 'string' ? b.industry.trim().slice(0, 200) || null : null,
      tier,
      email: emailRaw || null,
    });
  }

  if (errors.length > 0 && cleaned.length === 0) {
    return NextResponse.json(
      { error: 'no valid businesses in submission', invalid: errors },
      { status: 400 },
    );
  }

  // ----- Persist batch + jobs -----
  const admin = getAdminClient();
  const { data: batchRow, error: batchErr } = await admin
    .from('audit_batches')
    .insert({
      created_by: auth.userId,
      notify_webhook: notifyWebhook,
    })
    .select('id, created_at')
    .single();
  if (batchErr || !batchRow) {
    console.error('[BATCH_SUBMIT_ERROR]', { phase: 'batch_insert', message: batchErr?.message });
    return NextResponse.json({ error: 'Could not create batch' }, { status: 500 });
  }
  const batchId = batchRow.id as string;

  const jobRows = cleaned.map(c => ({
    batch_id: batchId,
    business_name: c.business_name,
    website: c.website,
    location: c.location,
    industry: c.industry,
    tier: c.tier,
    email: c.email,
  }));
  const { data: insertedJobs, error: jobsErr } = await admin
    .from('audit_jobs')
    .insert(jobRows)
    .select('id, business_name, website, tier, status');
  if (jobsErr || !insertedJobs) {
    console.error('[BATCH_SUBMIT_ERROR]', { phase: 'jobs_insert', batchId, message: jobsErr?.message });
    // Rollback: delete the batch so we don't leak orphans.
    await admin.from('audit_batches').delete().eq('id', batchId);
    return NextResponse.json({ error: 'Could not enqueue jobs' }, { status: 500 });
  }

  const baseUrl = appBaseUrl(request);
  const responseAudits = insertedJobs.map(j => ({
    job_id: j.id as string,
    business_name: (j.business_name as string | null) || (j.website as string),
    tier: j.tier as AuditTier,
    status: j.status as 'queued' | 'processing' | 'completed' | 'failed',
    // audit_id is null at queue time; status endpoint fills it in.
    // Share + report URLs follow standard patterns; report_url isn't
    // resolvable yet but it's stable so we can return it now.
    status_url: `${baseUrl}/api/audits/batch/${batchId}`,
  }));

  return NextResponse.json({
    batch_id: batchId,
    created_at: batchRow.created_at,
    audits: responseAudits,
    invalid: errors.length > 0 ? errors : undefined,
  });
}
