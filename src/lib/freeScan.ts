// ============================================================
// Free-scan orchestrator.
//
// Composes the existing primitives into one synchronous run:
//   1. Insert site (user_id=null) + audit (tier='free', status='running')
//   2. Run technical scanner (scanSite) — same as /api/audit/route.ts
//   3. Classify vertical, score, save findings/recommendations/pages
//   4. Mark audit completed
//   5. runDiscoveryTests with auditTier='free' — auto-bootstraps profile +
//      generates 6 prompts (one per cluster), runs Haiku web_search,
//      writes snapshot + results
//   6. Build minimal ReportExportPayload from DB state, stamp through
//      buildFreeSampleHtml, persist on the snapshot
//   7. Mint a share_token so /r/[token] resolves immediately
//
// Cost (one run):
//   scanner: free (HTTP)
//   classifyBusiness (Haiku): ~$0.005
//   discovery bootstrap (Haiku): ~$0.04
//   6-prompt scan (Haiku w/ web_search): ~$0.05
//   no narrative call (free tier uses static framing)
//   ~ $0.10 total
//
// Failure handling:
//   - Tech scanner failure -> audit.status='failed', throw
//   - Discovery failure   -> audit.status='failed' (was 'completed'), throw
//   - Report HTML failure -> audit stays 'completed', snapshot has no
//                            report_html, throw (caller marks request failed)
//
// The caller (free-scan request route) is responsible for the
// free_scan_requests row lifecycle.
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { scanSite } from '@/lib/scanner';
import {
  calculateScores,
  generateRecommendations,
  enrichWithCodeSnippets,
} from '@/lib/scoring';
import { classifyBusiness } from '@/lib/classify';
import { runDiscoveryTests } from '@/lib/discoveryRunner';
import { buildFreeSampleHtml } from '@/lib/reportTemplate';
import { generateShareToken } from '@/lib/shareTokens';
import type { ReportExportPayload, ClusterKey } from '@/lib/reportNarrative';

export interface RunFreeScanParams {
  /** Already normalized (lowercase, no protocol/www/path). */
  domain: string;
  /** free_scan_requests row id, used for log breadcrumbs. */
  requestId: string;
}

export interface RunFreeScanResult {
  auditId: string;
  siteId: string;
  snapshotId: string;
  shareToken: string;
}

function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function runFreeScan(params: RunFreeScanParams): Promise<RunFreeScanResult> {
  const { domain, requestId } = params;
  const admin = getAdminClient();
  const siteUrl = `https://${domain}`;

  // ----- 1. Site row (anonymous: user_id=null) -----
  const { data: site, error: siteErr } = await admin
    .from('sites')
    .insert({ user_id: null, domain, url: siteUrl })
    .select('id')
    .single();
  if (siteErr || !site) {
    throw new Error(`free-scan: site insert failed: ${siteErr?.message || 'unknown'}`);
  }
  const siteId = site.id as string;

  // ----- 2. Audit row -----
  const { data: audit, error: auditErr } = await admin
    .from('audits')
    .insert({
      site_id: siteId,
      user_id: null,
      status: 'running',
      run_type: 'free_sample',
      run_scope: 'free',
      tier: 'free',
    })
    .select('id')
    .single();
  if (auditErr || !audit) {
    throw new Error(`free-scan: audit insert failed: ${auditErr?.message || 'unknown'}`);
  }
  const auditId = audit.id as string;

  // ----- 3. Technical scan -----
  let scanResult: Awaited<ReturnType<typeof scanSite>>;
  try {
    scanResult = await scanSite(siteUrl);
  } catch (err) {
    await admin
      .from('audits')
      .update({ status: 'failed', summary: 'Scan failed — site may be unreachable' })
      .eq('id', auditId);
    throw err instanceof Error ? err : new Error(String(err));
  }

  // ----- 4. Classify + score + persist findings -----
  const homepage = scanResult.pages.find(p => p.pageType === 'homepage');
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
      console.error('[FREE_SCAN_ERROR]', {
        phase: 'pages_insert',
        requestId,
        auditId,
        error: pagesErr.message,
      });
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

  const highCount = recommendations.filter((r) => r.severity === 'high').length;
  const medCount = recommendations.filter((r) => r.severity === 'medium').length;
  const summary = `Scanned ${scanResult.pages.length} pages. Found ${highCount} high-priority and ${medCount} medium-priority issues. Overall AI Visibility Score: ${scores.overall}/100.`;

  await admin
    .from('audits')
    .update({
      status: 'completed',
      overall_score: scores.overall,
      crawlability_score: scores.crawlability.score,
      machine_readability_score: scores.machineReadability.score,
      commercial_clarity_score: scores.commercialClarity.score,
      trust_clarity_score: scores.trustClarity.score,
      pages_scanned: scanResult.pages.length,
      summary,
      completed_at: new Date().toISOString(),
      key_pages_status: scanResult.keyPagesStatus || [],
      home_evidence: homepage?.homeEvidence || null,
      llms_txt: scanResult.llmsTxt || null,
      scanner_summary: scanResult.scannerSummary || null,
    })
    .eq('id', auditId);

  // ----- 5. Discovery (lighter scan: 6 prompts via selectPromptsForTier) -----
  let runId: string;
  try {
    const run = await runDiscoveryTests({
      siteId,
      auditTier: 'free',
      triggeredBy: 'admin',
    });
    runId = run.runId;
  } catch (err) {
    // Mark the audit failed so any operator review can spot it. The caller
    // marks the free_scan_requests row as failed too.
    await admin
      .from('audits')
      .update({ status: 'failed' })
      .eq('id', auditId);
    throw err instanceof Error ? err : new Error(String(err));
  }

  // ----- 6. Report HTML -----
  const payload = await buildFreeSamplePayload(admin, siteId, runId);
  const html = buildFreeSampleHtml(payload);
  const generatedAt = new Date().toISOString();

  const { data: snapshotUpdated, error: snapUpdateErr } = await admin
    .from('discovery_score_snapshots')
    .update({
      report_html: html,
      report_generated_at: generatedAt,
      // No narrative or model — free tier doesn't run the narrative generator.
    })
    .eq('site_id', siteId)
    .eq('run_id', runId)
    .select('id, share_token')
    .single();

  if (snapUpdateErr || !snapshotUpdated) {
    throw new Error(
      `free-scan: snapshot HTML update failed: ${snapUpdateErr?.message || 'no row'}`,
    );
  }

  // ----- 7. Share token (auto-publish for free tier) -----
  const snapshotId = snapshotUpdated.id as string;
  let shareToken = (snapshotUpdated.share_token as string | null) || null;
  if (!shareToken) {
    shareToken = await mintShareToken(admin, snapshotId);
  }

  return { auditId, siteId, snapshotId, shareToken };
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

/**
 * Build a ReportExportPayload directly from the DB rather than calling
 * /api/discovery/export-report (which requires user cookies). Only the
 * fields buildFreeSampleHtml actually reads are populated; other arrays
 * are stubbed. If buildFreeSampleHtml ever grows to read more fields,
 * extend this builder rather than reaching for the cookie-gated route.
 */
async function buildFreeSamplePayload(
  admin: SupabaseClient,
  siteId: string,
  runId: string,
): Promise<ReportExportPayload> {
  const [{ data: snap }, { data: site }, { data: profile }, { data: results }] = await Promise.all([
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
  ]);

  if (!snap) {
    throw new Error('free-scan: snapshot row missing for payload build');
  }

  const overall = (snap.overall_score as number | null) ?? 0;
  const clusterScores = (snap.cluster_scores as Record<ClusterKey, number | null> | null)
    ?? ({ core: null, problem: null, comparison: null, long_tail: null, brand: null, adjacent: null });

  return {
    meta: {
      site_id: siteId,
      run_id: runId,
      business_name: (profile?.business_name as string | null) || (site?.domain as string | null) || '',
      domain: (site?.domain as string | null) || '',
      primary_category: (profile?.primary_category as string | null) ?? null,
      service_area: (profile?.service_area as string | null) ?? null,
      tier: 'full', // legacy DiscoveryTier; not used by buildFreeSampleHtml
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
    competitors: [],
    insights: [],
    recommendations: [],
    trend: {
      available: false,
      snapshots_count: 1,
      history: [],
      overall_change_from_first: null,
      overall_change_from_previous: null,
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

/**
 * Mint a share_token onto the snapshot, retrying on the unique-violation
 * collision (cosmically unlikely with 16 chars from a 56-char alphabet).
 * Mirrors the pattern in /api/discovery/report/share/route.ts.
 */
async function mintShareToken(admin: SupabaseClient, snapshotId: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = generateShareToken();
    const now = new Date().toISOString();
    const { error } = await admin
      .from('discovery_score_snapshots')
      .update({ share_token: token, shared_at: now })
      .eq('id', snapshotId);
    if (!error) return token;
    if (error.code !== '23505') {
      throw new Error(`free-scan: share token persist failed: ${error.message}`);
    }
  }
  throw new Error('free-scan: could not mint share token after retries');
}
