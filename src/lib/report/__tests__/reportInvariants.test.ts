// ============================================================
// Golden-report invariant harness (WO2 Task 7).
//
// Run: npm run test:report   (wired ahead of `next build`, so a
// violation blocks deploys).
//
// Hydrates the two fixture specs (fixtures/low-score.json,
// fixtures/high-score.json) into full ReportExportPayloads THROUGH
// THE REAL SCORING FUNCTIONS (promptScore / clusterScore /
// overallDiscoveryScore / countsForSnapshot), then renders both
// reports and asserts the QA invariants — plus corruption tests
// that must FAIL the render.
//
// Plain node script with assert — no test-runner dependency.
// ============================================================

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

import { buildReportHtml } from '../../reportTemplate';
import type { ReportExportPayload, ReportNarrative, ClusterKey } from '../../reportNarrative';
import {
  computeReportFacts,
  validateReportFacts,
  validateNarrativeAgainstFacts,
  applyNarrativeHygiene,
  normalizeNumericRanges,
  repairParens,
  firstSentence,
  tidyPlanSummary,
  derivePresenceLevel,
  bandForScore,
  PRESENCE_RUBRIC,
  CLUSTER_WEIGHTS,
  ReportInvariantError,
} from '../reportFacts';
import {
  promptScore,
  clusterScore,
  overallDiscoveryScore,
  countsForSnapshot,
  visibilityDistribution,
} from '../../discoveryScoring';
import { DEFAULT_DISCOVERY_CLUSTER_WEIGHTS } from '../../discovery';
import { SCAN_PROMPT_COUNT, SCAN_CLUSTER_QUOTA } from '../../productConstants';
import { clusterDistributionTargets } from '../../discovery';
import type { DiscoveryResult, DiscoveryVisibilityStatus, DiscoveryPositionType } from '../../types';

let passed = 0;
function ok(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

function expectInvariantError(name: string, fn: () => void): void {
  ok(name, () => {
    let threw = false;
    try {
      fn();
    } catch (err) {
      threw = true;
      assert.ok(err instanceof ReportInvariantError, `expected ReportInvariantError, got ${(err as Error).name}: ${(err as Error).message}`);
    }
    assert.ok(threw, 'expected the render to be rejected, but it succeeded');
  });
}

// ------------------------------------------------------------
// Fixture hydration — spec → full payload via the real engine math.
// ------------------------------------------------------------

interface FixtureSpec {
  meta: { business_name: string; domain: string; primary_category: string; service_area: string };
  prompts: Array<{
    text: string; cluster: ClusterKey; priority: 'high' | 'medium' | 'low';
    status: string; position: string; mentioned: boolean; cited: boolean;
    competitors: string[]; directories: string[];
  }>;
  competitors: Array<{ name: string; domain: string; appears_on: string[] }>;
  narrative: ReportNarrative;
}

function scoreToGrade(score: number): string {
  if (score >= 97) return 'A+';
  if (score >= 93) return 'A';
  if (score >= 90) return 'A-';
  if (score >= 87) return 'B+';
  if (score >= 83) return 'B';
  if (score >= 80) return 'B-';
  if (score >= 77) return 'C+';
  if (score >= 73) return 'C';
  if (score >= 70) return 'C-';
  if (score >= 67) return 'D+';
  if (score >= 63) return 'D';
  if (score >= 60) return 'D-';
  return 'F';
}

const CLUSTERS: ClusterKey[] = ['core', 'problem', 'comparison', 'long_tail', 'brand', 'adjacent'];

function hydrate(spec: FixtureSpec): { payload: ReportExportPayload; narrative: ReportNarrative } {
  // Minimal DiscoveryResult rows — enough for the scoring functions.
  const results = spec.prompts.map((p, i) => ({
    id: `fixture-${i}`,
    suppressed: false,
    prompt_cluster: p.cluster,
    visibility_status: p.status as DiscoveryVisibilityStatus,
    business_position_type: p.position as DiscoveryPositionType,
  })) as unknown as DiscoveryResult[];

  const clusterScores: Record<ClusterKey, number | null> = {
    core: null, problem: null, comparison: null, long_tail: null, brand: null, adjacent: null,
  };
  for (const c of CLUSTERS) clusterScores[c] = clusterScore(results, c);
  const overall = overallDiscoveryScore(results);
  const counts = countsForSnapshot(results);

  const payload: ReportExportPayload = {
    meta: {
      site_id: 'fixture-site',
      run_id: 'fixture-run',
      business_name: spec.meta.business_name,
      domain: spec.meta.domain,
      primary_category: spec.meta.primary_category,
      service_area: spec.meta.service_area,
      tier: 'full',
      snapshot_date: '2026-07-01T00:00:00.000Z',
      report_generated_at: '2026-07-01T00:00:00.000Z',
      prompt_count: counts.promptCount,
    },
    scores: {
      overall_score: overall,
      overall_grade: scoreToGrade(overall),
      cluster_scores: clusterScores,
      visibility_distribution: visibilityDistribution(results) as unknown as Record<string, number>,
      counts: {
        prompt_count: counts.promptCount,
        strong_count: counts.strongCount,
        partial_count: counts.partialCount,
        absent_count: counts.absentCount,
        competitor_dominant_count: counts.competitorDominantCount,
      },
    },
    prompts_tested: spec.prompts.map((p, i) => ({
      id: `fixture-${i}`,
      prompt_text: p.text,
      cluster: p.cluster,
      priority: p.priority,
      score: promptScore(results[i]),
      visibility_status: p.status,
      business_position_type: p.position,
      business_mentioned: p.mentioned,
      business_cited: p.cited,
      result_type_summary: null,
      normalized_response_summary: null,
      raw_response_excerpt: 'For this category, several providers are commonly recommended based on availability and reviews.',
      competitor_names_detected: p.competitors,
      competitor_domains_detected: [],
      directories_detected: p.directories,
      marketplaces_detected: [],
      confidence_score: 0.9,
    })),
    competitors: spec.competitors.map((c, i) => {
      const appearances = spec.prompts.filter(p => c.appears_on.includes(p.text));
      const wins = appearances.filter(p => !p.mentioned && !p.cited);
      return {
        id: `fixture-comp-${i}`,
        name: c.name,
        domain: c.domain,
        times_appeared: appearances.length,
        times_beat_us: wins.length,
        prompts_where_they_won: wins.map(p => ({
          prompt_text: p.text,
          cluster: p.cluster,
          visibility_status: p.status as never,
        })),
      };
    }),
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

  return { payload, narrative: spec.narrative };
}

function loadFixture(name: string): { payload: ReportExportPayload; narrative: ReportNarrative } {
  const raw = fs.readFileSync(path.join(process.cwd(), 'fixtures', name), 'utf-8');
  return hydrate(JSON.parse(raw) as FixtureSpec);
}

function visibleText(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

// ============================================================
console.log('reportInvariants: engine/config sync');
// ============================================================

ok('presence rubric matches promptScore for every status/position combo', () => {
  const statuses: DiscoveryVisibilityStatus[] = ['strong_presence', 'partial_presence', 'indirect_presence', 'competitor_dominant', 'directory_dominant', 'absent', 'unclear'];
  const positions: (DiscoveryPositionType | null)[] = ['directly_recommended', 'listed_among_options', 'cited_as_source', 'mentioned_without_preference', 'implied_only', 'not_present', null];
  for (const s of statuses) {
    for (const p of positions) {
      const engine = promptScore({ visibility_status: s, business_position_type: p } as never);
      const rubric = PRESENCE_RUBRIC[derivePresenceLevel(s, p)].score;
      assert.strictEqual(rubric, engine, `status=${s} position=${p}: rubric ${rubric} != engine ${engine}`);
    }
  }
});

ok('CLUSTER_WEIGHTS mirrors DEFAULT_DISCOVERY_CLUSTER_WEIGHTS', () => {
  assert.deepStrictEqual(CLUSTER_WEIGHTS, DEFAULT_DISCOVERY_CLUSTER_WEIGHTS);
});

ok('scan quota sums to the marketed prompt count and fits the library minimums', () => {
  const sum = Object.values(SCAN_CLUSTER_QUOTA).reduce((a, b) => a + b, 0);
  assert.strictEqual(sum, SCAN_PROMPT_COUNT);
  for (const c of CLUSTERS) {
    assert.ok(
      SCAN_CLUSTER_QUOTA[c] <= clusterDistributionTargets[c].max,
      `quota for ${c} exceeds what the library generator can produce`,
    );
  }
});

ok('band boundaries', () => {
  assert.strictEqual(bandForScore(0), 'needs_foundation');
  assert.strictEqual(bandForScore(20), 'needs_foundation');
  assert.strictEqual(bandForScore(21), 'building');
  assert.strictEqual(bandForScore(45), 'building');
  assert.strictEqual(bandForScore(46), 'contending');
  assert.strictEqual(bandForScore(70), 'contending');
  assert.strictEqual(bandForScore(71), 'leading');
  assert.strictEqual(bandForScore(100), 'leading');
});

// ============================================================
console.log('reportInvariants: text hygiene');
// ============================================================

ok('numeric ranges normalize so a lost dash can never read "23"', () => {
  assert.strictEqual(normalizeNumericRanges('first appearances in 2–3 problem queries'), 'first appearances in 2 to 3 problem queries');
  assert.strictEqual(normalizeNumericRanges('a 2—3 point move'), 'a 2 to 3 point move');
  assert.strictEqual(normalizeNumericRanges('scored 89–92 this quarter'), 'scored 89 to 92 this quarter');
  assert.strictEqual(normalizeNumericRanges('the em dash — stays for prose'), 'the em dash — stays for prose');
});

ok('unbalanced parens are repaired per block', () => {
  assert.strictEqual(repairParens('earned partial credit (score 50.'), 'earned partial credit score 50.');
  assert.strictEqual(repairParens('Enterprise Identity Management EIM) is the category'), 'Enterprise Identity Management EIM is the category');
  assert.strictEqual(repairParens('balanced (as it should be) text'), 'balanced (as it should be) text');
});

ok('timeline summaries never clip on abbreviations like "G2."', () => {
  const desc = 'Publish comparison content with pricing signals surfaced g2. after move 01 this compounds.';
  const s = firstSentence(desc);
  assert.ok(!/^.*surfaced g2\.$/.test(s) || s.includes('after'), `clipped at abbreviation: "${s}"`);
  assert.ok(/[.!?]$/.test(s), 'summary must end with terminal punctuation');
  assert.ok(/[.!?]$/.test(tidyPlanSummary('a summary with no period')), 'tidyPlanSummary appends punctuation');
  assert.ok(tidyPlanSummary('x'.repeat(300)).length <= 141, 'tidyPlanSummary enforces max length');
});

// ============================================================
console.log('reportInvariants: low-score fixture (SEVIS shape)');
// ============================================================

const low = loadFixture('low-score.json');
const lowFacts = computeReportFacts(low.payload);

ok('low fixture hydrates to the SEVIS shape', () => {
  assert.strictEqual(lowFacts.promptCount, 19);
  assert.strictEqual(lowFacts.presenceCount, 2);
  assert.ok(lowFacts.overallScore <= 10, `expected single-digit overall, got ${lowFacts.overallScore}`);
  assert.strictEqual(lowFacts.band, 'needs_foundation');
  assert.strictEqual(lowFacts.highPriorityTotal, 6);
  assert.strictEqual(lowFacts.highPriorityWithPresence, 1);
  assert.strictEqual(lowFacts.highPriorityAbsent, 5);
  assert.strictEqual(lowFacts.rivalWins, 1);
  assert.strictEqual(lowFacts.repeatRivalCount, 0);
});

let lowHtml = '';
ok('low fixture renders (all invariants hold)', () => {
  lowHtml = buildReportHtml(low.payload, low.narrative);
  assert.ok(lowHtml.includes('How to read the scores'), 'definitions block missing');
});

ok('low-band render contains no leader/defense language', () => {
  const text = visibleText(lowHtml);
  for (const phrase of ['category leader', 'Signature of a category leader', 'defend your position', 'Defend & Expand', 'Defend &amp; Expand']) {
    assert.ok(!text.toLowerCase().includes(phrase.toLowerCase()), `found forbidden phrase: ${phrase}`);
  }
});

ok('low-band render reads the empty field as an open category', () => {
  const text = visibleText(lowHtml);
  assert.ok(/unclaimed, not led/.test(text), 'repeat-rivals panel missing the open-category variant');
  assert.ok(text.includes('Build &amp; Claim') || text.includes('Build & Claim'), 'posture should be Build & Claim');
});

ok('score-50 rows are labeled with partial credit, never "Absent"', () => {
  // The financial-services prompt: indirect presence, score 50.
  assert.ok(lowHtml.includes('Mentioned, no preference'), 'expected the mentioned label in the evidence table');
});

ok('distribution percentages sum to 100', () => {
  const { strong, partial, other, absent } = lowFacts.distributionPct;
  assert.strictEqual(strong + partial + other + absent, 100);
});

ok('radar caption states its formula', () => {
  assert.ok(/avg of \d+ cluster score/.test(lowHtml), 'radar caption with formula missing');
});

ok('timeline dependencies render on their own line', () => {
  assert.ok(lowHtml.includes('<div class="dep">After Move 01</div>'), 'dependency line missing or inline');
});

// ============================================================
console.log('reportInvariants: high-score fixture');
// ============================================================

const high = loadFixture('high-score.json');
const highFacts = computeReportFacts(high.payload);

ok('high fixture hydrates to the leading band', () => {
  assert.ok(highFacts.overallScore >= 80, `expected >= 80, got ${highFacts.overallScore}`);
  assert.strictEqual(highFacts.band, 'leading');
  assert.strictEqual(highFacts.promptCount, SCAN_PROMPT_COUNT);
  assert.strictEqual(highFacts.rivalWins, 0);
  assert.strictEqual(highFacts.repeatRivalCount, 1);
});

let highHtml = '';
ok('high fixture renders (all invariants hold)', () => {
  highHtml = buildReportHtml(high.payload, high.narrative);
});

ok('leader language appears in the leading-band render (and only there)', () => {
  const text = visibleText(highHtml);
  assert.ok(/category leader/i.test(text), 'expected leader language at band Leading');
  assert.ok(text.includes('Defend &amp; Expand') || text.includes('Defend & Expand'), 'posture should be Defend & Expand');
});

// ============================================================
console.log('reportInvariants: corruption tests (must FAIL the render)');
// ============================================================

expectInvariantError('score 50 marked Absent cannot render', () => {
  const corrupted = clone(low.payload);
  const target = corrupted.prompts_tested.find(p => p.visibility_status === 'absent')!;
  target.score = 50; // presence stays absent
  buildReportHtml(corrupted, clone(low.narrative));
});

expectInvariantError('LEADING panel copy forced into a low-band narrative cannot render', () => {
  const corrupted = clone(low.narrative);
  corrupted.verdict_paragraph += ' Signature of a category leader, not a contested market.';
  buildReportHtml(clone(low.payload), corrupted);
});

expectInvariantError('mismatched high-priority counts in narrative cannot render', () => {
  const corrupted = clone(low.narrative);
  // Facts say 1-of-6 / 5-of-6; claim 0 of 6 (the SEVIS "0/5 vs 1 of 6" class of bug).
  corrupted.take_watch.body = 'Zero presence: 0 of 6 high-priority queries returned the business.';
  buildReportHtml(clone(low.payload), corrupted);
});

expectInvariantError('snapshot counts that disagree with results cannot render', () => {
  const corrupted = clone(low.payload);
  corrupted.scores.counts.prompt_count = corrupted.scores.counts.prompt_count + 1;
  buildReportHtml(corrupted, clone(low.narrative));
});

expectInvariantError('cluster score that is not the member mean cannot render', () => {
  const corrupted = clone(low.payload);
  corrupted.scores.cluster_scores.core = 55; // members are all absent (0)
  buildReportHtml(corrupted, clone(low.narrative));
});

ok('plan summary lacking terminal punctuation is caught raw, repaired by hygiene', () => {
  const corrupted = clone(low.narrative);
  (corrupted.defense_moves[0] as { plan_summary: string }).plan_summary = 'publish one page per query with no period';
  // Raw validation (pre-hygiene) must flag it…
  assert.throws(
    () => validateNarrativeAgainstFacts(corrupted, lowFacts),
    ReportInvariantError,
  );
  // …and the render pipeline repairs it deterministically.
  const html = buildReportHtml(clone(low.payload), corrupted);
  assert.ok(html.includes('publish one page per query with no period.'), 'hygiene should append terminal punctuation');
});

ok('validateReportFacts passes on both healthy fixtures', () => {
  validateReportFacts(lowFacts, low.payload);
  validateReportFacts(highFacts, high.payload);
  applyNarrativeHygiene(low.narrative);
});

console.log(`\nreportInvariants: ${passed} checks passed`);
