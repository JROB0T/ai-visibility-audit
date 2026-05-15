// ============================================================
// Paid-scan orchestration. Two phases, called from two different
// execution contexts:
//
//   provisionPaidScan(session)  ← Stripe webhook (fast, < 5s)
//     - Idempotency check
//     - Find-or-create auth user
//     - Create site + audit + (subscription if monthly) + billing_events
//     - Returns auditId so the webhook can fire the worker
//
//   runPaidScan({ auditId })    ← /api/internal/paid-scan/run worker
//     - Loads audit + site
//     - Runs technical scan (scanSite)
//     - Saves pages/findings/recommendations (same as free-scan flow)
//     - Runs discovery (auditTier from row)
//     - Generates narrative + report HTML (Tier 1 narrative; Tier 2
//       gets fix list visible in the dashboard via Phase 2 work)
//     - Mints share token
//     - Sends sendReportReadyEmail
//
// Why split: webhooks must respond fast (Stripe's 30s timeout).
// Discovery scans take 60-90s. Splitting keeps the webhook snappy
// and lets the worker have its own maxDuration=300 budget.
//
// Idempotency: provisionPaidScan checks billing_events for
// stripe_session_id before doing anything. If a row exists, the
// session was already provisioned and we no-op. This protects
// against Stripe webhook retries.
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { scanSite } from '@/lib/scanner';
import {
  calculateScores,
  generateRecommendations,
  enrichWithCodeSnippets,
} from '@/lib/scoring';
import { classifyBusiness } from '@/lib/classify';
import { runDiscoveryTests } from '@/lib/discoveryRunner';
import { generateReportNarrative, type ClusterKey, type ReportExportPayload, type ReportNarrative, type NarrativeTier } from '@/lib/reportNarrative';
import { buildReportHtml } from '@/lib/reportTemplate';
import { sendReportReadyEmail } from '@/lib/email';
import { findOrCreateUserByEmail } from '@/lib/userProvisioning';
import {
  isTierSku,
  tierOf,
  cadenceOf,
  billingEventTypeFor,
  type TierSku,
} from '@/lib/pricing';
import type { AuditTier } from '@/lib/types';

function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ============================================================
// 1. provisionPaidScan — fast DB work, called from webhook
// ============================================================

export interface ProvisionResult {
  alreadyProvisioned: boolean;
  auditId?: string;
  siteId?: string;
  userId?: string;
  email?: string;
  domain?: string;
  tier?: AuditTier;
}

/**
 * Extract our `domain` custom field value from a Stripe Checkout
 * Session. Returns null if not present or malformed.
 */
function extractDomain(session: Stripe.Checkout.Session): string | null {
  const fields = (session.custom_fields || []) as Array<{
    key?: string;
    text?: { value?: string | null } | null;
  }>;
  const f = fields.find(x => x?.key === 'domain');
  const raw = f?.text?.value || '';
  if (!raw) return null;
  // Light normalization — mirrors normalizeDomain from free-scan.
  let s = raw.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '');
  s = s.replace(/^www\./, '');
  s = s.split('/')[0].split('?')[0].split('#')[0];
  return s || null;
}

export async function provisionPaidScan(session: Stripe.Checkout.Session): Promise<ProvisionResult> {
  const admin = getAdminClient();
  const sessionId = session.id;

  // ----- 1. Idempotency check -----
  // billing_events.stripe_session_id is our dedup key. If a row
  // already exists for this session, we've already provisioned;
  // return early so Stripe retries (or duplicate deliveries) don't
  // cascade into multiple users/sites/audits.
  const { data: existing } = await admin
    .from('billing_events')
    .select('audit_id, user_id, site_id')
    .eq('stripe_session_id', sessionId)
    .maybeSingle();
  if (existing && existing.audit_id) {
    console.log('[paidScan] already provisioned, session=', sessionId);
    return {
      alreadyProvisioned: true,
      auditId: existing.audit_id as string,
      siteId: existing.site_id as string | undefined,
      userId: existing.user_id as string,
    };
  }

  // ----- 2. Read what Stripe gave us -----
  const sku = session.metadata?.sku;
  if (!sku || !isTierSku(sku)) {
    throw new Error(`provisionPaidScan: missing/invalid metadata.sku on session ${sessionId}`);
  }
  const tier: AuditTier = tierOf(sku);
  const cadence = cadenceOf(sku);

  const email = session.customer_details?.email || session.customer_email;
  if (!email) {
    throw new Error(`provisionPaidScan: no email on session ${sessionId}`);
  }

  const domain = extractDomain(session);
  if (!domain) {
    throw new Error(`provisionPaidScan: no domain custom_field on session ${sessionId}`);
  }

  // ----- 3. User -----
  const { userId } = await findOrCreateUserByEmail(email);

  // ----- 4. Site -----
  // Re-use an existing site row for this (user, domain) if present;
  // otherwise create. Same convention as /api/audit/route.ts.
  let siteId: string;
  const { data: existingSite } = await admin
    .from('sites')
    .select('id')
    .eq('user_id', userId)
    .eq('domain', domain)
    .maybeSingle();
  if (existingSite) {
    siteId = existingSite.id as string;
  } else {
    const { data: newSite, error: siteErr } = await admin
      .from('sites')
      .insert({
        user_id: userId,
        domain,
        url: `https://${domain}`,
        plan_status: tier === 'tier_2' ? 'core_premium' : 'core',
      })
      .select('id')
      .single();
    if (siteErr || !newSite) {
      throw new Error(`provisionPaidScan: site insert failed: ${siteErr?.message || 'unknown'}`);
    }
    siteId = newSite.id as string;
  }

  // ----- 5. Audit -----
  const { data: audit, error: auditErr } = await admin
    .from('audits')
    .insert({
      site_id: siteId,
      user_id: userId,
      status: 'running',
      tier,
      run_type: 'paid_initial',
      run_scope: 'core_plus_premium',
    })
    .select('id')
    .single();
  if (auditErr || !audit) {
    throw new Error(`provisionPaidScan: audit insert failed: ${auditErr?.message || 'unknown'}`);
  }
  const auditId = audit.id as string;

  // ----- 6. Subscription (monthly only) -----
  if (cadence === 'monthly') {
    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : (session.subscription?.id as string | undefined);
    if (subscriptionId) {
      const { error: subErr } = await admin.from('subscriptions').insert({
        user_id: userId,
        domain,
        tier,
        cadence: 'monthly',
        stripe_subscription_id: subscriptionId,
        status: 'active',
        // Phase 5's cron compares next_run_at <= NOW(). Set it ~30
        // days out so the first auto-rerun is a month after the
        // initial provisioning scan we're about to fire.
        next_run_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        last_run_audit_id: auditId,
      });
      // 23505 = unique violation on stripe_subscription_id, i.e. a
      // duplicate webhook for the same subscription. Idempotent skip.
      if (subErr && subErr.code !== '23505') {
        console.error('[paidScan] subscription insert failed', { auditId, error: subErr.message });
      }
    }
  }

  // ----- 7. Billing event (also our idempotency marker) -----
  await admin.from('billing_events').insert({
    user_id: userId,
    site_id: siteId,
    audit_id: auditId,
    event_type: billingEventTypeFor(sku),
    stripe_session_id: sessionId,
    amount_cents: session.amount_total || 0,
  });

  return {
    alreadyProvisioned: false,
    auditId,
    siteId,
    userId,
    email,
    domain,
    tier,
  };
}

// ============================================================
// 2. runPaidScan — long-running, called from worker route
// ============================================================

export interface RunPaidScanParams {
  auditId: string;
}

export async function runPaidScan(params: RunPaidScanParams): Promise<void> {
  const { auditId } = params;
  const admin = getAdminClient();

  // ----- Load audit + site -----
  const { data: audit, error: auditErr } = await admin
    .from('audits')
    .select('id, site_id, user_id, tier, status')
    .eq('id', auditId)
    .maybeSingle();
  if (auditErr || !audit) {
    throw new Error(`runPaidScan: audit ${auditId} not found`);
  }

  // Re-entrancy guard: if this audit is already completed, no-op.
  if (audit.status === 'completed') {
    console.log('[paidScan] runPaidScan: already completed, skip', { auditId });
    return;
  }

  const siteId = audit.site_id as string;
  const userId = audit.user_id as string;
  const tier = (audit.tier as AuditTier) || 'tier_1';

  const { data: site, error: siteErr } = await admin
    .from('sites')
    .select('id, domain, url')
    .eq('id', siteId)
    .maybeSingle();
  if (siteErr || !site) {
    throw new Error(`runPaidScan: site ${siteId} not found`);
  }
  const domain = (site.domain as string) || '';
  const siteUrl = (site.url as string) || `https://${domain}`;

  // ----- Look up user's email for the report-ready notification -----
  // Read directly from auth.users via the admin API since auth.users
  // isn't queryable through the public PostgREST surface.
  let userEmail: string | null = null;
  try {
    const { data: userRow } = await admin.auth.admin.getUserById(userId);
    userEmail = userRow.user?.email || null;
  } catch (err) {
    console.warn('[paidScan] getUserById failed; report-ready email will be skipped', {
      auditId,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    // ----- Technical scan -----
    const scanResult = await scanSite(siteUrl);
    const homepage = scanResult.pages.find(p => p.pageType === 'homepage');

    // Classify vertical
    const aiVertical = await classifyBusiness({
      domain,
      title: homepage?.title || null,
      h1: homepage?.h1Text || null,
      metaDescription: homepage?.metaDescription || null,
      bodySnippet: homepage?.firstParagraphText || null,
      pageUrls: scanResult.pages.map(p => p.url),
      schemaTypes: scanResult.pages.flatMap(p => p.schemaTypes),
      interstitialBlocked: !!homepage?.interstitialBlocked,
    });
    await admin.from('sites').update({ vertical: aiVertical }).eq('id', siteId);

    const scores = calculateScores(scanResult);
    const rawRecs = generateRecommendations(scanResult);
    const recommendations = enrichWithCodeSnippets(rawRecs, scanResult);

    if (scanResult.pages.length > 0) {
      const pageRows = scanResult.pages.map((p) => ({
        audit_id: auditId,
        url: p.url,
        page_type: p.pageType,
        title: p.title,
        meta_description: p.metaDescription,
        canonical_url: p.canonicalUrl,
        has_schema: p.hasSchema,
        schema_types: p.schemaTypes,
        h1_text: p.h1Text,
        word_count: p.wordCount,
        load_time_ms: p.loadTimeMs,
        status_code: p.statusCode,
        issues: p.issues,
      }));
      const { error: pagesErr } = await admin.from('audit_pages').insert(pageRows);
      if (pagesErr) {
        console.error('[PAID_SCAN_ERROR]', { phase: 'pages_insert', auditId, error: pagesErr.message });
      }
    }

    for (let i = 0; i < recommendations.length; i++) {
      const rec = recommendations[i];
      const { data: finding } = await admin
        .from('audit_findings')
        .insert({
          audit_id: auditId,
          category: rec.category,
          severity: rec.severity,
          title: rec.title,
          description: rec.whyItMatters,
          affected_urls: rec.affectedUrls,
        })
        .select('id')
        .single();
      await admin.from('audit_recommendations').insert({
        audit_id: auditId,
        finding_id: finding?.id || null,
        category: rec.category,
        severity: rec.severity,
        effort: rec.effort,
        title: rec.title,
        why_it_matters: rec.whyItMatters,
        recommended_fix: rec.recommendedFix,
        priority_order: i + 1,
      });
    }

    const highCount = recommendations.filter(r => r.severity === 'high').length;
    const medCount = recommendations.filter(r => r.severity === 'medium').length;
    const summary = `Scanned ${scanResult.pages.length} pages. Found ${highCount} high-priority and ${medCount} medium-priority issues. Overall AI Visibility Score: ${scores.overall}/100.`;

    await admin
      .from('audits')
      .update({
        overall_score: scores.overall,
        crawlability_score: scores.crawlability.score,
        machine_readability_score: scores.machineReadability.score,
        commercial_clarity_score: scores.commercialClarity.score,
        trust_clarity_score: scores.trustClarity.score,
        pages_scanned: scanResult.pages.length,
        summary,
        key_pages_status: scanResult.keyPagesStatus || [],
        home_evidence: homepage?.homeEvidence || null,
        llms_txt: scanResult.llmsTxt || null,
        scanner_summary: scanResult.scannerSummary || null,
      })
      .eq('id', auditId);

    // ----- Discovery -----
    const run = await runDiscoveryTests({
      siteId,
      auditTier: tier,
      triggeredBy: 'user',
    });
    const runId = run.runId;

    // ----- Narrative + report HTML -----
    const payload = await buildExportPayload(admin, siteId, runId);
    const narrativeTier: NarrativeTier = tier === 'tier_2' ? 'tier_2' : 'tier_1';
    let narrative: ReportNarrative | null = null;
    let model: string | null = null;
    try {
      const out = await generateReportNarrative(payload, { tier: narrativeTier });
      narrative = out.narrative;
      model = out.model;
    } catch (err) {
      console.error('[PAID_SCAN_ERROR]', {
        phase: 'narrative',
        auditId,
        message: err instanceof Error ? err.message : String(err),
      });
      // Continue without narrative — the dashboard still renders;
      // the 7-page brief will be unavailable until regenerated.
    }

    if (narrative) {
      const html = buildReportHtml(payload, narrative);
      const { error: snapErr } = await admin
        .from('discovery_score_snapshots')
        .update({
          report_html: html,
          report_narrative: narrative,
          report_generated_at: new Date().toISOString(),
          report_model: model,
        })
        .eq('site_id', siteId)
        .eq('run_id', runId);
      if (snapErr) {
        console.error('[PAID_SCAN_ERROR]', { phase: 'snapshot_html_update', auditId, message: snapErr.message });
      }
    }

    // ----- Entitlements (so the existing dashboard auth checks pass) -----
    await admin.from('entitlements').upsert(
      {
        user_id: userId,
        site_id: siteId,
        can_view_core: true,
        can_view_growth_strategy: true,
        can_view_marketing_perception: true,
        can_export: true,
        // has_monthly_monitoring + monthly_scope handled by the
        // subscriptions row; entitlements is per (user, site) for
        // legacy dashboard checks.
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,site_id' },
    );

    // ----- Mark audit complete -----
    await admin
      .from('audits')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', auditId);

    // ----- Report-ready email -----
    if (userEmail) {
      const reportUrl = `/audit/${auditId}/report`;
      await sendReportReadyEmail({
        to: userEmail,
        tier: tier === 'tier_2' ? 'tier_2' : 'tier_1',
        domain,
        reportUrl,
        isMonthlyRerun: false,
      });
    }
  } catch (err) {
    await admin.from('audits').update({ status: 'failed' }).eq('id', auditId);
    console.error('[PAID_SCAN_ERROR]', {
      phase: 'top_level',
      auditId,
      errorName: err instanceof Error ? err.name : 'UnknownError',
      errorMessage: err instanceof Error ? err.message : String(err),
      errorStack: err instanceof Error ? err.stack : undefined,
    });
    throw err instanceof Error ? err : new Error(String(err));
  }
}

// ============================================================
// Helper: build a ReportExportPayload from DB state (same shape
// as /api/discovery/export-report returns, but read directly so
// we don't need user-cookie-auth for the internal worker path).
// ============================================================

async function buildExportPayload(
  admin: SupabaseClient,
  siteId: string,
  runId: string,
): Promise<ReportExportPayload> {
  const [
    { data: snap },
    { data: site },
    { data: profile },
    { data: results },
    { data: competitors },
    { data: insights },
    { data: recs },
    { data: history },
  ] = await Promise.all([
    admin
      .from('discovery_score_snapshots')
      .select('overall_score, cluster_scores, prompt_count, strong_count, partial_count, absent_count, competitor_dominant_count, snapshot_date')
      .eq('site_id', siteId)
      .eq('run_id', runId)
      .maybeSingle(),
    admin.from('sites').select('domain').eq('id', siteId).maybeSingle(),
    admin
      .from('discovery_profiles')
      .select('business_name, primary_category, service_area')
      .eq('site_id', siteId)
      .maybeSingle(),
    admin
      .from('discovery_results')
      .select('id, prompt_id, prompt_text, prompt_cluster, business_mentioned, business_cited, business_position_type, prompt_score, visibility_status, result_type_summary, normalized_response_summary, raw_response_excerpt, competitor_names_detected, competitor_domains_detected, directories_detected, marketplaces_detected, confidence_score')
      .eq('site_id', siteId)
      .eq('run_id', runId),
    admin
      .from('discovery_competitors')
      .select('id, name, domain')
      .eq('site_id', siteId)
      .eq('active', true),
    admin
      .from('discovery_insights')
      .select('category, title, description, severity, linked_cluster')
      .eq('site_id', siteId)
      .eq('run_id', runId),
    admin
      .from('discovery_recommendations')
      .select('title, description, why_it_matters, category, priority, owner_type, impact_estimate, difficulty_estimate, suggested_timeline')
      .eq('site_id', siteId)
      .eq('run_id', runId),
    admin
      .from('discovery_score_snapshots')
      .select('snapshot_date, run_id, overall_score, cluster_scores, prompt_count, strong_count, partial_count, absent_count, competitor_dominant_count')
      .eq('site_id', siteId)
      .order('snapshot_date', { ascending: true }),
  ]);

  if (!snap) {
    throw new Error('runPaidScan: snapshot row missing for payload build');
  }

  const overall = (snap.overall_score as number | null) ?? 0;
  const clusterScores = (snap.cluster_scores as Record<ClusterKey, number | null> | null)
    ?? ({ core: null, problem: null, comparison: null, long_tail: null, brand: null, adjacent: null });

  const historyRows = (history || []).map(h => ({
    snapshot_date: h.snapshot_date as string,
    run_id: h.run_id as string,
    overall_score: (h.overall_score as number | null) ?? 0,
    cluster_scores: (h.cluster_scores as Record<ClusterKey, number | null>) || ({} as Record<ClusterKey, number | null>),
    prompt_count: (h.prompt_count as number | null) ?? 0,
    strong_count: (h.strong_count as number | null) ?? 0,
    partial_count: (h.partial_count as number | null) ?? 0,
    absent_count: (h.absent_count as number | null) ?? 0,
    competitor_dominant_count: (h.competitor_dominant_count as number | null) ?? 0,
  }));

  return {
    meta: {
      site_id: siteId,
      run_id: runId,
      business_name: (profile?.business_name as string | null) || (site?.domain as string | null) || '',
      domain: (site?.domain as string | null) || '',
      primary_category: (profile?.primary_category as string | null) ?? null,
      service_area: (profile?.service_area as string | null) ?? null,
      tier: 'full',
      snapshot_date: (snap.snapshot_date as string | null) || new Date().toISOString(),
      report_generated_at: new Date().toISOString(),
      prompt_count: (snap.prompt_count as number | null) ?? 0,
    },
    scores: {
      overall_score: overall,
      overall_grade: overallGrade(overall),
      cluster_scores: clusterScores,
      visibility_distribution: {},
      counts: {
        prompt_count: (snap.prompt_count as number | null) ?? 0,
        strong_count: (snap.strong_count as number | null) ?? 0,
        partial_count: (snap.partial_count as number | null) ?? 0,
        absent_count: (snap.absent_count as number | null) ?? 0,
        competitor_dominant_count: (snap.competitor_dominant_count as number | null) ?? 0,
      },
    },
    prompts_tested: (results || []).map((r) => ({
      id: r.id as string,
      prompt_text: (r.prompt_text as string) || '',
      cluster: ((r.prompt_cluster as ClusterKey) || 'core'),
      priority: 'medium',
      score: (r.prompt_score as number | null) ?? 0,
      visibility_status: (r.visibility_status as string) || 'unclear',
      business_position_type: (r.business_position_type as string | null) ?? null,
      business_mentioned: !!r.business_mentioned,
      business_cited: !!r.business_cited,
      result_type_summary: (r.result_type_summary as string | null) ?? null,
      normalized_response_summary: (r.normalized_response_summary as string | null) ?? null,
      raw_response_excerpt: (r.raw_response_excerpt as string | null) ?? null,
      competitor_names_detected: (r.competitor_names_detected as string[] | null) || [],
      competitor_domains_detected: (r.competitor_domains_detected as string[] | null) || [],
      directories_detected: (r.directories_detected as string[] | null) || [],
      marketplaces_detected: (r.marketplaces_detected as string[] | null) || [],
      confidence_score: (r.confidence_score as number | null) ?? null,
    })),
    competitors: (competitors || []).map(c => ({
      id: c.id as string,
      name: c.name as string,
      domain: (c.domain as string | null) ?? null,
      times_appeared: 0,
      times_beat_us: 0,
      prompts_where_they_won: [],
    })),
    insights: (insights || []).map(i => ({
      category: i.category as string,
      title: i.title as string,
      description: (i.description as string | null) || '',
      severity: ((i.severity as 'high' | 'medium' | 'low') || 'medium'),
      linked_cluster: (i.linked_cluster as string | null) ?? null,
      linked_competitor_name: null,
    })),
    recommendations: (recs || []).map(r => ({
      title: r.title as string,
      description: (r.description as string | null) || '',
      why_it_matters: (r.why_it_matters as string | null) || '',
      category: (r.category as string | null) || '',
      priority: ((r.priority as 'high' | 'medium' | 'low') || 'medium'),
      owner_type: (r.owner_type as string | null) || 'business_owner',
      impact_estimate: (r.impact_estimate as string | null) || 'medium',
      difficulty_estimate: (r.difficulty_estimate as string | null) || 'medium',
      suggested_timeline: (r.suggested_timeline as string | null) || '',
      linked_prompt_clusters: [],
      linked_competitor_names: [],
    })),
    trend: {
      available: historyRows.length > 1,
      snapshots_count: historyRows.length,
      history: historyRows,
      overall_change_from_first: historyRows.length > 1
        ? overall - historyRows[0].overall_score
        : null,
      overall_change_from_previous: historyRows.length > 1
        ? overall - historyRows[historyRows.length - 2].overall_score
        : null,
      cluster_changes_from_previous: null,
    },
  };
}

function overallGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'A-';
  if (score >= 70) return 'B';
  if (score >= 60) return 'B-';
  if (score >= 50) return 'C';
  if (score >= 40) return 'C-';
  if (score >= 30) return 'D';
  return 'F';
}

// Re-export commonly used pricing types so callers can avoid an
// extra import line.
export type { TierSku };
