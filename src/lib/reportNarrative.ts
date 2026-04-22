// ============================================================
// Report narrative generator
//
// Takes the structured export-report payload (see
// /api/discovery/export-report) and makes a single Claude call to
// generate the prose sections of the 7-page report. Output is
// validated via tool-use, so the caller can trust the shape and
// stamp it straight into the template.
//
// Why tool-use over a text+JSON prompt:
//   - Model returns ONE object matching our schema, no parse errors
//   - We can describe each field precisely (word limits, forbidden
//     phrases) without begging in prose
//   - Fields that don't fit the data ("analyst reading" when there's
//     one snapshot) can be required-omitted
//
// Model choice: claude-sonnet-4-6-20250929 for narrative (quality matters
// for owner-facing prose). Haiku 4.5 stays on the prompt-testing runner —
// that's a different call site, not changed here.
// ============================================================

import { claudeFetchWithRetry } from './claudeRetry';

// ------------------------------------------------------------
// Input: the shape of /api/discovery/export-report's response.
// Mirrors that route exactly so the narrative generator is the
// sole consumer of the contract.
// ------------------------------------------------------------
export interface ReportExportPayload {
  meta: {
    site_id: string;
    run_id: string;
    business_name: string;
    domain: string;
    primary_category: string | null;
    service_area: string | null;
    tier: 'teaser' | 'full';
    snapshot_date: string;
    report_generated_at: string;
    prompt_count: number;
  };
  scores: {
    overall_score: number;
    overall_grade: string;
    cluster_scores: Record<ClusterKey, number | null>;
    visibility_distribution: Record<string, number>;
    counts: {
      prompt_count: number;
      strong_count: number;
      partial_count: number;
      absent_count: number;
      competitor_dominant_count: number;
    };
  };
  prompts_tested: Array<{
    id: string;
    prompt_text: string;
    cluster: ClusterKey;
    priority: 'high' | 'medium' | 'low';
    score: number;
    visibility_status: string;
    business_position_type: string | null;
    business_mentioned: boolean;
    business_cited: boolean;
    result_type_summary: string | null;
    normalized_response_summary: string | null;
    raw_response_excerpt: string | null;
    competitor_names_detected: string[];
    competitor_domains_detected: string[];
    directories_detected: string[];
    marketplaces_detected: string[];
    confidence_score: number | null;
  }>;
  competitors: Array<{
    id: string;
    name: string;
    domain: string | null;
    times_appeared: number;
    times_beat_us: number;
    prompts_where_they_won: Array<{
      prompt_text: string;
      cluster: ClusterKey;
      visibility_status: string;
    }>;
  }>;
  insights: Array<{
    category: string;
    title: string;
    description: string;
    severity: 'high' | 'medium' | 'low';
    linked_cluster: string | null;
    linked_competitor_name: string | null;
  }>;
  recommendations: Array<{
    title: string;
    description: string;
    why_it_matters: string;
    category: string;
    priority: 'high' | 'medium' | 'low';
    owner_type: string;
    impact_estimate: string;
    difficulty_estimate: string;
    suggested_timeline: string;
    linked_prompt_clusters: ClusterKey[];
    linked_competitor_names: string[];
  }>;
  trend: {
    available: boolean;
    snapshots_count: number;
    history: Array<{
      snapshot_date: string;
      run_id: string;
      overall_score: number;
      cluster_scores: Record<ClusterKey, number | null>;
      prompt_count: number;
      strong_count: number;
      partial_count: number;
      absent_count: number;
      competitor_dominant_count: number;
    }>;
    overall_change_from_first: number | null;
    overall_change_from_previous: number | null;
    cluster_changes_from_previous: Record<ClusterKey, number | null> | null;
  };
}

export type ClusterKey = 'core' | 'problem' | 'comparison' | 'long_tail' | 'brand' | 'adjacent';

// ------------------------------------------------------------
// Output: the narrative sections the template needs. Every
// field here has a matching slot in the template.
// ------------------------------------------------------------
export interface ReportNarrative {
  // Page 1
  headline_primary: string;           // "Holding the" — first line of the cover H1
  headline_accent: string;             // "top position" — red italic second line
  verdict_paragraph: string;           // ~50 words; uses <strong> and <em> HTML
  strategic_posture: string;           // "Defend & Expand" / "Build Foundation" etc.
  grade_subtitle: string;              // "CATEGORY LEADER" / "CHALLENGER" etc.
  take_win: TakeCard;
  take_watch: TakeCard;
  take_move: TakeCard;
  performance_shape_heading: string;   // "Strongest in comparison and problem queries."
  performance_shape_body: string;      // ~40 words explaining the radar shape

  // Page 2
  big_statement: string;               // "You are the default answer for HVAC in Monmouth County." — one sentence
  big_statement_emphasis: string;      // substring of big_statement to wrap in red-italic — "default answer"
  insights: [NumberedInsight, NumberedInsight, NumberedInsight, NumberedInsight];

  // Page 3
  money_quote_prompt: string;          // which prompt the verbatim came from
  money_quote_text: string;            // verbatim excerpt, ~80 words max, with <span class="nm"> around business name
  money_quote_cite: string;            // small print below quote

  // Page 4
  page4_intro: string;                 // one-paragraph intro above the rival spotlight
  rival_name: string;                  // main competitor callout
  rival_quote: string;                 // verbatim AI mention of the rival
  rival_analysis: string;              // ~60 words of analysis

  // Page 5
  page5_intro: string;                 // one paragraph setting up the trend page
  analyst_reading: string;             // ~80 words interpretation — narrative of what moved

  // Page 6
  page6_intro: string;                 // one-paragraph intro, uses <em> tags
  defense_moves: [StrategyMove, StrategyMove, StrategyMove];
  expansion_moves: [StrategyMove, StrategyMove, StrategyMove];

  // Page 7
  page7_intro: string;                 // framing for the 30/60/90 plan
  roadmap: RoadmapItem[];              // 6 items, sequenced
  methodology_paragraph: string;       // ~90 words on how the test was conducted + limits
}

export interface TakeCard {
  tag: string;              // "01 · The Win"
  big: string;              // "8 / 10" — the headline metric (HTML allowed for the unit span)
  heading: string;          // "High-priority queries won"
  body: string;             // ~40 words supporting the metric
}

export interface NumberedInsight {
  number: string;           // "01"
  title: string;            // sentence-case heading
  body: string;             // ~70 words of evidence + interpretation
  proof_metric: string;     // e.g. "8 / 10" or "+47 pts"
  proof_label: string;      // e.g. "high-priority queries won"
}

export interface StrategyMove {
  number: string;           // "01"
  title: string;
  description: string;      // ~60 words
  evidence_line: string;    // "Prompt: 'X' · Cluster: Y · Score: Z"
  expected_outcome: string; // "+4 pts brand cluster"
  impact: 'High' | 'Medium' | 'Low';
  effort: 'High' | 'Medium' | 'Low';
  owner: string;            // "Marketer" / "Developer" / "Business Owner"
}

export interface RoadmapItem {
  phase: '30' | '60' | '90';  // which window
  move_number: string;         // "01" — references a strategy move
  title: string;
  dependency_note?: string;    // optional "after move 03"
}

// ------------------------------------------------------------
// Tool-use schema. Claude returns ONE object matching this.
// ------------------------------------------------------------
const NARRATIVE_TOOL = {
  name: 'emit_report_narrative',
  description:
    'Emit the structured narrative for a 7-page AI positioning report. ' +
    'Every field must be populated. Prose fields use sentence case, no ' +
    'emoji, no em-dashes as separators (use commas or periods), no ' +
    'marketing hype ("blazing", "world-class", "cutting-edge" etc are ' +
    'forbidden). Write like a senior analyst, not a press release.',
  input_schema: {
    type: 'object',
    required: [
      'headline_primary', 'headline_accent', 'verdict_paragraph',
      'strategic_posture', 'grade_subtitle',
      'take_win', 'take_watch', 'take_move',
      'performance_shape_heading', 'performance_shape_body',
      'big_statement', 'big_statement_emphasis', 'insights',
      'money_quote_prompt', 'money_quote_text', 'money_quote_cite',
      'page4_intro', 'rival_name', 'rival_quote', 'rival_analysis',
      'page5_intro', 'analyst_reading',
      'page6_intro', 'defense_moves', 'expansion_moves',
      'page7_intro', 'roadmap', 'methodology_paragraph',
    ],
    properties: {
      headline_primary: {
        type: 'string',
        description: 'First line of cover H1. 2-4 words. Sets up the accent. Examples: "Holding the", "Building a", "Fighting for".',
      },
      headline_accent: {
        type: 'string',
        description: 'Second line of cover H1, rendered in red italic serif. 2-4 words. Completes headline_primary. Examples: "top position", "category lead", "first page".',
      },
      verdict_paragraph: {
        type: 'string',
        description: 'The single-paragraph verdict on page 1. 45-65 words. Uses <strong> around the key numeric claim and <em> around the key descriptive phrase. Concrete, specific. Cite actual counts from the data (e.g. "recommended first in 12 of 20").',
      },
      strategic_posture: {
        type: 'string',
        description: 'Two-to-four-word label. Examples: "Defend & Expand", "Build Foundation", "Close the Gap", "Press the Advantage". No ampersand alternatives ("and") — use & if needed.',
      },
      grade_subtitle: {
        type: 'string',
        description: 'Short descriptor shown after the letter grade. Uppercase. Examples: "CATEGORY LEADER", "STRONG CHALLENGER", "BUILDING PRESENCE", "NEEDS FOUNDATION".',
      },
      take_win: { $ref: '#/$defs/take_card' },
      take_watch: { $ref: '#/$defs/take_card' },
      take_move: { $ref: '#/$defs/take_card' },
      performance_shape_heading: {
        type: 'string',
        description: '6-12 words describing the radar chart shape. Use <br/> between clauses if it reads better. Names the strongest clusters.',
      },
      performance_shape_body: {
        type: 'string',
        description: '35-55 words explaining what the shape means and what the weakest clusters reveal.',
      },
      big_statement: {
        type: 'string',
        description: 'Page 2 opening statement. ONE sentence, 10-18 words. The single truest claim about the business\'s AI position. Not generic. Specific to their data.',
      },
      big_statement_emphasis: {
        type: 'string',
        description: 'A 2-4 word substring that appears VERBATIM inside big_statement. It will be wrapped in a red-italic span by the renderer. Pick the most interpretive phrase (e.g. "default answer", "clear leader", "missing entirely"). Must match big_statement exactly, character-for-character, with correct case and punctuation.',
      },
      insights: {
        type: 'array',
        minItems: 4, maxItems: 4,
        description: 'EXACTLY 4 numbered insights for page 2. Each stands alone. Order: (1) win-rate on high-priority queries; (2) website citation rate; (3) competitor pressure; (4) directory/middleman leakage.',
        items: { $ref: '#/$defs/numbered_insight' },
      },
      money_quote_prompt: {
        type: 'string',
        description: 'The exact prompt text from which the money quote was pulled. Must match one of the prompt_texts in the input data.',
      },
      money_quote_text: {
        type: 'string',
        description: 'A verbatim-feeling excerpt from the AI response. Wrap the business name in <span class="nm">...</span>. 40-90 words. Should feel like a real AI answer — if the raw_response_excerpt is available for the chosen prompt, adapt from it, do not invent.',
      },
      money_quote_cite: {
        type: 'string',
        description: 'Small-print attribution line below the quote. Mentions recording date and that this is how a customer sees it.',
      },
      page4_intro: {
        type: 'string',
        description: 'One paragraph intro for the competitive landscape page. 25-45 words. Sets up what follows.',
      },
      rival_name: {
        type: 'string',
        description: 'The single most significant competitor. Pick from the competitors array with highest times_beat_us, or if none beat the business, the one with highest times_appeared.',
      },
      rival_quote: {
        type: 'string',
        description: 'A representative AI-response excerpt mentioning the rival. 20-50 words. Use actual detected-competitor data.',
      },
      rival_analysis: {
        type: 'string',
        description: '40-70 word interpretation of what this competitive pressure means and what to do.',
      },
      page5_intro: {
        type: 'string',
        description: 'Intro paragraph for the trend page. 30-55 words. Uses <em> around the key interpretive phrase. If trend.snapshots_count < 2, explicitly acknowledge this is the baseline run.',
      },
      analyst_reading: {
        type: 'string',
        description: '60-90 words interpreting what the trend history shows. If only one snapshot exists, describe what we\'ll look for next month instead of inventing a trend.',
      },
      page6_intro: {
        type: 'string',
        description: 'Intro for the strategy page. 25-45 words. Use <em> tags around 1-2 key phrases.',
      },
      defense_moves: {
        type: 'array',
        minItems: 3, maxItems: 3,
        description: 'EXACTLY 3 defensive moves — these close identified gaps. Ordered by urgency (most urgent first).',
        items: { $ref: '#/$defs/strategy_move' },
      },
      expansion_moves: {
        type: 'array',
        minItems: 3, maxItems: 3,
        description: 'EXACTLY 3 expansion moves — these grow the lead. Ordered by expected impact (highest first).',
        items: { $ref: '#/$defs/strategy_move' },
      },
      page7_intro: {
        type: 'string',
        description: 'Intro for the 30/60/90 plan. 25-45 words. Uses <em>.',
      },
      roadmap: {
        type: 'array',
        minItems: 6, maxItems: 6,
        description: 'EXACTLY 6 roadmap items, one per strategy move. Sequenced by dependency. Defense moves earlier than expansion typically.',
        items: { $ref: '#/$defs/roadmap_item' },
      },
      methodology_paragraph: {
        type: 'string',
        description: '70-100 words on how the test works, what it covers, and what it does NOT cover (e.g. "This brief does not measure conversion or revenue directly — it measures how AI answer engines represent you to buyers.").',
      },
    },
    $defs: {
      take_card: {
        type: 'object',
        required: ['tag', 'big', 'heading', 'body'],
        properties: {
          tag: { type: 'string', description: 'Label like "01 · The Win", "02 · The Watch", "03 · The Move".' },
          big: { type: 'string', description: 'Headline metric. Can contain HTML like "8 / 10" or "1<span class=\\"unit\\"> rival</span>".' },
          heading: { type: 'string', description: 'Sentence-case heading, 3-6 words.' },
          body: { type: 'string', description: '30-50 words of supporting detail. Specific, not generic.' },
        },
      },
      numbered_insight: {
        type: 'object',
        required: ['number', 'title', 'body', 'proof_metric', 'proof_label'],
        properties: {
          number: { type: 'string', description: '"01" through "04".' },
          title: { type: 'string', description: 'Sentence-case title, 4-8 words.' },
          body: { type: 'string', description: '50-85 words of specific evidence + interpretation.' },
          proof_metric: { type: 'string', description: 'The hard number, e.g. "8 / 10", "95%", "+12 pts".' },
          proof_label: { type: 'string', description: 'What the metric measures, 3-6 words lowercase.' },
        },
      },
      strategy_move: {
        type: 'object',
        required: ['number', 'title', 'description', 'evidence_line', 'expected_outcome', 'impact', 'effort', 'owner'],
        properties: {
          number: { type: 'string', description: '"01" through "06".' },
          title: { type: 'string', description: '4-8 word title in sentence case.' },
          description: { type: 'string', description: '45-75 words describing what to do and why.' },
          evidence_line: { type: 'string', description: 'Format: "Prompt: \\"...\\" · Cluster: X · Current: Y/100"' },
          expected_outcome: { type: 'string', description: 'Projected improvement, e.g. "+5 pts adjacent cluster".' },
          impact: { type: 'string', enum: ['High', 'Medium', 'Low'] },
          effort: { type: 'string', enum: ['High', 'Medium', 'Low'] },
          owner: { type: 'string', description: '"Marketer", "Developer", "Business Owner", or combinations.' },
        },
      },
      roadmap_item: {
        type: 'object',
        required: ['phase', 'move_number', 'title'],
        properties: {
          phase: { type: 'string', enum: ['30', '60', '90'] },
          move_number: { type: 'string', description: '"01" through "06" — references a move by its number.' },
          title: { type: 'string', description: 'Short title for the roadmap cell, 3-6 words.' },
          dependency_note: { type: 'string', description: 'Optional. "after move 03" etc.' },
        },
      },
    },
  },
} as const;

// ------------------------------------------------------------
// Main entry point.
// ------------------------------------------------------------
const NARRATIVE_MODEL = 'claude-sonnet-4-6-20250929';

export async function generateReportNarrative(
  payload: ReportExportPayload,
): Promise<{ narrative: ReportNarrative; model: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(payload);

  const body = {
    model: NARRATIVE_MODEL,
    max_tokens: 8192,
    system: systemPrompt,
    tools: [NARRATIVE_TOOL],
    tool_choice: { type: 'tool', name: 'emit_report_narrative' },
    messages: [{ role: 'user', content: userPrompt }],
  };

  const res = await claudeFetchWithRetry(
    () => fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    }),
    { label: 'generateReportNarrative' },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '(no body)');
    throw new Error(`Narrative generator: HTTP ${res.status} — ${errText.slice(0, 300)}`);
  }

  const data = await res.json() as {
    content?: Array<{ type: string; name?: string; input?: unknown; text?: string }>;
    stop_reason?: string;
    model?: string;
  };

  // Find the tool_use block.
  const toolUse = (data.content || []).find(b => b.type === 'tool_use');
  if (!toolUse) {
    // Give the caller something useful to debug with
    const textBlock = (data.content || []).find(b => b.type === 'text');
    throw new Error(
      `Narrative generator did not return a tool_use block. stop_reason=${data.stop_reason}. ` +
      `First text block (if any): ${textBlock?.text?.slice(0, 300) || '(none)'}`,
    );
  }
  if (toolUse.name !== 'emit_report_narrative') {
    throw new Error(`Unexpected tool: ${toolUse.name}`);
  }

  const narrative = toolUse.input as unknown as ReportNarrative;

  // Light post-validation: counts the schema can't enforce reliably
  if (!narrative.insights || narrative.insights.length !== 4) {
    throw new Error(`Expected 4 insights, got ${narrative.insights?.length ?? 0}`);
  }
  if (!narrative.defense_moves || narrative.defense_moves.length !== 3 ||
      !narrative.expansion_moves || narrative.expansion_moves.length !== 3) {
    throw new Error('Expected 3 defense + 3 expansion moves');
  }
  if (!narrative.roadmap || narrative.roadmap.length !== 6) {
    throw new Error(`Expected 6 roadmap items, got ${narrative.roadmap?.length ?? 0}`);
  }

  return { narrative, model: NARRATIVE_MODEL };
}

// ------------------------------------------------------------
// Prompt construction.
// ------------------------------------------------------------
function buildSystemPrompt(): string {
  return [
    'You are a senior AI-positioning analyst writing a monthly strategy brief for a business owner.',
    '',
    'Your job: read structured data about how AI tools answer buyer-intent questions about this business, and produce the narrative sections of a 7-page printed brief.',
    '',
    'Voice:',
    '- Direct. You tell the owner what is true, not what sounds nice.',
    '- Specific. Every claim cites a number or a prompt from the data.',
    '- No marketing language. "Leverage", "robust", "best-in-class", "world-class", "cutting-edge", "blazing-fast", "revolutionary" are forbidden.',
    '- No em-dash as sentence separator. Use commas, periods, or parentheses.',
    '- Prose, not bullets. The schema gives you fields; write full sentences inside them.',
    '',
    'Honesty:',
    '- If the data shows one snapshot, do NOT invent a trend. Say "this is the baseline".',
    '- If no competitor beat the business on any prompt, the rival spotlight becomes "the closest challenger" — do not invent a bigger threat than the data shows.',
    '- If a cluster has no prompts in the data, do not write as if it does.',
    '',
    'Format:',
    '- Output ONLY via the emit_report_narrative tool. Do not write anything else.',
    '- Populate every required field.',
    '- Respect word counts in field descriptions.',
  ].join('\n');
}

function buildUserPrompt(payload: ReportExportPayload): string {
  // Summarise the payload for the model rather than dumping raw JSON —
  // easier for it to reason about, cheaper on tokens, and forces the
  // model to work from facts we've surfaced (reduces hallucination).
  const p = payload;
  const s = p.scores;

  const parts: string[] = [];

  parts.push('=== BUSINESS ===');
  parts.push(`Name: ${p.meta.business_name || '(unknown)'}`);
  parts.push(`Domain: ${p.meta.domain || '(unknown)'}`);
  parts.push(`Category: ${p.meta.primary_category || '(unspecified)'}`);
  parts.push(`Service area: ${p.meta.service_area || '(unspecified)'}`);
  parts.push(`Snapshot date: ${p.meta.snapshot_date}`);
  parts.push('');

  parts.push('=== OVERALL SCORES ===');
  parts.push(`Overall: ${s.overall_score}/100 (grade ${s.overall_grade})`);
  parts.push('Cluster scores:');
  for (const [cluster, score] of Object.entries(s.cluster_scores)) {
    parts.push(`  ${cluster}: ${score === null ? 'n/a' : score + '/100'}`);
  }
  parts.push(`Prompts tested: ${s.counts.prompt_count}`);
  parts.push(`Strong presence: ${s.counts.strong_count}`);
  parts.push(`Partial presence: ${s.counts.partial_count}`);
  parts.push(`Absent: ${s.counts.absent_count}`);
  parts.push(`Competitor-dominant: ${s.counts.competitor_dominant_count}`);
  parts.push('');

  parts.push('=== PROMPTS TESTED ===');
  // Sort high-priority first so the model's framing anchors on high-intent queries
  const prompts = [...p.prompts_tested].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return (order[a.priority] ?? 1) - (order[b.priority] ?? 1);
  });
  for (const pr of prompts) {
    const parts2: string[] = [];
    parts2.push(`  [${pr.priority.toUpperCase()}] "${pr.prompt_text}"`);
    parts2.push(`    cluster=${pr.cluster} score=${pr.score} visibility=${pr.visibility_status} position=${pr.business_position_type ?? 'none'}`);
    parts2.push(`    mentioned=${pr.business_mentioned} cited=${pr.business_cited} confidence=${pr.confidence_score ?? 'n/a'}`);
    if (pr.competitor_names_detected.length) {
      parts2.push(`    competitors: ${pr.competitor_names_detected.join(', ')}`);
    }
    if (pr.directories_detected.length) {
      parts2.push(`    directories: ${pr.directories_detected.join(', ')}`);
    }
    if (pr.result_type_summary) {
      parts2.push(`    summary: ${pr.result_type_summary}`);
    }
    if (pr.raw_response_excerpt) {
      // Keep the excerpt — this is what the model should adapt for the money quote
      const trimmed = pr.raw_response_excerpt.length > 400
        ? pr.raw_response_excerpt.slice(0, 400) + '...'
        : pr.raw_response_excerpt;
      parts2.push(`    excerpt: ${trimmed.replace(/\s+/g, ' ')}`);
    }
    parts.push(parts2.join('\n'));
  }
  parts.push('');

  if (p.competitors.length) {
    parts.push('=== COMPETITORS DETECTED ===');
    for (const c of p.competitors) {
      parts.push(`  ${c.name}: appeared ${c.times_appeared}×, beat us ${c.times_beat_us}×`);
      for (const w of c.prompts_where_they_won.slice(0, 3)) {
        parts.push(`    - won on: "${w.prompt_text}" (${w.cluster}, ${w.visibility_status})`);
      }
    }
    parts.push('');
  }

  if (p.insights.length) {
    parts.push('=== PRE-COMPUTED INSIGHTS (for your reference) ===');
    for (const ins of p.insights) {
      parts.push(`  [${ins.severity}/${ins.category}] ${ins.title}`);
      if (ins.description) parts.push(`    ${ins.description}`);
    }
    parts.push('');
  }

  if (p.recommendations.length) {
    parts.push('=== PRE-COMPUTED RECOMMENDATIONS (for your reference) ===');
    for (const r of p.recommendations) {
      parts.push(`  [${r.priority}] ${r.title}`);
      if (r.description) parts.push(`    ${r.description}`);
      if (r.why_it_matters) parts.push(`    why: ${r.why_it_matters}`);
      parts.push(`    owner=${r.owner_type} impact=${r.impact_estimate} difficulty=${r.difficulty_estimate}`);
    }
    parts.push('');
  }

  parts.push('=== TREND ===');
  parts.push(`Snapshots: ${p.trend.snapshots_count}`);
  parts.push(`Trend data available: ${p.trend.available}`);
  if (p.trend.overall_change_from_previous !== null) {
    parts.push(`Change from previous run: ${p.trend.overall_change_from_previous > 0 ? '+' : ''}${p.trend.overall_change_from_previous}`);
  }
  if (p.trend.overall_change_from_first !== null) {
    parts.push(`Change from first run: ${p.trend.overall_change_from_first > 0 ? '+' : ''}${p.trend.overall_change_from_first}`);
  }
  parts.push('');

  parts.push('Now emit the narrative via the emit_report_narrative tool.');
  parts.push('You may draw on the pre-computed insights and recommendations, but rewrite them — do not copy verbatim.');
  parts.push('The strategy_move set (3 defense + 3 expansion) must cover the most important gaps and opportunities in the data. It does NOT need to mirror the pre-computed recommendations 1:1.');

  return parts.join('\n');
}
