// ============================================================
// ReportFacts — the single source of truth for every number a
// report prints (WO2 Task 1).
//
// All derived numbers are computed ONCE here, before any narrative
// generation. The narrative layer (LLM) receives these facts in its
// prompt and may only restate them; the template reads them from
// Ctx.facts. Nothing downstream re-derives a count.
//
// validateReportFacts() enforces the render-time invariants from
// the QA list (snippets/qa-invariants.md in WO2): a report that
// violates them throws ReportInvariantError, which fails the
// discovery job BEFORE report_html is persisted — so a
// contradictory report can never be emailed or exported to PDF.
//
// Relative imports only (no '@/'): this module and its dependency
// graph are executed by the standalone test harness
// (npm run test:report) outside the Next.js resolver.
// ============================================================

import type { ReportExportPayload, ReportNarrative, ClusterKey } from '../reportNarrative';

// ------------------------------------------------------------
// Presence levels — the ONE vocabulary for "how you showed up".
// Derived from (visibility_status, business_position_type) exactly
// the way promptScore() in discoveryScoring.ts assigns credit, so
// a level always agrees with its score. The old template derived
// its table labels from position_type alone, which let an
// `unclear` row (score 50, position not_present) print "Absent"
// next to a nonzero score — the SEVIS contradiction.
// ------------------------------------------------------------

export type PresenceLevel =
  | 'recommended_first'   // 100 — strong_presence, named first / sole answer
  | 'listed_cited'        //  90 — strong_presence, listed among options with citation
  | 'cited_source'        //  80 — partial_presence, linked but not named
  | 'listed_option'       //  75 — partial_presence, named among options
  | 'mentioned'           //  50 — indirect_presence, named without citation
  | 'unclear'             //  50 — answer could not be classified (neutral credit)
  | 'rival_answered'      //  25 — competitor_dominant
  | 'directory_answered'  //  25 — directory_dominant
  | 'absent';             //   0 — not present at all

export const PRESENCE_RUBRIC: Record<PresenceLevel, { score: number; label: string; definition: string }> = {
  recommended_first:  { score: 100, label: 'Recommended first',          definition: 'named as a first-choice answer, with your site cited' },
  listed_cited:       { score: 90,  label: 'Listed as option (cited)',   definition: 'named among recommended options, with your site cited' },
  cited_source:       { score: 80,  label: 'Cited as source',            definition: 'your site was linked but the business was not named' },
  listed_option:      { score: 75,  label: 'Listed as option',           definition: 'named among options' },
  mentioned:          { score: 50,  label: 'Mentioned, no preference',   definition: 'named without a link or endorsement' },
  unclear:            { score: 50,  label: 'Unclear (partial credit)',   definition: 'the answer could not be classified; scored neutrally, flagged for review' },
  rival_answered:     { score: 25,  label: 'Rivals answered instead',    definition: 'you were absent; named competitors filled the answer' },
  directory_answered: { score: 25,  label: 'Directories answered instead', definition: 'you were absent; directories filled the answer' },
  absent:             { score: 0,   label: 'Absent',                     definition: 'not present in the answer' },
};

export function derivePresenceLevel(
  visibilityStatus: string,
  positionType: string | null,
): PresenceLevel {
  switch (visibilityStatus) {
    case 'strong_presence':
      return positionType === 'listed_among_options' ? 'listed_cited' : 'recommended_first';
    case 'partial_presence':
      return positionType === 'cited_as_source' ? 'cited_source' : 'listed_option';
    case 'indirect_presence':
      return 'mentioned';
    case 'competitor_dominant':
      return 'rival_answered';
    case 'directory_dominant':
      return 'directory_answered';
    case 'absent':
      return 'absent';
    case 'unclear':
    default:
      return 'unclear';
  }
}

// ------------------------------------------------------------
// Score bands (WO2 Task 3). One banding system, used by the copy
// layer, the narrative-prompt constraints, and the invariants.
// The letter grade (scoreToGrade) is a separate, finer display
// scale; the band governs interpretive TONE.
// ------------------------------------------------------------

export type ScoreBand = 'needs_foundation' | 'building' | 'contending' | 'leading';

export const BAND_INFO: Record<ScoreBand, { label: string; posture: string; min: number; max: number }> = {
  needs_foundation: { label: 'Needs Foundation', posture: 'Build & Claim',        min: 0,  max: 20 },
  building:         { label: 'Building',         posture: 'Publish & Contest',    min: 21, max: 45 },
  contending:       { label: 'Contending',       posture: 'Consolidate & Extend', min: 46, max: 70 },
  leading:          { label: 'Leading',          posture: 'Defend & Expand',      min: 71, max: 100 },
};

export function bandForScore(score: number): ScoreBand {
  if (score <= 20) return 'needs_foundation';
  if (score <= 45) return 'building';
  if (score <= 70) return 'contending';
  return 'leading';
}

// Phrases that may only describe the client when band === 'leading'
// (QA invariant 13). Checked against narrative fields and the final
// rendered text. Deliberately limited to unambiguous client-leadership
// claims: bare "dominant" is banned at the prompt-instruction level
// instead, because "rivals dominate these queries" is legitimate (and
// accurate) copy for a low-band report and must not fail the render.
const LEADER_PHRASES = [
  /category leader/i,
  /signature of a[^.]{0,40}leader/i,
  /defend your position/i,
  /defend & expand/i,
];

// ------------------------------------------------------------
// The facts object.
// ------------------------------------------------------------

export interface PromptFact {
  id: string;
  promptText: string;
  cluster: ClusterKey;
  priority: 'high' | 'medium' | 'low';
  score: number;
  presenceLevel: PresenceLevel;
  presenceLabel: string;
  /** Business was named or cited in the answer. */
  hasPresence: boolean;
  hasCitation: boolean;
  rivalsNamed: string[];
  directoriesNamed: string[];
  isPurchaseIntent: boolean;
}

export interface ReportFacts {
  overallScore: number;
  overallGrade: string;
  band: ScoreBand;
  bandLabel: string;
  postureLabel: string;

  clusterScores: Record<ClusterKey, number | null>;
  /** Simple average of the measured (non-null) cluster scores — the radar caption value. */
  radarAverage: number;
  measuredClusterCount: number;

  promptCount: number;
  prompts: PromptFact[];

  // Presence distribution (the page-2 strip). Buckets partition promptCount.
  strongCount: number;     // recommended_first + listed_cited
  partialCount: number;    // cited_source + listed_option + mentioned
  otherCount: number;      // unclear + rival_answered + directory_answered
  absentCount: number;     // absent
  distributionPct: { strong: number; partial: number; other: number; absent: number };

  presenceCount: number;   // prompts where the business appeared at all

  highPriorityTotal: number;
  highPriorityWithPresence: number;
  highPriorityAbsent: number;   // no presence (includes rival/directory-answered and unclear-without-mention)

  promptsWithCitation: number;

  /** Prompts where a named rival appeared and the business did not — the rival holds the slot. */
  rivalWins: number;
  /** Prompts where any named rival appeared, win or not. */
  rivalMentions: number;
  repeatRivalCount: number;
  topRepeatRival: { name: string; timesAppeared: number } | null;

  directoryOnPurchaseIntent: number;
  directoryRisk: 'Low' | 'Medium' | 'High';
}

const CLUSTERS: ClusterKey[] = ['core', 'problem', 'comparison', 'long_tail', 'brand', 'adjacent'];

// Overall-score weights — MUST mirror DEFAULT_DISCOVERY_CLUSTER_WEIGHTS
// in discovery.ts (kept as a literal here to keep this module's import
// graph free of app-alias modules; the test harness asserts they match).
export const CLUSTER_WEIGHTS: Record<ClusterKey, number> = {
  core: 0.30,
  problem: 0.20,
  comparison: 0.20,
  long_tail: 0.15,
  brand: 0.10,
  adjacent: 0.05,
};

/** Largest-remainder rounding so percentage buckets always sum to exactly 100. */
function percentages(counts: number[], total: number): number[] {
  if (total <= 0) return counts.map(() => 0);
  const raw = counts.map(c => (c / total) * 100);
  const floors = raw.map(Math.floor);
  let remainder = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floors];
  for (const { i } of order) {
    if (remainder <= 0) break;
    out[i]++;
    remainder--;
  }
  return out;
}

export function computeReportFacts(payload: ReportExportPayload): ReportFacts {
  const prompts: PromptFact[] = payload.prompts_tested.map(pr => {
    const level = derivePresenceLevel(pr.visibility_status, pr.business_position_type);
    return {
      id: pr.id,
      promptText: pr.prompt_text,
      cluster: pr.cluster,
      priority: pr.priority,
      score: pr.score,
      presenceLevel: level,
      presenceLabel: PRESENCE_RUBRIC[level].label,
      hasPresence: !!(pr.business_mentioned || pr.business_cited),
      hasCitation: !!pr.business_cited,
      rivalsNamed: pr.competitor_names_detected || [],
      directoriesNamed: pr.directories_detected || [],
      isPurchaseIntent: pr.cluster !== 'brand' && !pr.prompt_text.toLowerCase().includes('review'),
    };
  });

  const promptCount = prompts.length;
  const byLevel = (levels: PresenceLevel[]) => prompts.filter(p => levels.includes(p.presenceLevel)).length;

  const strongCount = byLevel(['recommended_first', 'listed_cited']);
  const partialCount = byLevel(['cited_source', 'listed_option', 'mentioned']);
  const otherCount = byLevel(['unclear', 'rival_answered', 'directory_answered']);
  const absentCount = byLevel(['absent']);

  const [pctStrong, pctPartial, pctOther, pctAbsent] = percentages(
    [strongCount, partialCount, otherCount, absentCount], promptCount,
  );

  const highPriority = prompts.filter(p => p.priority === 'high');
  const highPriorityWithPresence = highPriority.filter(p => p.hasPresence).length;

  const rivalWins = prompts.filter(p => !p.hasPresence && p.rivalsNamed.length > 0).length;
  const rivalMentions = prompts.filter(p => p.rivalsNamed.length > 0).length;

  const repeatRivals = payload.competitors.filter(c => c.times_appeared >= 2);
  const topRepeat = repeatRivals.slice().sort((a, b) => b.times_appeared - a.times_appeared)[0] || null;

  const purchaseIntent = prompts.filter(p => p.isPurchaseIntent);
  const directoryOnPurchaseIntent = purchaseIntent.filter(p => p.directoriesNamed.length > 0).length;
  const dirRatio = purchaseIntent.length ? directoryOnPurchaseIntent / purchaseIntent.length : 0;
  const directoryRisk: ReportFacts['directoryRisk'] =
    dirRatio >= 0.30 ? 'High' : dirRatio >= 0.10 ? 'Medium' : 'Low';

  const clusterScores = payload.scores.cluster_scores;
  const measured = CLUSTERS.map(c => clusterScores[c]).filter((v): v is number => typeof v === 'number');
  const radarAverage = measured.length
    ? Math.round(measured.reduce((a, b) => a + b, 0) / measured.length)
    : 0;

  const overallScore = payload.scores.overall_score;
  const band = bandForScore(overallScore);

  return {
    overallScore,
    overallGrade: payload.scores.overall_grade,
    band,
    bandLabel: BAND_INFO[band].label,
    postureLabel: BAND_INFO[band].posture,
    clusterScores,
    radarAverage,
    measuredClusterCount: measured.length,
    promptCount,
    prompts,
    strongCount,
    partialCount,
    otherCount,
    absentCount,
    distributionPct: { strong: pctStrong, partial: pctPartial, other: pctOther, absent: pctAbsent },
    presenceCount: prompts.filter(p => p.hasPresence).length,
    highPriorityTotal: highPriority.length,
    highPriorityWithPresence,
    highPriorityAbsent: highPriority.length - highPriorityWithPresence,
    promptsWithCitation: prompts.filter(p => p.hasCitation).length,
    rivalWins,
    rivalMentions,
    repeatRivalCount: repeatRivals.length,
    topRepeatRival: topRepeat ? { name: topRepeat.name, timesAppeared: topRepeat.times_appeared } : null,
    directoryOnPurchaseIntent,
    directoryRisk,
  };
}

// ------------------------------------------------------------
// Invariants (QA list, "Data consistency" + "Count reconciliation").
// Collect ALL violations, then throw once — a failed render should
// tell the operator everything that's wrong, not one thing at a time.
// ------------------------------------------------------------

export class ReportInvariantError extends Error {
  violations: string[];
  constructor(violations: string[]) {
    super(`Report failed ${violations.length} render invariant${violations.length === 1 ? '' : 's'}:\n- ${violations.join('\n- ')}`);
    this.name = 'ReportInvariantError';
    this.violations = violations;
  }
}

export function validateReportFacts(facts: ReportFacts, payload: ReportExportPayload): void {
  const v: string[] = [];

  for (const p of facts.prompts) {
    // 1. score > 0 ⟺ presenceLevel != absent
    if (p.score > 0 && p.presenceLevel === 'absent') {
      v.push(`prompt "${p.promptText}": score ${p.score} but presence level Absent`);
    }
    if (p.score === 0 && p.presenceLevel !== 'absent') {
      v.push(`prompt "${p.promptText}": score 0 but presence level ${p.presenceLabel}`);
    }
    // 2. presence level maps to its rubric score exactly
    const expected = PRESENCE_RUBRIC[p.presenceLevel].score;
    if (p.score !== expected) {
      v.push(`prompt "${p.promptText}": score ${p.score} does not match rubric ${expected} for ${p.presenceLabel}`);
    }
  }

  // 4. cluster score = mean of member prompt scores (± rounding)
  for (const c of CLUSTERS) {
    const stored = facts.clusterScores[c];
    const members = facts.prompts.filter(p => p.cluster === c);
    if (members.length === 0) {
      if (typeof stored === 'number') {
        v.push(`cluster ${c}: stored score ${stored} but no prompts in cluster`);
      }
      continue;
    }
    if (typeof stored !== 'number') {
      v.push(`cluster ${c}: has ${members.length} prompts but no stored score`);
      continue;
    }
    const mean = Math.round(members.reduce((a, p) => a + p.score, 0) / members.length);
    if (Math.abs(stored - mean) > 1) {
      v.push(`cluster ${c}: stored score ${stored} != computed mean ${mean}`);
    }
  }

  // 5. overall score matches the documented weighted formula
  const contributions = CLUSTERS
    .map(c => ({ w: CLUSTER_WEIGHTS[c], s: facts.clusterScores[c] }))
    .filter((x): x is { w: number; s: number } => typeof x.s === 'number');
  if (contributions.length > 0) {
    const totalW = contributions.reduce((a, x) => a + x.w, 0);
    const expectedOverall = Math.round(contributions.reduce((a, x) => a + x.s * x.w, 0) / totalW);
    if (Math.abs(facts.overallScore - expectedOverall) > 1) {
      v.push(`overall score ${facts.overallScore} != weighted cluster formula ${expectedOverall}`);
    }
  }

  // 7. distribution buckets partition promptCount and pcts sum to 100
  const bucketSum = facts.strongCount + facts.partialCount + facts.otherCount + facts.absentCount;
  if (bucketSum !== facts.promptCount) {
    v.push(`distribution buckets sum to ${bucketSum}, expected ${facts.promptCount}`);
  }
  const pctSum = facts.distributionPct.strong + facts.distributionPct.partial + facts.distributionPct.other + facts.distributionPct.absent;
  if (facts.promptCount > 0 && pctSum !== 100) {
    v.push(`distribution percentages sum to ${pctSum}, expected 100`);
  }

  // 8. high-priority partition
  if (facts.highPriorityWithPresence + facts.highPriorityAbsent !== facts.highPriorityTotal) {
    v.push(`high-priority counts do not partition: ${facts.highPriorityWithPresence} + ${facts.highPriorityAbsent} != ${facts.highPriorityTotal}`);
  }

  // 11. citation count bounded
  if (facts.promptsWithCitation > facts.promptCount) {
    v.push(`promptsWithCitation ${facts.promptsWithCitation} > promptCount ${facts.promptCount}`);
  }

  // 10. rival wins ≤ rival mentions
  if (facts.rivalWins > facts.rivalMentions) {
    v.push(`rivalWins ${facts.rivalWins} > rivalMentions ${facts.rivalMentions}`);
  }

  // Snapshot counts (the stored row) must agree with per-prompt derivation.
  const c = payload.scores.counts;
  if (c.prompt_count !== facts.promptCount) {
    v.push(`snapshot prompt_count ${c.prompt_count} != results count ${facts.promptCount}`);
  }

  if (v.length > 0) throw new ReportInvariantError(v);
}

// ------------------------------------------------------------
// Narrative hygiene (WO2 Task 4.2 / invariants 15-17).
// Deterministic REPAIRS for typography the LLM (or a downstream
// glyph pipeline) gets wrong; hard data contradictions still fail
// via validateNarrativeAgainstFacts below.
// ------------------------------------------------------------

/** "2–3" / "2—3" → "2 to 3" so a lost dash can never silently produce "23". */
export function normalizeNumericRanges(s: string): string {
  return s.replace(/(\d)\s*[–—]\s*(\d)/g, '$1 to $2');
}

/** Drop unmatched parens within a text block (cheap per-paragraph balance repair). */
export function repairParens(s: string): string {
  const chars = s.split('');
  const stack: number[] = [];
  const drop = new Set<number>();
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === '(') stack.push(i);
    else if (chars[i] === ')') {
      if (stack.length === 0) drop.add(i);
      else stack.pop();
    }
  }
  for (const i of stack) drop.add(i);
  if (drop.size === 0) return s;
  return chars
    .filter((_, i) => !drop.has(i))
    .join('')
    .replace(/ {2,}/g, ' ')
    .replace(/\s+([.,;:])/g, '$1');
}

/** Ensure a plan/timeline summary reads as a complete sentence ≤ maxChars. */
export function tidyPlanSummary(s: string, maxChars = 140): string {
  let out = s.replace(/\s+/g, ' ').trim();
  if (out.length > maxChars) {
    out = out.slice(0, maxChars - 1).replace(/\s+\S*$/, '');
    out = out.replace(/[,;:\s]+$/, '');
  }
  if (!/[.!?]$/.test(out)) out += '.';
  return out;
}

/**
 * First sentence of a move description for the timeline view — used as
 * fallback when a narrative predates the plan_summary field. Splits on
 * sentence boundaries followed by a capital letter, so "surfaced G2. after"
 * style abbreviation breaks don't clip mid-thought the way a naive
 * split('.') did.
 */
export function firstSentence(s: string): string {
  const cleaned = s.replace(/\s+/g, ' ').trim();
  const m = cleaned.match(/^.+?[.!?](?=\s+[A-Z"“]|\s*$)/);
  return tidyPlanSummary(m ? m[0] : cleaned);
}

function walkStrings<T>(obj: T, fn: (s: string) => string): T {
  if (typeof obj === 'string') return fn(obj) as unknown as T;
  if (Array.isArray(obj)) return obj.map(x => walkStrings(x, fn)) as unknown as T;
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(obj as Record<string, unknown>)) {
      out[k] = walkStrings(val, fn);
    }
    return out as unknown as T;
  }
  return obj;
}

/** Apply all deterministic text repairs to every string field of the narrative. */
export function applyNarrativeHygiene(narrative: ReportNarrative): ReportNarrative {
  const cleaned = walkStrings(narrative, s => repairParens(normalizeNumericRanges(s)));
  // Plan summaries get the stricter complete-sentence treatment.
  for (const move of [...cleaned.defense_moves, ...cleaned.expansion_moves]) {
    const m = move as { plan_summary?: string };
    if (typeof m.plan_summary === 'string' && m.plan_summary.trim().length > 0) {
      m.plan_summary = tidyPlanSummary(m.plan_summary);
    }
  }
  return cleaned;
}

// ------------------------------------------------------------
// Narrative-vs-facts validation (invariants 9, 12-14 and the
// count-reconciliation rules). Runs AFTER hygiene, BEFORE render.
// ------------------------------------------------------------

function narrativeStrings(narrative: ReportNarrative): Array<{ field: string; text: string }> {
  const out: Array<{ field: string; text: string }> = [];
  const visit = (val: unknown, path: string) => {
    if (typeof val === 'string') out.push({ field: path, text: val });
    else if (Array.isArray(val)) val.forEach((x, i) => visit(x, `${path}[${i}]`));
    else if (val && typeof val === 'object') {
      for (const [k, v2] of Object.entries(val as Record<string, unknown>)) visit(v2, path ? `${path}.${k}` : k);
    }
  };
  visit(narrative, '');
  return out;
}

export function validateNarrativeAgainstFacts(narrative: ReportNarrative, facts: ReportFacts): void {
  const v: string[] = [];
  const fields = narrativeStrings(narrative);

  // 13. Leader language forbidden below the Leading band.
  if (facts.band !== 'leading') {
    for (const { field, text } of fields) {
      for (const re of LEADER_PHRASES) {
        if (re.test(text)) {
          v.push(`band is ${facts.bandLabel} but ${field} contains leader language: ${re}`);
        }
      }
    }
  }

  // 14. Needs Foundation verdict must carry the open-window sentence.
  if (facts.band === 'needs_foundation') {
    const verdict = narrative.verdict_paragraph || '';
    if (!/(open|opportun|unclaimed|window|first[- ]mover|inherit)/i.test(verdict)) {
      v.push('band is Needs Foundation but the verdict has no open-category / opportunity sentence');
    }
  }

  // 12. Strategic posture must be the banded label.
  const expectedPosture = facts.postureLabel.toLowerCase();
  if ((narrative.strategic_posture || '').toLowerCase().trim() !== expectedPosture) {
    v.push(`strategic_posture "${narrative.strategic_posture}" != banded posture "${facts.postureLabel}"`);
  }

  // 9. "X of N" / "X / N" claims: when N equals one of our known
  // denominators, X must equal the matching fact. Catches the SEVIS
  // "0/5 vs 1 of 6" class of contradiction.
  const validByDenominator = new Map<number, Set<number>>();
  const add = (n: number, x: number) => {
    if (!validByDenominator.has(n)) validByDenominator.set(n, new Set());
    validByDenominator.get(n)!.add(x);
  };
  add(facts.promptCount, facts.strongCount);
  add(facts.promptCount, facts.partialCount);
  add(facts.promptCount, facts.absentCount);
  add(facts.promptCount, facts.presenceCount);
  add(facts.promptCount, facts.promptCount - facts.presenceCount);
  add(facts.promptCount, facts.promptsWithCitation);
  add(facts.promptCount, facts.rivalWins);
  add(facts.promptCount, facts.rivalMentions);
  add(facts.promptCount, facts.strongCount + facts.partialCount);
  if (facts.highPriorityTotal > 0 && facts.highPriorityTotal !== facts.promptCount) {
    add(facts.highPriorityTotal, facts.highPriorityWithPresence);
    add(facts.highPriorityTotal, facts.highPriorityAbsent);
  }
  const countClaim = /(\d+)\s*(?:of|\/)\s*(\d+)/g;
  for (const { field, text } of fields) {
    let m: RegExpExecArray | null;
    while ((m = countClaim.exec(text)) !== null) {
      const x = parseInt(m[1], 10);
      const n = parseInt(m[2], 10);
      const valid = validByDenominator.get(n);
      if (valid && !valid.has(x)) {
        v.push(`${field} claims "${m[0]}" but no report fact equals ${x} of ${n}`);
      }
    }
  }

  // 15. plan summaries (when present) end with terminal punctuation.
  for (const [i, move] of [...narrative.defense_moves, ...narrative.expansion_moves].entries()) {
    const summary = (move as { plan_summary?: string }).plan_summary;
    if (typeof summary === 'string' && summary.trim().length > 0 && !/[.!?]$/.test(summary.trim())) {
      v.push(`move ${i + 1} plan_summary lacks terminal punctuation: "${summary}"`);
    }
  }

  if (v.length > 0) throw new ReportInvariantError(v);
}

/**
 * Final gate on the assembled HTML: strip tags and re-check leader
 * language below the Leading band, so banded TEMPLATE copy (not just
 * narrative fields) can never regress (invariant 13 end-to-end).
 */
export function validateRenderedHtml(html: string, facts: ReportFacts): void {
  if (facts.band === 'leading') return;
  const text = html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  const v: string[] = [];
  for (const re of LEADER_PHRASES) {
    const m = text.match(re);
    if (m) v.push(`band is ${facts.bandLabel} but rendered report contains "${m[0]}"`);
  }
  if (v.length > 0) throw new ReportInvariantError(v);
}
