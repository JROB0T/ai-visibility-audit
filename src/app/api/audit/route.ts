import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';
import { scanSite } from '@/lib/scanner';
import { calculateScores, generateRecommendations, enrichWithCodeSnippets } from '@/lib/scoring';
import { classifyBusiness } from '@/lib/classify';
import { isAdminAccount } from '@/lib/entitlements';
import { enrichAsFreeSample } from '@/lib/freeScan';

// Bumped from 60s to 300s to accommodate the free-sample AI Discovery
// enrichment on first-time signup scans. Tech scan ~30s + discovery
// ~30s = ~60s worst case; the extra headroom protects us from cold-
// start variance and Anthropic API latency spikes.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    let siteUrl = url.trim();
    if (!siteUrl.startsWith('http://') && !siteUrl.startsWith('https://')) {
      siteUrl = 'https://' + siteUrl;
    }

    let domain: string;
    try { domain = new URL(siteUrl).hostname; } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    // Normalize www prefix — "www.example.com" and "example.com" are the same site
    if (domain.startsWith('www.')) {
      domain = domain.slice(4);
      siteUrl = siteUrl.replace(/\/\/www\./i, '//');
    }

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // ---- One-site-per-account gate (2026-07-01) --------------------
    // Product model:
    //   - Non-subscriber: 1 free sample scan on 1 site.
    //   - Subscriber: 1 subscribed site (auto monthly rerun + on-
    //     demand rescan). Additional sites need additional
    //     subscriptions.
    //   - Admin (ADMIN_EMAILS): unlimited.
    // Re-scanning the SAME site the user already owns is always fine;
    // it reuses the existing site row and doesn't trigger the gate.
    const isAdminUser = isAdminAccount(user.email);
    // Whether this scan should also produce a shareable 2-page free
    // sample (AI Discovery enrichment). True only for a non-admin,
    // non-subscriber user's very first site — matches the product
    // model: one free sample per signup.
    let isFirstTimeFreeSample = false;
    if (!isAdminUser) {
      const { data: existingSitesForUser } = await supabase
        .from('sites')
        .select('id, domain, has_monthly_monitoring')
        .eq('user_id', user.id);

      const alreadyOnThisSite = (existingSitesForUser || []).some(s => s.domain === domain);
      const hasSubscription = (existingSitesForUser || []).some(s => s.has_monthly_monitoring === true);
      const siteCount = (existingSitesForUser || []).length;
      isFirstTimeFreeSample = siteCount === 0 && !hasSubscription;

      if (!alreadyOnThisSite && siteCount >= 1) {
        if (hasSubscription) {
          return NextResponse.json(
            {
              error: 'Your subscription covers one site',
              detail: 'To monitor another site, subscribe again for that site.',
              upgradeUrl: '/pricing',
            },
            { status: 402 },
          );
        }
        return NextResponse.json(
          {
            error: 'Free scan already used',
            detail: 'You get one free sample. Subscribe to Monthly for the full report and automatic monthly rescans.',
            upgradeUrl: '/pricing',
          },
          { status: 402 },
        );
      }
    }

    // Reuse existing site record for the same domain + user
    let site;
    const { data: existingSite } = await supabase
      .from('sites')
      .select()
      .eq('domain', domain)
      .eq('user_id', user.id)
      .single();

    if (existingSite) {
      site = existingSite;
    }

    if (!site) {
      const { data: newSite, error: siteError } = await supabase
        .from('sites')
        .insert({ domain, url: siteUrl, user_id: user.id })
        .select()
        .single();

      if (siteError) {
        console.error('Site creation error:', siteError);
        return NextResponse.json({ error: 'Failed to create site record' }, { status: 500 });
      }
      site = newSite;
    }

    // Check if user has paid entitlements for this site (admin bypass first)
    const isAdmin = isAdminAccount(user.email);
    let hasPaidEntitlement = isAdmin;
    if (!hasPaidEntitlement) {
      const { data: entitlement } = await supabase
        .from('entitlements')
        .select('can_view_core')
        .eq('user_id', user.id)
        .eq('site_id', site.id)
        .single();
      hasPaidEntitlement = !!entitlement?.can_view_core;
    }

    // Look up previous completed audit for delta tracking
    let previousAuditId: string | null = null;
    const { data: prevAudit } = await supabase
      .from('audits')
      .select('id')
      .eq('site_id', site.id)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (prevAudit) previousAuditId = prevAudit.id;

    // Set run type based on entitlement status
    const runType = hasPaidEntitlement ? 'paid_initial' : 'free_preview';
    const runScope = hasPaidEntitlement ? 'core_plus_premium' : 'free';

    // Create audit record
    const { data: audit, error: auditError } = await supabase
      .from('audits')
      .insert({ site_id: site.id, user_id: user.id, status: 'running', run_type: runType, run_scope: runScope, previous_audit_id: previousAuditId })
      .select()
      .single();

    if (auditError) {
      console.error('Audit creation error:', auditError);
      return NextResponse.json({ error: 'Failed to create audit record' }, { status: 500 });
    }

    // Run scan
    let scanResult;
    try { scanResult = await scanSite(siteUrl); } catch (scanError) {
      console.error('Scan error:', scanError);
      await supabase.from('audits').update({ status: 'failed', summary: 'Scan failed — site may be unreachable' }).eq('id', audit.id);
      return NextResponse.json({ error: 'Could not scan this site.', auditId: audit.id }, { status: 422 });
    }

    // Auto-detect vertical using AI classification — runs every scan
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
    await supabase.from('sites').update({ vertical: aiVertical }).eq('id', site.id);

    const scores = calculateScores(scanResult);
    const rawRecommendations = generateRecommendations(scanResult);
    const recommendations = enrichWithCodeSnippets(rawRecommendations, scanResult);

    // Save pages
    if (scanResult.pages.length > 0) {
      const pageRows = scanResult.pages.map((p) => ({
        audit_id: audit.id, url: p.url, page_type: p.pageType, title: p.title,
        meta_description: p.metaDescription, canonical_url: p.canonicalUrl,
        has_schema: p.hasSchema, schema_types: p.schemaTypes, h1_text: p.h1Text,
        word_count: p.wordCount, load_time_ms: p.loadTimeMs, status_code: p.statusCode, issues: p.issues,
      }));
      const { error: pagesError } = await supabase.from('audit_pages').insert(pageRows);
      if (pagesError) console.error('Pages insert error:', pagesError);
    }

    // Save findings and recommendations
    for (let i = 0; i < recommendations.length; i++) {
      const rec = recommendations[i];
      const { data: finding } = await supabase
        .from('audit_findings')
        .insert({ audit_id: audit.id, category: rec.category, severity: rec.severity, title: rec.title, description: rec.whyItMatters, affected_urls: rec.affectedUrls })
        .select().single();
      await supabase.from('audit_recommendations').insert({
        audit_id: audit.id, finding_id: finding?.id || null, category: rec.category,
        severity: rec.severity, effort: rec.effort, title: rec.title,
        why_it_matters: rec.whyItMatters, recommended_fix: rec.recommendedFix, priority_order: i + 1,
      });
    }

    const highCount = recommendations.filter((r) => r.severity === 'high').length;
    const medCount = recommendations.filter((r) => r.severity === 'medium').length;
    const summary = `Scanned ${scanResult.pages.length} pages. Found ${highCount} high-priority and ${medCount} medium-priority issues. Overall AI Visibility Score: ${scores.overall}/100.`;

    await supabase.from('audits').update({
      status: 'completed', overall_score: scores.overall,
      crawlability_score: scores.crawlability.score, machine_readability_score: scores.machineReadability.score,
      commercial_clarity_score: scores.commercialClarity.score, trust_clarity_score: scores.trustClarity.score,
      pages_scanned: scanResult.pages.length, summary, completed_at: new Date().toISOString(),
      key_pages_status: scanResult.keyPagesStatus || [],
      home_evidence: homepage?.homeEvidence || null,
      llms_txt: scanResult.llmsTxt || null,
      scanner_summary: scanResult.scannerSummary || null,
    }).eq('id', audit.id);

    // Free-sample enrichment: for a non-admin user's very first
    // site, additionally run 6-prompt AI Discovery and build the
    // 2-page shareable report. Best-effort — a failure here does
    // NOT roll back the successful technical scan, since the user
    // still has a working /site/[id] view either way.
    let shareToken: string | null = null;
    if (isFirstTimeFreeSample) {
      try {
        // enrichAsFreeSample uses the admin/service-role client
        // internally (discovery bootstrap needs elevated perms), so
        // build one here to match.
        const admin = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );
        const result = await enrichAsFreeSample(admin, site.id, audit.id);
        shareToken = result.shareToken;
      } catch (err) {
        // Log but don't fail the response — the tech scan is still
        // valid. Owner sees any surfaced failure in audit.status if
        // enrichAsFreeSample flipped it to 'failed'.
        console.error('[FREE_SAMPLE_ENRICH_ERROR]', {
          message: err instanceof Error ? err.message : String(err),
          auditId: audit.id,
          siteId: site.id,
        });
      }
    }

    return NextResponse.json({
      auditId: audit.id,
      siteId: site.id,
      score: scores.overall,
      status: 'completed',
      shareToken,
    });
  } catch (error) {
    console.error('Audit API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
