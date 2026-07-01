// ============================================================
// SEVIS report repair (WO2 Task 0).
//
// The 2026-07-01 SEVIS report contradicted itself on the prompt
// "trusted caller ID for financial services": the evidence table
// said "Absent — educational answer" while page 2 and Move 05
// treated it as an indirect mention worth score 50. This script:
//
//   1. Pulls the raw discovery_results row for that prompt and
//      prints the ground truth (business_mentioned, business_cited,
//      visibility_status, position, prompt_score, raw excerpt) so
//      the operator can confirm which side of the contradiction is
//      real.
//   2. If the answer did NOT mention the business but the row is
//      scored as a mention (or vice versa), fixes the row, then
//      recomputes cluster scores, overall score, and snapshot
//      counts through the real scoring functions.
//   3. Re-renders the report (fresh narrative + template — which,
//      post-WO2, enforces the render invariants) and persists
//      report_html on the snapshot.
//
// SAFE BY DEFAULT: dry-run unless --apply is passed. Step 3 only
// runs with --apply. Run AFTER the WO2 template/narrative changes
// are merged so the re-render picks up the fixes.
//
// Usage (from project root, with prod env vars):
//   npx tsx --env-file=.env.local scripts/repair-sevis-report.ts --domain sevis.com
//   npx tsx --env-file=.env.local scripts/repair-sevis-report.ts --domain sevis.com --apply
// Optional: --run-id <run_id> to target a specific run (default: latest snapshot),
//           --prompt "<text>" to target a different prompt.
//
// Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//           ANTHROPIC_API_KEY (for the narrative re-render).
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { promptScore, clusterScore, overallDiscoveryScore, countsForSnapshot } from '../src/lib/discoveryScoring';
import { buildReportExportPayload } from '../src/lib/report/exportPayload';
import { generateReportNarrative } from '../src/lib/reportNarrative';
import { buildReportHtml } from '../src/lib/reportTemplate';
import type { DiscoveryCluster, DiscoveryResult } from '../src/lib/types';

const ALL_CLUSTERS: DiscoveryCluster[] = ['core', 'problem', 'comparison', 'long_tail', 'brand', 'adjacent'];

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}
const APPLY = process.argv.includes('--apply');
const DOMAIN = arg('domain');
const RUN_ID_ARG = arg('run-id');
const PROMPT_TEXT = arg('prompt') || 'trusted caller ID for financial services';

async function main(): Promise<void> {
  if (!DOMAIN) {
    console.error('Usage: npx tsx --env-file=.env.local scripts/repair-sevis-report.ts --domain <domain> [--run-id <id>] [--prompt "<text>"] [--apply]');
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (pass --env-file=.env.local or export them).');
    process.exit(1);
  }
  const admin = createClient(url, key);

  // ----- Resolve site + run -----
  const { data: sites } = await admin.from('sites').select('id, domain').ilike('domain', `%${DOMAIN}%`);
  if (!sites || sites.length === 0) throw new Error(`No site matching domain "${DOMAIN}"`);
  if (sites.length > 1) {
    console.log('Multiple sites match:', sites.map(s => s.domain).join(', '));
    throw new Error('Narrow --domain until exactly one site matches.');
  }
  const siteId = sites[0].id as string;
  console.log(`Site: ${sites[0].domain} (${siteId})`);

  let snapQuery = admin.from('discovery_score_snapshots').select('*').eq('site_id', siteId);
  if (RUN_ID_ARG) snapQuery = snapQuery.eq('run_id', RUN_ID_ARG);
  const { data: snaps } = await snapQuery.order('snapshot_date', { ascending: false }).limit(1);
  const snapshot = snaps?.[0];
  if (!snapshot) throw new Error('No snapshot found');
  const runId = snapshot.run_id as string;
  console.log(`Run: ${runId} · snapshot ${snapshot.snapshot_date} · overall ${snapshot.overall_score}\n`);

  // ----- Step 1: ground truth for the disputed prompt -----
  const { data: rows } = await admin
    .from('discovery_results')
    .select('*')
    .eq('site_id', siteId)
    .eq('run_id', runId)
    .ilike('prompt_text', `%${PROMPT_TEXT}%`);
  const row = (rows || [])[0] as DiscoveryResult | undefined;
  if (!row) throw new Error(`No discovery_results row matching "${PROMPT_TEXT}" in this run`);

  console.log('=== RAW RUN RECORD ===');
  console.log(`prompt_text:            ${row.prompt_text}`);
  console.log(`business_mentioned:     ${row.business_mentioned}`);
  console.log(`business_cited:         ${row.business_cited}`);
  console.log(`visibility_status:      ${row.visibility_status}`);
  console.log(`business_position_type: ${row.business_position_type}`);
  console.log(`prompt_score:           ${row.prompt_score}`);
  console.log(`result_type_summary:    ${row.result_type_summary}`);
  console.log(`raw_response_excerpt:\n---\n${(row.raw_response_excerpt || '(none)').slice(0, 1200)}\n---\n`);

  // ----- Step 2: decide + (maybe) fix -----
  // Ground truth rule: the recorded answer either names/cites the
  // business or it doesn't. business_mentioned/business_cited are the
  // detector's verdict on the stored answer; read the excerpt above to
  // confirm the detector got it right before applying.
  const hasPresence = !!(row.business_mentioned || row.business_cited);
  const scoredAsPresence = (row.prompt_score ?? 0) > 0 &&
    ['indirect_presence', 'partial_presence', 'strong_presence'].includes(row.visibility_status || '');

  if (hasPresence === scoredAsPresence) {
    console.log(hasPresence
      ? 'VERDICT: the answer DID mention the business — score 50 (indirect) is correct.'
      : 'VERDICT: the answer did NOT mention the business and is already scored as no-presence.');
    console.log('The data is internally consistent; the contradiction was the evidence-table label,');
    console.log('which the WO2 template fix resolves. Proceeding to re-render only.\n');
  } else if (!hasPresence && scoredAsPresence) {
    console.log('VERDICT: answer does NOT mention the business, but the row is scored as a mention.');
    console.log('Fix: visibility_status → absent, position → not_present, score → 0, then recompute rollups.\n');
    if (APPLY) {
      const { error } = await admin
        .from('discovery_results')
        .update({
          visibility_status: 'absent',
          business_position_type: 'not_present',
          prompt_score: 0,
          internal_notes: `${row.internal_notes ? row.internal_notes + ' · ' : ''}WO2 Task 0 repair ${new Date().toISOString().slice(0, 10)}: reclassified indirect→absent (answer does not mention business)`,
        })
        .eq('id', row.id);
      if (error) throw new Error(`Row update failed: ${error.message}`);
      console.log('Row updated.');
    } else {
      console.log('[dry-run] would update the row as above.');
    }
  } else {
    console.log('VERDICT: answer DOES mention the business, but the row is scored as absent.');
    console.log('Fix: visibility_status → indirect_presence, position → mentioned_without_preference, score → 50.\n');
    if (APPLY) {
      const { error } = await admin
        .from('discovery_results')
        .update({
          visibility_status: 'indirect_presence',
          business_position_type: 'mentioned_without_preference',
          business_mentioned: true,
          prompt_score: 50,
          internal_notes: `${row.internal_notes ? row.internal_notes + ' · ' : ''}WO2 Task 0 repair ${new Date().toISOString().slice(0, 10)}: reclassified absent→indirect (answer mentions business)`,
        })
        .eq('id', row.id);
      if (error) throw new Error(`Row update failed: ${error.message}`);
      console.log('Row updated.');
    } else {
      console.log('[dry-run] would update the row as above.');
    }
  }

  // ----- Recompute rollups from the (possibly fixed) rows -----
  const { data: allRows } = await admin
    .from('discovery_results')
    .select('*')
    .eq('site_id', siteId)
    .eq('run_id', runId)
    .eq('suppressed', false);
  const results = (allRows || []) as DiscoveryResult[];

  // Normalize any row whose stored prompt_score drifted from the rubric.
  for (const r of results) {
    const expected = promptScore(r);
    if ((r.prompt_score ?? 0) !== expected) {
      console.log(`rubric drift: "${r.prompt_text}" stored ${r.prompt_score}, rubric ${expected}`);
      if (APPLY) {
        await admin.from('discovery_results').update({ prompt_score: expected }).eq('id', r.id);
        r.prompt_score = expected;
      } else {
        console.log('[dry-run] would normalize the stored score.');
        r.prompt_score = expected; // for the preview below
      }
    }
  }

  const overall = overallDiscoveryScore(results);
  const clusterScores: Partial<Record<DiscoveryCluster, number>> = {};
  for (const c of ALL_CLUSTERS) {
    const s = clusterScore(results, c);
    if (s !== null) clusterScores[c] = s;
  }
  const counts = countsForSnapshot(results);

  console.log('\n=== RECOMPUTED SNAPSHOT ===');
  console.log(`overall: ${snapshot.overall_score} → ${overall}`);
  console.log(`clusters: ${JSON.stringify(clusterScores)}`);
  console.log(`counts: prompts=${counts.promptCount} strong=${counts.strongCount} partial=${counts.partialCount} absent=${counts.absentCount} compDom=${counts.competitorDominantCount}`);

  if (APPLY) {
    const { error } = await admin
      .from('discovery_score_snapshots')
      .update({
        overall_score: overall,
        cluster_scores: clusterScores,
        prompt_count: counts.promptCount,
        strong_count: counts.strongCount,
        partial_count: counts.partialCount,
        absent_count: counts.absentCount,
        competitor_dominant_count: counts.competitorDominantCount,
      })
      .eq('site_id', siteId)
      .eq('run_id', runId);
    if (error) throw new Error(`Snapshot update failed: ${error.message}`);
    console.log('Snapshot updated.');
  } else {
    console.log('[dry-run] would update the snapshot as above.');
  }

  // ----- Step 3: re-render (apply mode only) -----
  if (!APPLY) {
    console.log('\n[dry-run] stopping before re-render. Re-run with --apply to fix data and regenerate the report.');
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY required for the narrative re-render.');
  }

  console.log('\nRe-rendering report (fresh narrative + validated template)…');
  const { data: freshSnapRows } = await admin
    .from('discovery_score_snapshots')
    .select('*')
    .eq('site_id', siteId)
    .eq('run_id', runId)
    .limit(1);
  const freshSnap = freshSnapRows?.[0];
  if (!freshSnap) throw new Error('Snapshot vanished?');

  const payload = await buildReportExportPayload(admin, siteId, runId, freshSnap);
  const { narrative, model } = await generateReportNarrative(payload, { tier: 'tier_1' });
  const html = buildReportHtml(payload, narrative); // throws ReportInvariantError on any contradiction

  const { error: persistErr } = await admin
    .from('discovery_score_snapshots')
    .update({
      report_html: html,
      report_narrative: narrative,
      report_generated_at: new Date().toISOString(),
      report_model: model,
    })
    .eq('site_id', siteId)
    .eq('run_id', runId);
  if (persistErr) throw new Error(`Report persist failed: ${persistErr.message}`);

  console.log('Report re-rendered and persisted. Open the share link / owner view and read it against the QA invariants.');
}

main().catch(err => {
  console.error('\nFAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
