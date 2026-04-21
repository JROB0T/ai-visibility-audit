import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { scanSite } from '@/lib/scanner';
import { calculateScores, generateRecommendations, enrichWithCodeSnippets } from '@/lib/scoring';
import { classifyBusiness } from '@/lib/classify';
import { isAdminAccount } from '@/lib/entitlements';

export const maxDuration = 60;

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

    return NextResponse.json({ auditId: audit.id, siteId: site.id, score: scores.overall, status: 'completed' });
  } catch (error) {
    console.error('Audit API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
