export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { scanSite } from '@/lib/scanner';
import { calculateScores, generateRecommendations, enrichWithCodeSnippets } from '@/lib/scoring';

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: NextRequest) {
  // Verify caller: Vercel Cron sets x-vercel-cron, or manual calls use Bearer token
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const authHeader = request.headers.get('authorization');
  const hasValidSecret = authHeader === `Bearer ${process.env.CRON_SECRET}`;
  if (!isVercelCron && !hasValidSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminSupabase();
  const now = new Date().toISOString();

  // Find sites due for monthly rerun
  const { data: eligibleSites, error: queryError } = await supabase
    .from('sites')
    .select('id, domain, url, user_id, monthly_scope')
    .eq('has_monthly_monitoring', true)
    .lte('next_scheduled_scan_at', now);

  if (queryError) {
    console.error('Failed to query eligible sites:', queryError);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  if (!eligibleSites || eligibleSites.length === 0) {
    return NextResponse.json({ processed: 0, succeeded: 0, failed: 0, message: 'No sites due for rerun' });
  }

  let succeeded = 0;
  let failed = 0;

  for (const site of eligibleSites) {
    try {
      const siteUrl = site.url || `https://${site.domain}`;
      const runScope = site.monthly_scope === 'core_premium' ? 'core_plus_premium' : 'core';

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

      // Create audit record
      const { data: audit, error: auditError } = await supabase
        .from('audits')
        .insert({
          site_id: site.id,
          user_id: site.user_id,
          status: 'running',
          run_type: 'monthly_auto_rerun',
          run_scope: runScope,
          previous_audit_id: previousAuditId,
        })
        .select()
        .single();

      if (auditError || !audit) {
        console.error(`Audit creation failed for site ${site.domain}:`, auditError);
        failed++;
        continue;
      }

      // Run scan
      let scanResult;
      try {
        scanResult = await scanSite(siteUrl);
      } catch (scanError) {
        console.error(`Scan failed for ${site.domain}:`, scanError);
        await supabase.from('audits').update({
          status: 'failed',
          summary: 'Monthly auto-rerun scan failed — site may be unreachable',
        }).eq('id', audit.id);
        failed++;
        // Still update next_scheduled_scan_at so we retry next month
        const nextScan = new Date();
        nextScan.setDate(nextScan.getDate() + 30);
        await supabase.from('sites').update({
          next_scheduled_scan_at: nextScan.toISOString(),
          last_auto_rerun_at: now,
        }).eq('id', site.id);
        continue;
      }

      const scores = calculateScores(scanResult);
      const rawRecommendations = generateRecommendations(scanResult);
      const recommendations = enrichWithCodeSnippets(rawRecommendations, scanResult);

      // Save pages
      if (scanResult.pages.length > 0) {
        const pageRows = scanResult.pages.map((p) => ({
          audit_id: audit.id,
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
        const { error: pagesError } = await supabase.from('audit_pages').insert(pageRows);
        if (pagesError) console.error(`Pages insert error for ${site.domain}:`, pagesError);
      }

      // Save findings and recommendations
      for (let i = 0; i < recommendations.length; i++) {
        const rec = recommendations[i];
        const { data: finding } = await supabase
          .from('audit_findings')
          .insert({
            audit_id: audit.id,
            category: rec.category,
            severity: rec.severity,
            title: rec.title,
            description: rec.whyItMatters,
            affected_urls: rec.affectedUrls,
          })
          .select()
          .single();

        await supabase.from('audit_recommendations').insert({
          audit_id: audit.id,
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

      // Update audit with scores
      const highCount = recommendations.filter((r) => r.severity === 'high').length;
      const medCount = recommendations.filter((r) => r.severity === 'medium').length;
      const summary = `Monthly rerun: Scanned ${scanResult.pages.length} pages. Found ${highCount} high-priority and ${medCount} medium-priority issues. Score: ${scores.overall}/100.`;

      await supabase.from('audits').update({
        status: 'completed',
        overall_score: scores.overall,
        crawlability_score: scores.crawlability.score,
        machine_readability_score: scores.machineReadability.score,
        commercial_clarity_score: scores.commercialClarity.score,
        trust_clarity_score: scores.trustClarity.score,
        pages_scanned: scanResult.pages.length,
        summary,
        completed_at: new Date().toISOString(),
      }).eq('id', audit.id);

      // Update site scheduling
      const nextScan = new Date();
      nextScan.setDate(nextScan.getDate() + 30);

      await supabase.from('sites').update({
        next_scheduled_scan_at: nextScan.toISOString(),
        last_auto_rerun_at: now,
      }).eq('id', site.id);

      // Create billing event for monthly renewal
      await supabase.from('billing_events').insert({
        user_id: site.user_id,
        site_id: site.id,
        audit_id: audit.id,
        event_type: 'monthly_renewal',
        amount_cents: 0, // Already paid via subscription
      });

      console.log(`Monthly rerun completed for ${site.domain}: score ${scores.overall}/100`);
      succeeded++;
    } catch (error) {
      console.error(`Unexpected error processing ${site.domain}:`, error);
      failed++;
    }
  }

  return NextResponse.json({
    processed: eligibleSites.length,
    succeeded,
    failed,
  });
}
