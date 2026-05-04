// ============================================================
// Report template builder
//
// Turns a ReportExportPayload + ReportNarrative into a complete,
// self-contained 7-page HTML document matching the C&C Air
// reference exactly in structure and styling. No external assets
// except Google Fonts (which we leave as a <link> — if PDF
// rendering requires fully offline assets, swap fonts to data-URI
// embedded later).
//
// File organization:
//   buildReportHtml() — public entry, composes the 7 pages
//   buildPage1..7() — one function per page
//   buildRadarSvg(), buildTrendSvg(), buildSparklineSvg() — dynamic charts
//   pickMoneyQuote(), pickRival(), pickVulnerabilities() — data selectors
//
// All user-supplied strings pass through esc() except where the
// narrative contract explicitly permits HTML (verdict_paragraph,
// page intros, take card `big` values). Those fields are documented
// in the schema as HTML-permitting.
// ============================================================

import type { ReportExportPayload, ReportNarrative, ClusterKey } from './reportNarrative';
import { REPORT_STYLES } from './report/templateStyles';

// ------------------------------------------------------------
// Public entry point.
// ------------------------------------------------------------
export function buildReportHtml(
  payload: ReportExportPayload,
  narrative: ReportNarrative,
): string {
  const ctx = buildContext(payload, narrative);
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>AI Strategy &amp; Positioning Brief — ${esc(payload.meta.business_name || 'Report')} — ${esc(ctx.monthLabel)}</title>`,
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600;9..144,700&family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">',
    '<style>',
    REPORT_STYLES,
    '</style>',
    // Supplemental styles — variants not in the reference template.
    // Kept separate so the extracted CSS stays untouched and re-extractable.
    '<style>',
    '  .score-hero .grade-chip.grade-green { background: var(--green); }',
    '  .score-hero .grade-chip.grade-amber { background: var(--amber); }',
    '  .score-hero .grade-chip.grade-red   { background: var(--red); }',
    '  .score-hero .grade-chip.grade-ink   { background: var(--ink-2); }',
    '</style>',
    '</head>',
    '<body>',
    buildPage1(ctx),
    buildPage2(ctx),
    buildPage3(ctx),
    buildPage4(ctx),
    buildPage5(ctx),
    buildPage6(ctx),
    buildPage7(ctx),
    '</body>',
    '</html>',
  ].join('\n');
}

// ============================================================
// Context — everything the pages need, pre-computed once.
// ============================================================
interface Ctx {
  p: ReportExportPayload;
  n: ReportNarrative;
  businessName: string;
  businessNameShort: string;       // fits in footer
  monthLabel: string;              // "April 2026"
  preparedDate: string;            // "April 21, 2026"
  nextRunDate: string;             // "May 21, 2026"
  issueNumber: string;             // "01" — derived from snapshots count
  promptCountText: string;         // "20 prompts tested" — handles singular
  counts: ReportExportPayload['scores']['counts'];
  avgConfidence: number | null;
  confidenceHighCount: number;     // prompts with confidence ≥ 0.80
  grade: string;                   // "A-" etc
  gradeColor: 'green' | 'amber' | 'red' | 'ink'; // which chip color
  radarValues: Record<ClusterKey, number>; // 0 for null clusters — radar still renders
  visibilityPct: {
    strong: number;
    partial: number;
    unclear: number;
    absent: number;
  };
  moneyQuote: {
    prompt: string;
    text: string;
    cite: string;
  };
  rival: {
    name: string;
    queryPrompt: string | null;
    yourPosition: string;
    theirPosition: string;
    yourScore: number | null;
    quote: string;
    analysis: string;
  };
  vulnerabilities: Array<{
    prompt: string;
    cluster: ClusterKey;
    priority: 'high' | 'medium' | 'low';
    score: number;
    risk: 'high' | 'med' | 'low';
    riskSignal: string;
  }>;
  trendHistory: Array<{
    label: string;          // "BASELINE", "RUN 2", ..., "THIS MONTH"
    score: number;
    isCurrent: boolean;
  }>;
  trendDeltaVsLast: number | null;
  trendDeltaFromBase: number | null;
  trendRange: string;       // "89–92"
  momentum: {
    gained: Array<{ title: string; detail: string }>;
    lost: Array<{ title: string; detail: string }>;
    newSignals: Array<{ title: string; detail: string }>;
  };
  allMoves: Array<StrategyMoveWithGroup>; // defense + expansion, indexed
  directoryRisk: 'Low' | 'Medium' | 'High';
  repeatRivalCount: number;
}

interface StrategyMoveWithGroup {
  group: 'defense' | 'expansion';
  number: string;
  title: string;
  description: string;
  evidence_line: string;
  expected_outcome: string;
  impact: 'High' | 'Medium' | 'Low';
  effort: 'High' | 'Medium' | 'Low';
  owner: string;
}

const CLUSTER_ORDER: ClusterKey[] = ['comparison', 'long_tail', 'problem', 'adjacent', 'brand', 'core'];
const CLUSTER_LABELS: Record<ClusterKey, string> = {
  core: 'Core',
  problem: 'Problem',
  comparison: 'Comparison',
  long_tail: 'Long-tail',
  brand: 'Brand',
  adjacent: 'Adjacent',
};

function buildContext(p: ReportExportPayload, n: ReportNarrative): Ctx {
  const snapshotDate = new Date(p.meta.snapshot_date);
  const monthLabel = snapshotDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const preparedDate = snapshotDate.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const nextRunDate = new Date(snapshotDate);
  nextRunDate.setMonth(nextRunDate.getMonth() + 1);
  const nextRun = nextRunDate.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const issueNum = String(p.trend.snapshots_count || 1).padStart(2, '0');

  const counts = p.scores.counts;
  const confidences = p.prompts_tested.map(pr => pr.confidence_score).filter((c): c is number => typeof c === 'number');
  const avgConfidence = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null;
  const confidenceHighCount = confidences.filter(c => c >= 0.80).length;

  // Grade chip color
  const s = p.scores.overall_score;
  const gradeColor: Ctx['gradeColor'] =
    s >= 85 ? 'green' : s >= 70 ? 'amber' : s >= 55 ? 'ink' : 'red';

  // Radar values — null clusters render as 0 (point at the center)
  const radarValues: Record<ClusterKey, number> = { core: 0, problem: 0, comparison: 0, long_tail: 0, brand: 0, adjacent: 0 };
  for (const k of CLUSTER_ORDER) {
    const v = p.scores.cluster_scores[k];
    radarValues[k] = typeof v === 'number' ? v : 0;
  }

  // Visibility distribution — normalize to percents of prompt_count
  const total = counts.prompt_count || 1;
  const visibilityPct = {
    strong: Math.round((counts.strong_count / total) * 100),
    partial: Math.round((counts.partial_count / total) * 100),
    unclear: Math.round(((total - counts.strong_count - counts.partial_count - counts.absent_count) / total) * 100),
    absent: Math.round((counts.absent_count / total) * 100),
  };

  // Money quote — resolve the narrative-chosen prompt to actual data
  const moneyQuote = resolveMoneyQuote(p, n);

  // Rival spotlight — narrative picks the name, we find the data
  const rival = resolveRival(p, n);

  // Vulnerabilities — all prompts where position != strong_presence
  const vulnerabilities = buildVulnerabilityMap(p);

  // Trend history
  const trendHistory = buildTrendHistory(p);
  const trendDeltaVsLast = p.trend.overall_change_from_previous;
  const trendDeltaFromBase = p.trend.overall_change_from_first;
  const scores = p.trend.history.map(h => h.overall_score).filter(n => typeof n === 'number') as number[];
  const trendRange = scores.length >= 2 ? `${Math.min(...scores)}–${Math.max(...scores)}` : `${p.scores.overall_score}`;

  // Momentum (page 5 cards) — derived from most-recent-two comparison
  const momentum = buildMomentum(p);

  // Combined moves with the "NN" numbering the roadmap references
  const allMoves: StrategyMoveWithGroup[] = [
    ...n.defense_moves.map(m => ({ ...m, group: 'defense' as const })),
    ...n.expansion_moves.map(m => ({ ...m, group: 'expansion' as const })),
  ];

  // Directory risk — "High" if any non-brand/review prompt has directories
  const dirRisk = assessDirectoryRisk(p);

  // Repeat rivals: competitors appearing in ≥ 2 prompts
  const repeatRivalCount = p.competitors.filter(c => c.times_appeared >= 2).length;

  const businessName = p.meta.business_name || p.meta.domain || 'Business';
  const businessNameShort = businessName.length > 24 ? businessName.slice(0, 22) + '…' : businessName;
  const promptCountText = counts.prompt_count === 1 ? '1 prompt tested' : `${counts.prompt_count} prompts tested`;

  return {
    p, n,
    businessName, businessNameShort,
    monthLabel, preparedDate, nextRunDate: nextRun,
    issueNumber: issueNum,
    promptCountText,
    counts,
    avgConfidence,
    confidenceHighCount,
    grade: p.scores.overall_grade,
    gradeColor,
    radarValues,
    visibilityPct,
    moneyQuote,
    rival,
    vulnerabilities,
    trendHistory,
    trendDeltaVsLast,
    trendDeltaFromBase,
    trendRange,
    momentum,
    allMoves,
    directoryRisk: dirRisk,
    repeatRivalCount,
  };
}

// ============================================================
// Data resolvers — the narrative chooses a prompt/rival by name
// or prompt_text; we find the matching record for real data
// (score, actual excerpt, position labels).
// ============================================================

function resolveMoneyQuote(p: ReportExportPayload, n: ReportNarrative): Ctx['moneyQuote'] {
  // Find prompt whose text most closely matches the narrative's chosen prompt.
  // Loose match because model may paraphrase slightly.
  const target = (n.money_quote_prompt || '').toLowerCase().trim();
  let chosen = p.prompts_tested.find(pr => pr.prompt_text.toLowerCase().trim() === target);
  if (!chosen) {
    // Fallback: pick the highest-scoring high-priority prompt where we were recommended first
    const candidates = p.prompts_tested
      .filter(pr => pr.business_position_type === 'directly_recommended')
      .sort((a, b) => b.score - a.score);
    chosen = candidates[0] || p.prompts_tested[0];
  }
  return {
    prompt: chosen?.prompt_text || n.money_quote_prompt,
    text: n.money_quote_text,
    cite: n.money_quote_cite,
  };
}

function resolveRival(p: ReportExportPayload, n: ReportNarrative): Ctx['rival'] {
  // Match by name (case-insensitive). Narrative is authoritative on which
  // rival to spotlight; we pull the data to confirm.
  const targetName = (n.rival_name || '').toLowerCase().trim();
  const comp = p.competitors.find(c => c.name.toLowerCase().trim() === targetName);

  let queryPrompt: string | null = null;
  let yourPosition = '—';
  let theirPosition = 'Named first';
  let yourScore: number | null = null;

  if (comp) {
    const won = comp.prompts_where_they_won[0];
    if (won) {
      queryPrompt = won.prompt_text;
      // Find the prompt result for our side
      const ourResult = p.prompts_tested.find(pr => pr.prompt_text === won.prompt_text);
      if (ourResult) {
        yourPosition = positionLabel(ourResult.business_position_type);
        yourScore = ourResult.score;
      }
    } else if (comp.times_appeared > 0) {
      // They appeared but didn't beat us — surface the appearance
      const appearance = p.prompts_tested.find(pr =>
        pr.competitor_names_detected.some(x => x.toLowerCase() === targetName));
      if (appearance) {
        queryPrompt = appearance.prompt_text;
        yourPosition = positionLabel(appearance.business_position_type);
        yourScore = appearance.score;
        theirPosition = 'Also listed';
      }
    }
  }

  return {
    name: n.rival_name,
    queryPrompt,
    yourPosition,
    theirPosition,
    yourScore,
    quote: n.rival_quote,
    analysis: n.rival_analysis,
  };
}

function positionLabel(pt: string | null): string {
  switch (pt) {
    case 'directly_recommended': return 'Recommended first';
    case 'listed_among_options': return 'Listed as option';
    case 'cited_as_source': return 'Cited as source';
    case 'mentioned_without_preference': return 'Mentioned';
    case 'implied_only': return 'Implied only';
    case 'not_present': return 'Absent';
    default: return 'Unclear';
  }
}

function buildVulnerabilityMap(p: ReportExportPayload): Ctx['vulnerabilities'] {
  // Everything that wasn't "strong_presence" — sorted by (priority desc, score asc)
  const nonStrong = p.prompts_tested.filter(pr => pr.visibility_status !== 'strong_presence');
  const priorityRank = { high: 0, medium: 1, low: 2 };
  nonStrong.sort((a, b) => {
    const pa = priorityRank[a.priority] ?? 1;
    const pb = priorityRank[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;
    return a.score - b.score; // lower score = higher up the list
  });
  return nonStrong.slice(0, 10).map(pr => {
    const risk: 'high' | 'med' | 'low' =
      pr.visibility_status === 'competitor_dominant' || pr.visibility_status === 'absent' ? 'high' :
      pr.priority === 'high' ? 'med' :
      'low';
    const riskSignal =
      pr.visibility_status === 'competitor_dominant' ? 'Named rival outranked you' :
      pr.visibility_status === 'absent' ? 'Not present in AI answer' :
      pr.visibility_status === 'directory_dominant' ? 'Directory overtook the slot' :
      pr.visibility_status === 'unclear' ? 'AI uncertain, brand-level leak' :
      pr.priority === 'high' ? 'High-priority cluster slip' :
      'Monitor — low priority';
    return {
      prompt: pr.prompt_text,
      cluster: pr.cluster,
      priority: pr.priority,
      score: pr.score,
      risk,
      riskSignal,
    };
  });
}

function buildTrendHistory(p: ReportExportPayload): Ctx['trendHistory'] {
  const h = p.trend.history;
  if (h.length === 0) {
    // Degenerate — no history yet; treat as baseline
    return [{ label: 'BASELINE', score: p.scores.overall_score, isCurrent: true }];
  }
  if (h.length === 1) {
    // First run: label it BASELINE explicitly, since "THIS MONTH" reads as
    // though a prior month exists to compare against.
    return [{ label: 'BASELINE', score: h[0].overall_score, isCurrent: true }];
  }
  return h.map((snap, i) => {
    const isCurrent = i === h.length - 1;
    let label: string;
    if (isCurrent) label = 'THIS MONTH';
    else if (i === 0) label = 'BASELINE';
    else label = `RUN ${i + 1}`;
    return { label, score: snap.overall_score, isCurrent };
  });
}

function buildMomentum(p: ReportExportPayload): Ctx['momentum'] {
  // First-pass implementation: we don't have per-prompt history in the
  // export payload (only snapshot aggregates), so we surface:
  //   - "gained": high-scoring prompts (>= 85) in the current run
  //   - "lost": non-strong prompts that were presumably strong before (can't know
  //     without result-level history; use visibility != strong_presence on high-priority)
  //   - "newSignals": competitors appearing for the first time (times_appeared >= 1)
  //
  // When result-level history is added to the export payload later, this
  // upgrades to true month-over-month detection. Until then: current-state
  // signals presented honestly as "what's happening now", which is more useful
  // than making up comparisons we can't support.
  const gained = p.prompts_tested
    .filter(pr => pr.score >= 85 && pr.priority !== 'low')
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(pr => ({
      title: `"${pr.prompt_text}"`,
      detail: `Currently <span class="now">${positionLabel(pr.business_position_type).toLowerCase()}</span>. ${pr.cluster} cluster, score ${pr.score}.`,
    }));

  const lost = p.prompts_tested
    .filter(pr => pr.priority === 'high' && pr.visibility_status !== 'strong_presence')
    .sort((a, b) => a.score - b.score)
    .slice(0, 2)
    .map(pr => ({
      title: `"${pr.prompt_text}"`,
      detail: `High-priority prompt currently <span class="now">${positionLabel(pr.business_position_type).toLowerCase()}</span>. ${pr.cluster} cluster, score ${pr.score}.`,
    }));

  const newSignals = p.competitors
    .filter(c => c.times_beat_us >= 1)
    .slice(0, 2)
    .map(c => ({
      title: c.name,
      detail: `Outranked the business on ${c.times_beat_us} prompt${c.times_beat_us === 1 ? '' : 's'}. ${c.prompts_where_they_won[0] ? `First surfaced on "${c.prompts_where_they_won[0].prompt_text}".` : ''}`,
    }));

  return { gained, lost, newSignals };
}

function assessDirectoryRisk(p: ReportExportPayload): 'Low' | 'Medium' | 'High' {
  // Directories on non-brand/non-review prompts = risk.
  const purchaseIntent = p.prompts_tested.filter(pr =>
    pr.cluster !== 'brand' && !pr.prompt_text.toLowerCase().includes('review'));
  const dirHits = purchaseIntent.filter(pr => pr.directories_detected.length > 0);
  const ratio = purchaseIntent.length ? dirHits.length / purchaseIntent.length : 0;
  if (ratio >= 0.30) return 'High';
  if (ratio >= 0.10) return 'Medium';
  return 'Low';
}

// ============================================================
// SVG generators
// ============================================================

/**
 * Radar chart — 6 axes, scores 0-100, matches reference dimensions exactly.
 * ViewBox "-30 -10 300 270" so axis labels outside the hex have room.
 * Center (120, 120). Max radius 96 = score 100.
 *
 * Axis order (clockwise from top): comparison, long_tail, problem, adjacent, brand, core
 * In degrees: 0, 60, 120, 180, 240, 300
 */
function buildRadarSvg(values: Record<ClusterKey, number>): string {
  const cx = 120;
  const cy = 120;
  const maxR = 96;

  // Clockwise from top
  const axes: Array<{ key: ClusterKey; angle: number; label: string }> = [
    { key: 'comparison', angle: 0,   label: 'COMPARISON' },
    { key: 'long_tail',  angle: 60,  label: 'LONG-TAIL'  },
    { key: 'problem',    angle: 120, label: 'PROBLEM'    },
    { key: 'adjacent',   angle: 180, label: 'ADJACENT'   },
    { key: 'brand',      angle: 240, label: 'BRAND'      },
    { key: 'core',       angle: 300, label: 'CORE'       },
  ];

  const pointAt = (angleDeg: number, score: number) => {
    const rad = (angleDeg - 90) * Math.PI / 180; // -90 because SVG 0° is east, we want 0° north
    const r = maxR * (score / 100);
    return {
      x: +(cx + r * Math.cos(rad)).toFixed(1),
      y: +(cy + r * Math.sin(rad)).toFixed(1),
    };
  };

  // Background rings at 25/50/75/100
  const rings = [100, 75, 50, 25].map((pct, i) => {
    const pts = axes.map(a => pointAt(a.angle, pct)).map(p => `${p.x},${p.y}`).join(' ');
    const opacity = 0.5 - i * 0.1;
    return `<polygon points="${pts}" opacity="${opacity.toFixed(1)}"/>`;
  }).join('\n        ');

  // Axis lines through center
  const axisLines = axes.map(a => {
    const p = pointAt(a.angle, 100);
    return `<line x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}"/>`;
  }).join('\n        ');

  // Data polygon
  const dataPts = axes.map(a => pointAt(a.angle, values[a.key])).map(p => `${p.x},${p.y}`).join(' ');

  // Data dots with severity color
  const dots = axes.map(a => {
    const pt = pointAt(a.angle, values[a.key]);
    const score = values[a.key];
    const fill = score >= 85 ? '#c8322d' : score >= 70 ? '#b8851c' : '#7a8090';
    return `<circle cx="${pt.x}" cy="${pt.y}" r="3" fill="${fill}"/>`;
  }).join('\n        ');

  // Axis labels — position outside max radius
  const labels = axes.map(a => {
    const lp = pointAt(a.angle, 115); // 15% outside the ring
    let anchor: 'start' | 'middle' | 'end' = 'middle';
    if (a.angle > 0 && a.angle < 180) anchor = 'start';
    else if (a.angle > 180 && a.angle < 360) anchor = 'end';
    // Adjust y for top/bottom labels slightly
    let y = lp.y;
    if (a.angle === 0) y -= 4;
    if (a.angle === 180) y += 10;
    return `<text x="${lp.x}" y="${y.toFixed(1)}" font-family="Geist Mono" font-size="9" letter-spacing="1" fill="#4d525e" text-anchor="${anchor}">${a.label}</text>`;
  }).join('\n        ');

  // Average for center
  const scoreValues = axes.map(a => values[a.key]).filter(v => v > 0);
  const avg = scoreValues.length
    ? Math.round(scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length)
    : 0;

  return `
    <svg viewBox="-30 -10 300 270">
      <g fill="none" stroke="#d4ccb7" stroke-width="0.75">
        ${rings}
      </g>
      <g stroke="#d4ccb7" stroke-width="0.5" opacity="0.5">
        ${axisLines}
      </g>
      <polygon points="${dataPts}" fill="#c8322d" fill-opacity="0.14" stroke="#c8322d" stroke-width="1.5"/>
      ${dots}
      ${labels}
    </svg>
    <div class="chart-center">
      <div class="big-num">${avg}</div>
      <div class="sub">Average</div>
    </div>
  `;
}

/**
 * Trend line chart — handles 1-to-many snapshots, auto-fits x-axis.
 * ViewBox 0 0 640 180. Y-axis 80-100 fixed (matches reference).
 *
 * For 1 snapshot: render a single highlighted point with "BASELINE — tracking begins" label.
 */
function buildTrendSvg(history: Ctx['trendHistory']): string {
  const vbW = 640;
  const vbH = 180;
  const leftPad = 50;
  const rightPad = 20;
  const topPad = 30;
  const bottomPad = 50;
  const plotW = vbW - leftPad - rightPad;
  const plotH = vbH - topPad - bottomPad;
  const yMin = 60;
  const yMax = 100;
  const yFor = (score: number) => topPad + plotH * (1 - (score - yMin) / (yMax - yMin));

  const n = history.length;
  const xFor = (i: number) => {
    if (n === 1) return leftPad + plotW / 2;
    return leftPad + (plotW * i) / (n - 1);
  };

  // Gridlines at 100, 90, 80
  const grid = [100, 90, 80].map(y => {
    const yy = yFor(y);
    return `<line x1="${leftPad}" y1="${yy.toFixed(1)}" x2="${vbW - rightPad}" y2="${yy.toFixed(1)}" stroke="#d4ccb7" stroke-width="0.5" stroke-dasharray="2 3"/>
    <text x="${leftPad - 8}" y="${(yy + 4).toFixed(1)}" font-family="Geist Mono" font-size="9" fill="#a8aebd" text-anchor="end">${y}</text>`;
  }).join('\n    ');

  // Area polygon + polyline
  const pts = history.map((h, i) => `${xFor(i).toFixed(1)},${yFor(h.score).toFixed(1)}`);
  const area = n >= 2
    ? `<polygon points="${pts.join(' ')} ${xFor(n-1).toFixed(1)},${(vbH - bottomPad).toFixed(1)} ${xFor(0).toFixed(1)},${(vbH - bottomPad).toFixed(1)}" fill="url(#areaGrad)"/>`
    : '';
  const line = n >= 2
    ? `<polyline points="${pts.join(' ')}" fill="none" stroke="#15171c" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>`
    : '';

  // Circles
  const circles = history.map((h, i) => {
    const cx = xFor(i).toFixed(1);
    const cy = yFor(h.score).toFixed(1);
    if (h.isCurrent) {
      return `<circle cx="${cx}" cy="${cy}" r="7" fill="#c8322d" stroke="#c8322d" stroke-width="1.5"/>`;
    }
    return `<circle cx="${cx}" cy="${cy}" r="5" fill="#f5f1e8" stroke="#15171c" stroke-width="1.5"/>`;
  }).join('\n    ');

  // Score labels (above points)
  const scoreLabels = history.map((h, i) => {
    const x = xFor(i).toFixed(1);
    const y = (yFor(h.score) - 12).toFixed(1);
    const color = h.isCurrent ? '#c8322d' : '#15171c';
    const size = h.isCurrent ? 17 : 14;
    const weight = h.isCurrent ? 600 : 500;
    return `<text x="${x}" y="${y}" font-family="Fraunces" font-size="${size}" fill="${color}" text-anchor="middle" font-weight="${weight}">${h.score}</text>`;
  }).join('\n    ');

  // X-axis labels
  const xLabels = history.map((h, i) => {
    const x = xFor(i).toFixed(1);
    const color = h.isCurrent ? '#c8322d' : '#7a8090';
    const weight = h.isCurrent ? 600 : 400;
    return `<text x="${x}" y="${vbH - 7}" font-family="Geist Mono" font-size="8" fill="${color}" text-anchor="middle" letter-spacing="1" font-weight="${weight}">${esc(h.label)}</text>`;
  }).join('\n    ');

  return `
  <svg viewBox="0 0 ${vbW} ${vbH}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#c8322d" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="#c8322d" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${grid}
    ${area}
    ${line}
    ${circles}
    ${scoreLabels}
    ${xLabels}
  </svg>`;
}

// ============================================================
// Per-page builders
// ============================================================

function masthead(sectionName: string, sectionRoman: string, sectionNum: string): string {
  return `
  <header class="masthead">
    <div class="logo">
      <span class="logo-mark"></span>
      <span class="logo-text">AI Strategy &amp; Positioning · Monthly Brief</span>
    </div>
    <div class="sect">
      <span>${sectionRoman ? `§ ${sectionRoman} · ` : ''}${esc(sectionName)}</span>
      <span class="num-badge">${sectionNum}</span>
    </div>
  </header>`;
}

function pageFooter(ctx: Ctx, sectionName: string, num: string): string {
  return `
  <div class="page-footer">
    <div class="left-bits">
      <span>${esc(ctx.businessNameShort)} · ${esc(ctx.monthLabel)}</span>
      <span class="sep"></span>
      <span>${esc(sectionName)}</span>
    </div>
    <span class="num">${num}</span>
  </div>`;
}

function buildPage1(ctx: Ctx): string {
  const { p, n } = ctx;
  const s = p.scores;
  const gradeChipClass = `grade-chip grade-${ctx.gradeColor}`;

  const deltaVs = ctx.trendDeltaVsLast;
  const deltaBase = ctx.trendDeltaFromBase;

  return `
<!-- PAGE 1 — EXECUTIVE SUMMARY -->
<div class="page">
  ${masthead('Executive Brief', '', '01')}

  <section class="cover">
    <div class="period-row">
      <span class="period">${esc(ctx.monthLabel)} Brief</span>
      <span class="issue-tag">Issue No. ${ctx.issueNumber} · Prepared ${esc(ctx.preparedDate)}</span>
    </div>

    <h1>${esc(n.headline_primary)}<br/><span class="emph">${esc(n.headline_accent)}</span>.</h1>
    <p class="client-line">For ${esc(ctx.businessName)}${p.meta.service_area ? `. ${esc(p.meta.service_area)}` : ''}${p.meta.primary_category ? ` · ${esc(p.meta.primary_category)}` : ''}.</p>

    <div class="hero-grid">
      <div class="score-hero">
        <div class="label">AI Positioning Score</div>
        <div class="score-row">
          <span class="num">${s.overall_score}<span class="num-denom"> / 100</span></span>
        </div>
        <span class="${gradeChipClass}">${esc(s.overall_grade)} · ${esc(n.grade_subtitle)}</span>
        <div class="posture">
          <span class="p-lab">Strategic Posture</span>
          <span class="p-val">${esc(n.strategic_posture)}</span>
        </div>
        <div class="delta-strip">
          <div class="cell">
            <span class="dlab">vs. Last</span>
            <span class="dval">${formatDelta(deltaVs)} <span class="sub">${deltaVs === null ? 'baseline' : deltaVs === 0 ? 'flat' : deltaVs > 0 ? 'up' : 'down'}</span></span>
          </div>
          <div class="cell">
            <span class="dlab">From Baseline</span>
            <span class="dval">${formatDelta(deltaBase)} <span class="sub">${deltaBase === null ? 'first run' : 'since start'}</span></span>
          </div>
          <div class="cell">
            <span class="dlab">Snapshots</span>
            <span class="dval">${p.trend.snapshots_count} <span class="sub">tracked</span></span>
          </div>
        </div>
      </div>

      <div class="score-lede">
        <div class="label">The Verdict</div>
        <p class="lede">${sanitizeNarrativeHtml(n.verdict_paragraph)}</p>
      </div>
    </div>

    <div class="takeaway-row">
      ${renderTakeCard(n.take_win)}
      ${renderTakeCard(n.take_watch)}
      ${renderTakeCard(n.take_move)}
    </div>

    <div class="cluster-hero">
      <div class="chart-wrap">
        ${buildRadarSvg(ctx.radarValues)}
      </div>
      <div class="side">
        <div class="label">Performance shape</div>
        <h3>${sanitizeNarrativeHtml(n.performance_shape_heading)}</h3>
        <p>${esc(n.performance_shape_body)}</p>
      </div>
    </div>

    <div class="how-strip">
      <div class="cell">
        <div class="label">Method</div>
        <div class="val">${esc(ctx.promptCountText)} · Claude Haiku with live web search</div>
      </div>
      <div class="cell">
        <div class="label">Confidence</div>
        <div class="val">${ctx.avgConfidence !== null ? `<strong style="color:var(--ink);font-weight:600;">${ctx.avgConfidence.toFixed(2)} avg</strong> · ${ctx.confidenceHighCount} of ${ctx.counts.prompt_count} prompts ≥ 0.80` : 'Not available'}</div>
      </div>
      <div class="cell">
        <div class="label">Next run</div>
        <div class="val">${esc(ctx.nextRunDate)} · Automatic monthly re-test</div>
      </div>
    </div>
  </section>

  ${pageFooter(ctx, 'Executive Brief', '01')}
</div>`;
}

function renderTakeCard(card: { tag: string; big: string; heading: string; body: string }): string {
  return `
      <div class="take-card">
        <div class="tag-num">${esc(card.tag)}</div>
        <div class="big">${sanitizeNarrativeHtml(card.big)}</div>
        <h3>${esc(card.heading)}</h3>
        <p>${esc(card.body)}</p>
      </div>`;
}

function buildPage2(ctx: Ctx): string {
  const { n } = ctx;

  // Wrap the emphasis span programmatically in the big_statement
  const bigStatementHtml = (() => {
    const phrase = n.big_statement_emphasis;
    if (phrase && n.big_statement.includes(phrase)) {
      const escaped = esc(n.big_statement);
      const escPhrase = esc(phrase);
      return escaped.replace(escPhrase, `<span class="em-red">${escPhrase}</span>`);
    }
    return esc(n.big_statement);
  })();

  const insightsHtml = n.insights.map(ins => `
    <div class="insight">
      <div class="i-num">${esc(ins.number)}</div>
      <div class="i-body">
        <h3>${esc(ins.title)}</h3>
        <p>${sanitizeNarrativeHtml(ins.body)}</p>
      </div>
      <div class="i-proof">
        <div class="p-lab">Proof</div>
        <div class="p-val">${esc(ins.proof_metric)}</div>
        <div class="p-cap">${esc(ins.proof_label)}</div>
      </div>
    </div>
  `).join('');

  // Fourth bar: "other" bucket (prompt_count - strong - partial - absent)
  const otherCount = ctx.counts.prompt_count - ctx.counts.strong_count - ctx.counts.partial_count - ctx.counts.absent_count;

  return `
<!-- PAGE 2 -->
<div class="page verdict-page">
  ${masthead('Your Position', 'II', '02')}

  <div class="kicker">Section Two · Your Strategic Position</div>
  <h2 style="font-size:32px;margin-bottom:18px;margin-top:6px;color:var(--ink);">What your position really means.</h2>

  <p class="huge-statement" style="font-size:24px;margin-bottom:36px;">${bigStatementHtml}</p>

  <div class="insight-stack">
    ${insightsHtml}
  </div>

  <div class="distribution" style="margin-top:36px;">
    <div class="label" style="color:var(--ink-3);">Visibility Distribution · ${ctx.counts.prompt_count} prompts tested</div>
    <div class="distribution-bar">
      ${ctx.counts.strong_count > 0 ? `<div class="seg seg-strong" style="flex:${ctx.counts.strong_count}"><span class="n">${ctx.counts.strong_count}</span>RECOMMENDED FIRST</div>` : ''}
      ${ctx.counts.partial_count > 0 ? `<div class="seg seg-partial" style="flex:${ctx.counts.partial_count}"><span class="n">${ctx.counts.partial_count}</span>LISTED AS OPTION</div>` : ''}
      ${otherCount > 0 ? `<div class="seg seg-unclear" style="flex:${otherCount}"><span class="n">${otherCount}</span>INCONSISTENT</div>` : ''}
      ${ctx.counts.absent_count > 0 ? `<div class="seg seg-absent" style="flex:${ctx.counts.absent_count}"><span class="n">${ctx.counts.absent_count}</span>ABSENT</div>` : ''}
    </div>
    <div class="dist-legend">
      <span>${ctx.visibilityPct.strong}% Strong</span>
      <span>${ctx.visibilityPct.partial}% Partial</span>
      <span>${ctx.visibilityPct.unclear}% Inconsistent</span>
      <span>${ctx.visibilityPct.absent}% Missing</span>
    </div>
  </div>

  ${pageFooter(ctx, 'Your Position', '02')}
</div>`;
}

function buildPage3(ctx: Ctx): string {
  const { p } = ctx;

  // Evidence table: up to 15 prompts, sorted by priority then score desc
  const priorityRank = { high: 0, medium: 1, low: 2 };
  const sorted = [...p.prompts_tested].sort((a, b) => {
    const pa = priorityRank[a.priority] ?? 1;
    const pb = priorityRank[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;
    return b.score - a.score;
  });
  const rows = sorted.slice(0, 15).map(pr => {
    const statusClass = visibilityToStatusClass(pr.visibility_status);
    const statusLabel = positionLabel(pr.business_position_type);
    return `
      <tr>
        <td class="q">${esc(pr.prompt_text)}</td>
        <td class="type">${esc(CLUSTER_LABELS[pr.cluster] || pr.cluster)}</td>
        <td class="status"><span class="status-dot ${statusClass}"></span><span class="status-txt ${statusClass}">${esc(statusLabel)}</span></td>
        <td class="who">${esc(pr.result_type_summary || pr.normalized_response_summary || '—')}</td>
      </tr>`;
  }).join('');

  return `
<!-- PAGE 3 -->
<div class="page">
  ${masthead('Evidence of Position', 'III', '03')}

  <div class="kicker">Section Three · Evidence of Position</div>
  <h2 style="font-size:32px;margin-bottom:28px;margin-top:6px;color:var(--ink);">What the AI tools actually said.</h2>

  <div class="money-quote">
    <div class="src">Claude w/ web search · Prompt: "${esc(ctx.moneyQuote.prompt)}"</div>
    <blockquote>${sanitizeNarrativeHtml(ctx.moneyQuote.text)}</blockquote>
    <div class="cite">${esc(ctx.moneyQuote.cite)}</div>
  </div>

  <table class="prompts">
    <thead>
      <tr>
        <th style="width:34%">The question a customer asked</th>
        <th style="width:12%">Type</th>
        <th style="width:22%">How you showed up</th>
        <th style="width:32%">What AI led with</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="prompt-footnote">
    ${Math.min(sorted.length, 15)} of ${ctx.counts.prompt_count} prompts shown · Full prompt library available on request · ● Directly recommended &nbsp;&nbsp;● Listed among options &nbsp;&nbsp;○ Mentioned without clear preference &nbsp;&nbsp;— Not present
  </div>

  ${pageFooter(ctx, 'Evidence of Position', '03')}
</div>`;
}

function visibilityToStatusClass(v: string): string {
  switch (v) {
    case 'strong_presence': return 'first';
    case 'partial_presence': return 'listed';
    case 'indirect_presence': return 'listed';
    case 'unclear': return 'incon';
    case 'competitor_dominant': return 'incon';
    case 'directory_dominant': return 'incon';
    case 'absent': return 'absent';
    default: return 'incon';
  }
}

function buildPage4(ctx: Ctx): string {
  const { n } = ctx;

  const vulnRows = ctx.vulnerabilities.map(v => {
    const fillClass = v.score >= 70 ? 'amber' : 'ink';
    return `
        <tr class="${v.risk === 'high' ? 'risk-high' : ''}">
          <td class="p-q">${esc(v.prompt)}</td>
          <td class="p-c">${esc(CLUSTER_LABELS[v.cluster] || v.cluster)}</td>
          <td class="p-p">${esc(cap(v.priority))}</td>
          <td class="p-s"><span class="s-bar"><span class="s-fill ${fillClass}" style="width:${v.score}%"></span></span>${v.score}</td>
          <td class="p-r"><span class="r-dot ${v.risk}"></span>${v.risk === 'high' ? `<strong>${esc(v.riskSignal)}</strong>` : esc(v.riskSignal)}</td>
        </tr>`;
  }).join('');

  return `
<!-- PAGE 4 -->
<div class="page">
  ${masthead('The Playing Field', 'IV', '04')}

  <div class="kicker">Section Four · The Competitive Landscape</div>
  <h2 style="font-size:32px;margin-bottom:24px;margin-top:6px;color:var(--ink);">${esc(ctx.rival.name ? 'The one rival that mattered this month.' : 'A fragmented field, no sustained threats.')}</h2>

  <p class="page-intro">${sanitizeNarrativeHtml(n.page4_intro)}</p>

  ${ctx.rival.name ? `
  <div class="rival-hero">
    <div class="rival-top">
      <div class="rival-head">
        <div class="label" style="color:var(--red);">Named Rival · ${esc(ctx.monthLabel)}</div>
        <h3 class="rival-name">${esc(ctx.rival.name)}</h3>
        <div class="rival-meta">
          ${ctx.rival.queryPrompt ? `<span><strong>Query:</strong> "${esc(ctx.rival.queryPrompt)}"</span><span class="sep-dot"></span>` : ''}
          <span><strong>Your position:</strong> ${esc(ctx.rival.yourPosition)}</span>
          <span class="sep-dot"></span>
          <span><strong>Their position:</strong> ${esc(ctx.rival.theirPosition)}</span>
        </div>
      </div>
      ${ctx.rival.yourScore !== null ? `
      <div class="rival-score">
        <div class="rs-num">${ctx.rival.yourScore}</div>
        <div class="rs-lab">Your score on this prompt</div>
      </div>` : ''}
    </div>
    <div class="rival-excerpt">
      <div class="exc-lab">What AI actually said</div>
      <blockquote>${sanitizeNarrativeHtml(ctx.rival.quote)}</blockquote>
    </div>
    <div class="rival-implication">
      <div class="imp-lab">What it means</div>
      <p>${esc(ctx.rival.analysis)}</p>
    </div>
  </div>` : ''}

  <h2 style="font-size:22px;margin-top:40px;margin-bottom:18px;color:var(--ink);font-weight:500;">The field beyond the rival.</h2>

  <div class="field-duo">
    <div class="field-stat">
      <div class="label">Repeat Rivals Detected</div>
      <div class="big">${ctx.repeatRivalCount}</div>
      <div class="caption">Competitors appearing in ≥ 2 prompts</div>
      <p>${ctx.repeatRivalCount === 0
        ? 'No single company was named alongside you in more than one answer. Single-mention shops, no repeat challengers. Signature of a category leader, not a contested market.'
        : `${ctx.repeatRivalCount} competitor${ctx.repeatRivalCount === 1 ? '' : 's'} appeared in multiple answers. Track closely next month to see if this pattern hardens.`}</p>
    </div>

    <div class="field-stat">
      <div class="label">Directory &amp; Middleman Risk</div>
      <div class="big">${ctx.directoryRisk}</div>
      <div class="caption">Yelp/BBB/Angi appearance on purchase-intent queries</div>
      <p>${ctx.directoryRisk === 'Low'
        ? 'Directories appeared only where expected — on review queries. None surfaced on purchase-intent prompts. Tracked monthly.'
        : ctx.directoryRisk === 'Medium'
        ? 'Directories surfaced on some purchase-intent queries. Not yet dominant, but a watch condition. Tracked monthly.'
        : 'Directories are intercepting purchase-intent queries. This is the highest-value defensive priority. Review the vulnerability map below.'}</p>
    </div>
  </div>

  <div class="vuln-map">
    <div class="vuln-head">
      <div>
        <div class="label">Vulnerability Map · ${ctx.vulnerabilities.length} non-winning prompts ranked by defensive priority</div>
        <div class="vuln-sub">Every prompt where you weren't recommended first — sorted by risk of erosion</div>
      </div>
    </div>
    ${ctx.vulnerabilities.length === 0 ? `
    <p style="padding:24px;color:var(--ink-3);text-align:center;font-style:italic;">No non-winning prompts this run. Every query returned you as recommended first.</p>
    ` : `
    <table class="vuln-table">
      <thead>
        <tr>
          <th style="width:38%">Prompt</th>
          <th style="width:12%">Cluster</th>
          <th style="width:12%">Priority</th>
          <th style="width:14%">Score</th>
          <th style="width:24%">Risk signal</th>
        </tr>
      </thead>
      <tbody>
        ${vulnRows}
      </tbody>
    </table>
    <div class="vuln-foot">
      <span><span class="r-dot high"></span>Active threat — address this quarter</span>
      <span><span class="r-dot med"></span>Monitor — protect the ground</span>
      <span><span class="r-dot low"></span>Low urgency — opportunistic</span>
    </div>
    `}
  </div>

  ${pageFooter(ctx, 'The Playing Field', '04')}
</div>`;
}

function buildPage5(ctx: Ctx): string {
  const { n } = ctx;
  const hasTrend = ctx.p.trend.available;
  const deltaVs = ctx.trendDeltaVsLast;
  const deltaBase = ctx.trendDeltaFromBase;

  return `
<!-- PAGE 5 -->
<div class="page">
  ${masthead('Movement', 'V', '05')}

  <div class="kicker">Section Five · Monthly Movement</div>
  <h2 style="font-size:32px;margin-bottom:18px;margin-top:6px;color:var(--ink);">${hasTrend ? 'What moved this month.' : 'Baseline established.'}</h2>

  <p class="page-intro">${sanitizeNarrativeHtml(n.page5_intro)}</p>

  <div class="trend-wrap">
    <div class="trend-head">
      <h3>Overall score · ${ctx.p.trend.snapshots_count} snapshot${ctx.p.trend.snapshots_count === 1 ? '' : 's'}</h3>
      <div class="deltas">
        <span><span class="lab">vs. last</span><strong style="color:var(--ink);">${formatDelta(deltaVs)}</strong></span>
        <span><span class="lab">from base</span><strong style="color:${deltaBase !== null && deltaBase < 0 ? 'var(--red)' : 'var(--ink)'};">${formatDelta(deltaBase)}</strong></span>
        <span><span class="lab">range</span><strong style="color:var(--ink);">${esc(ctx.trendRange)}</strong></span>
      </div>
    </div>
    ${buildTrendSvg(ctx.trendHistory)}
  </div>

  <div class="mom-grid">
    <div class="mom-card mom-up">
      <div class="mom-lab">Prompts leading the charge</div>
      <div class="mom-count">${ctx.momentum.gained.length}</div>
      <div class="mom-body">
        ${ctx.momentum.gained.length === 0 ? '<div class="mom-item"><div class="mi-detail" style="font-style:italic;">No standout wins this run.</div></div>' :
          ctx.momentum.gained.map(m => `
        <div class="mom-item">
          <div class="mi-title">${esc(m.title)}</div>
          <div class="mi-detail">${sanitizeNarrativeHtml(m.detail)}</div>
        </div>`).join('')}
      </div>
    </div>
    <div class="mom-card mom-down">
      <div class="mom-lab">High-priority prompts below threshold</div>
      <div class="mom-count">${ctx.momentum.lost.length}</div>
      <div class="mom-body">
        ${ctx.momentum.lost.length === 0 ? '<div class="mom-item"><div class="mi-detail" style="font-style:italic;">All high-priority prompts at strong presence.</div></div>' :
          ctx.momentum.lost.map(m => `
        <div class="mom-item">
          <div class="mi-title">${esc(m.title)}</div>
          <div class="mi-detail">${sanitizeNarrativeHtml(m.detail)}</div>
        </div>`).join('')}
      </div>
    </div>
    <div class="mom-card mom-new">
      <div class="mom-lab">Named rivals in the field</div>
      <div class="mom-count">${ctx.momentum.newSignals.length}</div>
      <div class="mom-body">
        ${ctx.momentum.newSignals.length === 0 ? '<div class="mom-item"><div class="mi-detail" style="font-style:italic;">No competitor outranked you this month.</div></div>' :
          ctx.momentum.newSignals.map(m => `
        <div class="mom-item">
          <div class="mi-title">${esc(m.title)}</div>
          <div class="mi-detail">${esc(m.detail)}</div>
        </div>`).join('')}
      </div>
    </div>
  </div>

  <div class="reading">
    <div class="label">Reading the month</div>
    <p>${esc(n.analyst_reading)}</p>
  </div>

  ${pageFooter(ctx, 'Movement', '05')}
</div>`;
}

function buildPage6(ctx: Ctx): string {
  const { n } = ctx;

  const renderMove = (m: StrategyMoveWithGroup): string => {
    const impactClass = m.impact === 'High' ? 'red' : m.impact === 'Medium' ? 'amber' : '';
    const effortClass = m.effort === 'High' ? 'red' : m.effort === 'Medium' ? 'amber' : '';
    return `
    <div class="move">
      <div class="idx">${esc(m.number)}</div>
      <div class="body">
        <h4>${esc(m.title)}</h4>
        <p>${esc(m.description)}</p>
        <div class="evidence">${esc(m.evidence_line)}</div>
        <div class="outcome"><span class="o-lab">Expected outcome</span><span class="o-val">${sanitizeNarrativeHtml(m.expected_outcome)}</span></div>
      </div>
      <div class="matrix">
        <div class="meta-row"><span class="k">Impact</span><span class="v ${impactClass}">${esc(m.impact)}</span></div>
        <div class="meta-row"><span class="k">Effort</span><span class="v ${effortClass}">${esc(m.effort)}</span></div>
        <div class="meta-row"><span class="k">Owner</span><span class="v">${esc(m.owner)}</span></div>
      </div>
    </div>`;
  };

  const defenseHtml = n.defense_moves.map(m => renderMove({ ...m, group: 'defense' })).join('');
  const expansionHtml = n.expansion_moves.map(m => renderMove({ ...m, group: 'expansion' })).join('');

  return `
<!-- PAGE 6 -->
<div class="page">
  ${masthead('The Strategy', 'VI', '06')}

  <div class="kicker">Section Six · Your Strategic Priorities</div>
  <h2 style="font-size:32px;margin-bottom:24px;margin-top:6px;color:var(--ink);">Your strategic priorities this quarter.</h2>

  <p class="page-intro" style="margin-bottom:32px;">${sanitizeNarrativeHtml(n.page6_intro)}</p>

  <div class="press-group">
    <div class="group-head">
      <h3><span class="em">Defense.</span> Close the gaps.</h3>
      <span class="count">3 Moves</span>
    </div>
    ${defenseHtml}
  </div>

  <div class="press-group">
    <div class="group-head">
      <h3><span class="em">Expansion.</span> Press the lead.</h3>
      <span class="count">3 Moves</span>
    </div>
    ${expansionHtml}
  </div>

  ${pageFooter(ctx, 'The Strategy', '06')}
</div>`;
}

function buildPage7(ctx: Ctx): string {
  const { n } = ctx;

  // Group roadmap items by phase
  const moveByNumber = new Map<string, StrategyMoveWithGroup>();
  for (const m of ctx.allMoves) moveByNumber.set(m.number, m);

  const byPhase = {
    '30': n.roadmap.filter(r => r.phase === '30'),
    '60': n.roadmap.filter(r => r.phase === '60'),
    '90': n.roadmap.filter(r => r.phase === '90'),
  };

  const renderPhase = (phase: '30' | '60' | '90', items: typeof n.roadmap): string => {
    const phaseLabel = phase === '30' ? 'Next 30 Days' : phase === '60' ? 'Days 31–60' : 'Days 61–90';
    const itemsHtml = items.map(r => {
      const move = moveByNumber.get(r.move_number);
      const effortWord = move ? `${move.effort} effort` : '';
      const ownerWord = move ? `Owner: ${move.owner}` : '';
      const tagBits = [`Move ${r.move_number}`, effortWord, ownerWord].filter(Boolean);
      return `
        <div class="item">
          <h4>${esc(r.title)}</h4>
          <p>${move ? esc(move.description.split('.')[0] + '.') : ''}${r.dependency_note ? ` <em>${esc(r.dependency_note)}</em>` : ''}</p>
          <div class="tagline">${esc(tagBits.join(' · '))}</div>
        </div>`;
    }).join('');

    return `
    <div class="phase">
      <div class="tag">
        <div class="n">${phase}</div>
        <div class="d">${phaseLabel}</div>
      </div>
      <div class="items">
        ${items.length === 0 ? '<div class="item"><p style="font-style:italic;color:var(--ink-4);">No moves scheduled in this window.</p></div>' : itemsHtml}
      </div>
    </div>`;
  };

  return `
<!-- PAGE 7 -->
<div class="page">
  ${masthead('The 90-Day Plan', 'VII', '07')}

  <div class="kicker">Section Seven · Sequenced Execution</div>
  <h2 style="font-size:32px;margin-bottom:24px;margin-top:6px;color:var(--ink);">The next ninety days.</h2>

  <p class="page-intro">${sanitizeNarrativeHtml(n.page7_intro)}</p>

  <div class="roadmap">
    ${renderPhase('30', byPhase['30'])}
    ${renderPhase('60', byPhase['60'])}
    ${renderPhase('90', byPhase['90'])}
  </div>

  <section class="colophon">
    <div>
      <h4>How we measured</h4>
      <p>${esc(n.methodology_paragraph)}</p>
    </div>
    <div>
      <h4>What this brief doesn't cover</h4>
      <p>AI positioning measures what AI answer engines say when asked. It does not measure traditional search rankings, paid-ad performance, Google Business Profile activity, or phone and form conversions. These remain valuable channels. A growing share of customers now ask AI tools first, and this brief is the measurement of that specific surface. Next run: ${esc(ctx.nextRunDate)}.</p>
    </div>
  </section>

  ${pageFooter(ctx, 'The 90-Day Plan', '07')}
</div>`;
}

// ============================================================
// Helpers
// ============================================================

function esc(s: string | null | undefined): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Narrative fields documented in the schema as HTML-permitting (verdict,
 * money quote, take card bigs, page intros) may contain <strong>, <em>,
 * and <span class="nm|hl-rival|now|was|em-red|unit"> tags. We allow these
 * and strip everything else, so a well-behaved model renders as designed
 * but an injection attempt can't break out.
 *
 * Why a whitelist-strip instead of a parser: report HTML is stitched into
 * our own trusted shell, viewer is an iframe (see /audit/[id]/report/page.tsx).
 * But defense-in-depth matters: the narrative model has tool input freedom,
 * and if someone poisons discovery_results.raw_response_excerpt with a
 * <script>, we want it dead on arrival.
 */
const ALLOWED_TAGS = /^<\/?(?:strong|em|span|br)(?:\s[^>]*)?\/?>$/i;
const ALLOWED_SPAN_CLASSES = new Set(['nm', 'hl-rival', 'now', 'was', 'em-red', 'unit']);

function sanitizeNarrativeHtml(s: string | null | undefined): string {
  if (!s) return '';
  // Tokenise into text + tags, inspect each tag against the whitelist
  const parts = String(s).split(/(<[^>]+>)/g);
  const out: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('<')) {
      if (!ALLOWED_TAGS.test(part)) {
        out.push(esc(part));
        continue;
      }
      // If it's a span, check the class attribute against our whitelist
      const spanMatch = /^<span\s+class="([^"]*)"\s*>$/i.exec(part);
      if (spanMatch) {
        if (!ALLOWED_SPAN_CLASSES.has(spanMatch[1])) {
          out.push(esc(part));
          continue;
        }
      }
      // <br/> and allowed tags pass through
      out.push(part);
    } else {
      out.push(esc(part));
    }
  }
  return out.join('');
}

function formatDelta(d: number | null): string {
  if (d === null) return '—';
  if (d === 0) return '+0';
  return d > 0 ? `+${d}` : `${d}`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ============================================================
// Free-tier 2-page summary
//
// Reuses the Tier 1 narrative (cheap — same Claude call) but renders
// a stripped-down 2-page document with no jargon. Page 1 = score +
// static framing; page 2 = cluster heatmap + lowest-scoring prompt
// with its real AI response excerpt + CTA to upgrade.
//
// Self-contained styles — does NOT import REPORT_STYLES because the
// strategic-brief CSS introduces concepts (radar grids, page-numbered
// footers, masthead) the free user hasn't been onboarded to.
// ============================================================

const FREE_SAMPLE_STYLES = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    font-family: 'Geist', -apple-system, BlinkMacSystemFont, sans-serif;
    color: #1a1a1a;
    background: #f5f3ee;
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
  }
  .page {
    width: 8.5in; min-height: 11in;
    margin: 0.5in auto;
    background: #ffffff;
    box-shadow: 0 6px 20px rgba(0,0,0,0.08);
    padding: 0.75in 0.85in;
    page-break-after: always;
  }
  .page:last-child { page-break-after: auto; }
  .domain-line {
    font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase;
    color: #888; margin-bottom: 0.4in;
  }
  .domain-line strong { color: #1a1a1a; font-weight: 600; }
  h1.cover-h1 {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 400; font-size: 36px; line-height: 1.15;
    margin: 0 0 0.35in 0; color: #1a1a1a;
  }
  h1.cover-h1 em { font-style: italic; color: #b03030; }
  .score-block {
    border: 1px solid #e2e0d8;
    background: #fdfcf8;
    padding: 0.4in 0.45in;
    margin-bottom: 0.4in;
  }
  .score-block .label {
    font-size: 11px; letter-spacing: 0.10em; text-transform: uppercase;
    color: #888; margin-bottom: 0.1in;
  }
  .score-block .num {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 500; font-size: 92px; line-height: 1;
    color: #1a1a1a;
  }
  .score-block .num-denom { font-size: 28px; color: #999; }
  .score-block .interp {
    font-size: 16px; color: #444;
    margin-top: 0.2in; max-width: 5in;
  }
  .framing {
    font-size: 14px; color: #444;
    max-width: 5.5in;
  }
  .framing p { margin: 0 0 0.18in 0; }
  .framing p:last-child { margin-bottom: 0; }
  .footer-meta {
    margin-top: 0.5in; font-size: 11px; color: #999;
  }

  /* Page 2 */
  h2.section-h {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 400; font-size: 26px; line-height: 1.2;
    margin: 0 0 0.3in 0; color: #1a1a1a;
  }
  .heatmap {
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 12px; margin-bottom: 0.4in;
  }
  .heat-cell {
    border: 1px solid #e2e0d8;
    padding: 14px 16px;
    background: #fff;
  }
  .heat-cell .lab {
    font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase;
    color: #888; margin-bottom: 6px;
  }
  .heat-cell .row {
    display: flex; align-items: center; gap: 10px;
  }
  .heat-cell .dot {
    width: 14px; height: 14px; border-radius: 3px; flex-shrink: 0;
  }
  .heat-cell .dot.strong { background: #2f8a4f; }
  .heat-cell .dot.medium { background: #d4a82a; }
  .heat-cell .dot.weak   { background: #c64a3e; }
  .heat-cell .dot.none   { background: #d6d3cb; }
  .heat-cell .desc { font-size: 13px; color: #333; }

  .example {
    border-left: 3px solid #b03030;
    padding: 0.15in 0.25in;
    background: #fbf6f5;
    margin-bottom: 0.3in;
  }
  .example .ask {
    font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase;
    color: #888; margin-bottom: 4px;
  }
  .example .q {
    font-family: 'Fraunces', Georgia, serif; font-style: italic;
    font-size: 17px; color: #1a1a1a; margin-bottom: 0.18in;
  }
  .example .ai-lab {
    font-size: 11px; letter-spacing: 0.10em; text-transform: uppercase;
    color: #888; margin-bottom: 4px;
  }
  .example .ai-text {
    font-size: 13.5px; color: #333; line-height: 1.55;
  }
  .why {
    font-size: 14px; color: #444; max-width: 5.5in;
    margin-bottom: 0.45in;
  }
  .cta-row {
    border-top: 1px solid #e2e0d8;
    padding-top: 0.3in;
  }
  .cta-row .lead {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 20px; color: #1a1a1a; margin-bottom: 0.18in;
  }
  .cta-row .btn {
    display: inline-block;
    background: #1a1a1a; color: #fff;
    padding: 12px 22px; font-size: 14px; font-weight: 500;
    text-decoration: none; border-radius: 2px;
  }
  .cta-row .sub {
    font-size: 12px; color: #888; margin-top: 0.15in;
  }

  @media print {
    html, body { background: #fff; }
    .page { box-shadow: none; margin: 0 auto; }
  }
`;

interface ClusterHeatStrength {
  label: 'Strong' | 'Building' | 'Weak' | 'Not measured';
  klass: 'strong' | 'medium' | 'weak' | 'none';
  desc: string;
}

function strengthForScore(score: number | null): ClusterHeatStrength {
  if (score === null) {
    return { label: 'Not measured', klass: 'none', desc: 'No prompts in this category yet.' };
  }
  if (score >= 70) {
    return { label: 'Strong', klass: 'strong', desc: 'You appear consistently in AI answers here.' };
  }
  if (score >= 40) {
    return { label: 'Building', klass: 'medium', desc: 'You sometimes appear; competitors win the rest.' };
  }
  return { label: 'Weak', klass: 'weak', desc: 'You are largely missing from AI answers in this category.' };
}

const FREE_CLUSTER_LABEL: Record<ClusterKey, string> = {
  core: 'Core services',
  problem: 'Problem-driven',
  comparison: 'Comparison',
  long_tail: 'Long-tail',
  brand: 'Brand & branded',
  adjacent: 'Adjacent',
};

function pickWeakestPrompt(payload: ReportExportPayload): ReportExportPayload['prompts_tested'][number] | null {
  const candidates = payload.prompts_tested.filter(p =>
    !p.business_mentioned && !p.business_cited && (p.raw_response_excerpt || '').length > 40,
  );
  if (candidates.length === 0) {
    // Fall back to lowest-scoring with any excerpt
    const withExcerpt = payload.prompts_tested.filter(p => (p.raw_response_excerpt || '').length > 40);
    if (withExcerpt.length === 0) return null;
    return withExcerpt.slice().sort((a, b) => a.score - b.score)[0];
  }
  return candidates.slice().sort((a, b) => a.score - b.score)[0];
}

function truncateToSentences(text: string, maxSentences: number, maxChars: number): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxChars) return cleaned;
  // Split on sentence boundaries
  const sentences = cleaned.split(/(?<=[.!?])\s+/);
  let out = '';
  for (let i = 0; i < Math.min(sentences.length, maxSentences); i++) {
    const candidate = (out ? out + ' ' : '') + sentences[i];
    if (candidate.length > maxChars) break;
    out = candidate;
  }
  if (!out) {
    // No sentence boundary fit — hard truncate
    return cleaned.slice(0, maxChars - 1).replace(/\s+\S*$/, '') + '…';
  }
  if (out.length < cleaned.length) out += '…';
  return out;
}

// Pick the best excerpt from a weak-prompt response for the free sample.
// Prefer sentences that name a detected competitor — the excerpt's job is to
// make "buyers are deciding without you" feel real, and competitor mentions
// do that work better than generic AI prose. Falls back to leading sentences
// when no competitor mention is present (or the competitor list is empty).
function selectFreeSampleExcerpt(
  text: string,
  competitorNames: string[],
  maxSentences: number,
  maxChars: number,
): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length === 0) return '';
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
  const competitors = competitorNames
    .map(c => c.toLowerCase().trim())
    .filter(c => c.length >= 2);

  if (competitors.length > 0) {
    const lower = sentences.map(s => s.toLowerCase());
    const competitorIdxs: number[] = [];
    for (let i = 0; i < lower.length; i++) {
      if (competitors.some(c => lower[i].includes(c))) competitorIdxs.push(i);
    }
    if (competitorIdxs.length > 0) {
      // Take the first match plus up to (maxSentences - 1) following sentences,
      // so the excerpt reads naturally instead of jumping between hits.
      const start = competitorIdxs[0];
      const end = Math.min(sentences.length, start + maxSentences);
      let out = sentences.slice(start, end).join(' ');
      if (out.length > maxChars) {
        out = out.slice(0, maxChars - 1).replace(/\s+\S*$/, '') + '…';
      } else if (end < sentences.length) {
        out += '…';
      } else if (start > 0) {
        out = '…' + out;
      }
      return out;
    }
  }

  // No competitor match — fall back to leading-sentence truncation.
  return truncateToSentences(cleaned, maxSentences, maxChars);
}

export interface BuildFreeSampleOptions {
  pricingUrl?: string;
}

export function buildFreeSampleHtml(
  payload: ReportExportPayload,
  options: BuildFreeSampleOptions = {},
): string {
  const score = payload.scores.overall_score ?? 0;
  const counts = payload.scores.counts;
  const businessName = payload.meta.business_name || payload.meta.domain || 'this site';
  const domain = payload.meta.domain || '';
  const scanDate = payload.meta.snapshot_date
    ? new Date(payload.meta.snapshot_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '';
  const pricingUrl = options.pricingUrl || '/pricing';

  const presenceCount = counts.strong_count + counts.partial_count;
  const totalPrompts = Math.max(counts.prompt_count, 1);
  const interp = `Across ${counts.prompt_count} buyer-intent question${counts.prompt_count === 1 ? '' : 's'} we tested with a live AI assistant, ${businessName} appeared in ${presenceCount} of ${totalPrompts}.`;

  // Headline structure: "<primary> <em>accent</em>." — accent renders in
  // red italic. The < 40 case breaks the article+noun pattern of the
  // higher tiers because the message itself ("Mostly invisible") needs
  // to land plainly; "Mostly" sits in primary, "invisible" carries the
  // emphasis.
  const headlinePrimary = score >= 70 ? 'A solid' : score >= 40 ? 'A working' : 'Mostly';
  const headlineAccent  = score >= 70 ? 'foundation' : score >= 40 ? 'position' : 'invisible';

  // Page 2 data
  const clusterScores = payload.scores.cluster_scores;
  const heatmapCells = (Object.keys(FREE_CLUSTER_LABEL) as ClusterKey[]).map(key => {
    const s = clusterScores[key] ?? null;
    const strength = strengthForScore(s);
    return `
      <div class="heat-cell">
        <div class="lab">${esc(FREE_CLUSTER_LABEL[key])}</div>
        <div class="row">
          <div class="dot ${strength.klass}"></div>
          <div class="desc">${esc(strength.label)}${s !== null ? ` · ${s}/100` : ''}</div>
        </div>
      </div>`;
  }).join('');

  const weakest = pickWeakestPrompt(payload);
  const exampleBlock = weakest && weakest.raw_response_excerpt
    ? `
        <div class="example">
          <div class="ask">When a buyer asks an AI</div>
          <div class="q">${esc(weakest.prompt_text)}</div>
          <div class="ai-lab">The AI answers</div>
          <div class="ai-text">${esc(selectFreeSampleExcerpt(weakest.raw_response_excerpt, weakest.competitor_names_detected || [], 3, 360))}</div>
        </div>`
    : '';
  const whyLine = weakest
    ? `Buyers asking questions like this are deciding without you in the conversation. The full report shows where this is happening, who is winning instead, and what to do about it.`
    : `The full report shows every question we tested, who appeared instead of you, and a 30/60/90 plan to close the gaps.`;

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>AI Visibility Sample — ${esc(businessName)}</title>`,
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,500;1,400&family=Geist:wght@400;500;600&display=swap" rel="stylesheet">',
    '<style>',
    FREE_SAMPLE_STYLES,
    '</style>',
    '</head>',
    '<body>',

    // Page 1
    '<div class="page">',
    `  <div class="domain-line">AI Visibility Sample · <strong>${esc(domain)}</strong>${scanDate ? ` · ${esc(scanDate)}` : ''}</div>`,
    `  <h1 class="cover-h1">${esc(headlinePrimary)} <em>${esc(headlineAccent)}</em>.</h1>`,
    '  <div class="score-block">',
    '    <div class="label">AI Visibility Score</div>',
    `    <div class="num">${score}<span class="num-denom"> / 100</span></div>`,
    `    <div class="interp">${esc(interp)}</div>`,
    '  </div>',
    '  <div class="framing">',
    '    <p>When buyers ask an AI assistant for recommendations in your category, that AI gives them a short list. This score is a measure of how often your business is on that list, for your category and the services you offer.</p>',
    '    <p>This sample is the headline number plus one example. The full report shows every question tested, who is being recommended instead, and a strategic plan to change that.</p>',
    '  </div>',
    '</div>',

    // Page 2
    '<div class="page">',
    '  <h2 class="section-h">Where the score comes from</h2>',
    `  <div class="heatmap">${heatmapCells}</div>`,
    exampleBlock,
    `  <p class="why">${esc(whyLine)}</p>`,
    '  <div class="cta-row">',
    '    <div class="lead">See the full report.</div>',
    `    <a class="btn" href="${esc(pricingUrl)}">Upgrade to the full report →</a>`,
    `    <div class="sub">Includes who's being recommended instead of you, every question tested with the actual AI responses, and a 30/60/90 plan.</div>`,
    '  </div>',
    '</div>',

    '</body>',
    '</html>',
  ].join('\n');
}
