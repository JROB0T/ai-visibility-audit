// ============================================================
// Report template styles — extracted verbatim from the C&C Air
// reference report. Exported as a string so the template
// builder can inline it into a self-contained HTML document
// (important for PDF rendering — no external stylesheet).
//
// To update styles, edit the reference HTML, re-run the
// extraction script, and replace this file.
// ============================================================

/* eslint-disable */
export const REPORT_STYLES = `  :root {
    --ink: #15171c;
    --ink-2: #2b2e37;
    --ink-3: #4d525e;
    --ink-4: #7a8090;
    --ink-5: #a8aebd;
    --paper: #f5f1e8;
    --paper-2: #ede7d8;
    --paper-3: #e2dbc8;
    --rule: #d4ccb7;
    --rule-2: #e8e1cc;

    --red: #c8322d;
    --red-dim: rgba(200,50,45,0.08);
    --amber: #b8851c;
    --amber-dim: rgba(184,133,28,0.1);
    --green: #3d6b4a;
    --green-dim: rgba(61,107,74,0.08);
    --ink-dim: rgba(21,23,28,0.06);
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { background: #1e1a12; }

  body {
    font-family: 'Geist', -apple-system, sans-serif;
    color: var(--ink);
    background: #1e1a12;
    font-size: 13px;
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
    padding: 48px 20px;
    font-feature-settings: "ss01", "cv11";
  }

  .page {
    background: var(--paper);
    width: 8.5in;
    min-height: 11in;
    margin: 0 auto 40px auto;
    padding: 0.75in 0.85in 1.1in 0.85in;
    position: relative;
    box-shadow: 0 30px 80px rgba(0,0,0,0.4), 0 2px 12px rgba(0,0,0,0.25);
    overflow: hidden;
  }

  /* subtle paper texture */
  .page::before {
    content: "";
    position: absolute;
    inset: 0;
    opacity: 0.6;
    background-image:
      radial-gradient(circle at 15% 25%, rgba(184,133,28,0.03) 0%, transparent 40%),
      radial-gradient(circle at 85% 75%, rgba(200,50,45,0.02) 0%, transparent 40%);
    pointer-events: none;
    z-index: 0;
  }
  .page > * { position: relative; z-index: 1; }

  /* ---------- shared typography ---------- */
  .serif { font-family: 'Fraunces', Georgia, serif; font-variation-settings: 'opsz' 144; }
  .serif-italic { font-family: 'Instrument Serif', Georgia, serif; font-style: italic; }
  .mono { font-family: 'Geist Mono', monospace; }

  .kicker {
    font-family: 'Geist Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--red);
    font-weight: 500;
  }

  .label {
    font-family: 'Geist Mono', monospace;
    font-size: 9.5px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--ink-4);
    font-weight: 500;
  }

  h1, h2, h3, h4 { font-family: 'Fraunces', Georgia, serif; font-variation-settings: 'opsz' 144; font-weight: 400; letter-spacing: -0.015em; }

  /* ---------- shared masthead ---------- */
  .masthead {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--rule);
    margin-bottom: 40px;
    font-family: 'Geist Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-4);
  }
  .masthead .logo {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .masthead .logo-mark {
    width: 18px; height: 18px;
    border-radius: 50%;
    background: var(--ink);
    position: relative;
  }
  .masthead .logo-mark::after {
    content: "";
    position: absolute;
    inset: 4px;
    border-radius: 50%;
    background: var(--paper);
  }
  .masthead .logo-mark::before {
    content: "";
    position: absolute;
    inset: 7px;
    border-radius: 50%;
    background: var(--red);
    z-index: 1;
  }
  .masthead .logo-text { color: var(--ink); font-weight: 500; letter-spacing: 0.1em; }
  .masthead .sect {
    display: flex; gap: 16px; align-items: center;
  }
  .masthead .num-badge {
    padding: 3px 9px;
    background: var(--ink);
    color: var(--paper);
    border-radius: 2px;
    font-size: 9px;
    letter-spacing: 0.15em;
  }

  /* ---------- page footer ---------- */
  .page-footer {
    position: absolute;
    bottom: 0.4in;
    left: 0.85in;
    right: 0.85in;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: 'Geist Mono', monospace;
    font-size: 9px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-5);
    padding-top: 10px;
    border-top: 1px solid var(--rule-2);
    z-index: 2;
  }
  .page-footer .num {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 14px;
    letter-spacing: 0;
    text-transform: none;
    color: var(--ink-3);
    font-weight: 500;
  }
  .page-footer .sep {
    width: 3px; height: 3px; border-radius: 50%;
    background: var(--ink-5);
    display: inline-block;
  }
  .page-footer .left-bits {
    display: flex; align-items: center; gap: 10px;
  }

  /* =================================================================== */
  /* PAGE 1 — EXECUTIVE SUMMARY                                          */
  /* =================================================================== */
  .cover {
    padding-top: 8px;
  }
  .cover .period-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 28px;
  }
  .cover .period {
    font-family: 'Geist Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--red);
    font-weight: 600;
  }
  .cover .issue-tag {
    font-family: 'Geist Mono', monospace;
    font-size: 10px;
    color: var(--ink-4);
    letter-spacing: 0.1em;
  }
  .cover h1 {
    font-size: 68px;
    line-height: 0.95;
    color: var(--ink);
    margin-bottom: 6px;
    font-weight: 300;
    letter-spacing: -0.025em;
  }
  .cover h1 .emph {
    font-family: 'Instrument Serif', serif;
    font-style: italic;
    font-weight: 400;
    color: var(--red);
  }
  .cover .client-line {
    font-size: 14px;
    color: var(--ink-3);
    margin-bottom: 44px;
    max-width: 540px;
    line-height: 1.5;
  }

  /* Hero summary grid */
  .hero-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 56px;
    align-items: start;
    padding: 32px 0 32px;
    border-top: 1px solid var(--ink);
    border-bottom: 1px solid var(--rule);
    margin-bottom: 36px;
  }

  .score-hero .label { margin-bottom: 14px; }
  .score-hero .score-row {
    display: flex;
    align-items: baseline;
    gap: 16px;
    margin-bottom: 14px;
  }
  .score-hero .num {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 300;
    font-size: 128px;
    line-height: 0.85;
    letter-spacing: -0.045em;
    color: var(--ink);
    font-variation-settings: 'opsz' 144;
  }
  .score-hero .num-denom {
    font-size: 28px;
    color: var(--ink-5);
  }
  .score-hero .grade-chip {
    display: inline-block;
    padding: 6px 12px;
    background: var(--green);
    color: var(--paper);
    border-radius: 2px;
    font-family: 'Geist Mono', monospace;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.08em;
    margin-bottom: 14px;
  }
  .score-hero .posture {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 10px 0 16px;
    margin-bottom: 6px;
  }
  .score-hero .posture .p-lab {
    font-family: 'Geist Mono', monospace;
    font-size: 9px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--ink-5);
  }
  .score-hero .posture .p-val {
    font-family: 'Instrument Serif', serif;
    font-style: italic;
    font-size: 22px;
    color: var(--red);
    letter-spacing: -0.005em;
    font-weight: 400;
  }
  .score-hero .delta-strip {
    display: flex;
    gap: 32px;
    padding-top: 16px;
    border-top: 1px solid var(--rule);
  }
  .score-hero .delta-strip .cell .dlab {
    display: block;
    font-family: 'Geist Mono', monospace;
    font-size: 9px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--ink-5);
    margin-bottom: 6px;
  }
  .score-hero .delta-strip .cell .dval {
    font-family: 'Fraunces', serif;
    font-weight: 500;
    font-size: 18px;
    color: var(--ink);
    letter-spacing: -0.005em;
  }
  .score-hero .delta-strip .cell .dval .sub {
    font-family: 'Geist Mono', monospace;
    font-size: 10px;
    color: var(--ink-5);
    margin-left: 6px;
    font-weight: 400;
  }

  .score-lede {
    padding-top: 6px;
  }
  .score-lede .label { margin-bottom: 18px; }
  .score-lede .lede {
    font-family: 'Fraunces', Georgia, serif;
    font-variation-settings: 'opsz' 72;
    font-size: 21px;
    line-height: 1.32;
    color: var(--ink);
    font-weight: 400;
    letter-spacing: -0.005em;
  }
  .score-lede .lede em {
    font-family: 'Instrument Serif', serif;
    font-style: italic;
    color: var(--red);
    font-weight: 400;
  }
  .score-lede .lede strong { font-weight: 600; }

  /* Three takeaway cards */
  .takeaway-row {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 24px;
    margin-bottom: 36px;
  }
  .take-card {
    padding-top: 16px;
    border-top: 1px solid var(--ink);
    position: relative;
  }
  .take-card .tag-num {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.2em;
    color: var(--red);
    text-transform: uppercase;
    margin-bottom: 8px;
  }
  .take-card .big {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 400;
    font-size: 34px;
    line-height: 1;
    color: var(--ink);
    letter-spacing: -0.02em;
    margin-bottom: 6px;
  }
  .take-card .big .unit { font-size: 14px; color: var(--ink-4); font-weight: 400; margin-left: 4px; }
  .take-card h3 {
    font-size: 14px;
    font-weight: 500;
    color: var(--ink);
    margin-bottom: 6px;
    letter-spacing: -0.005em;
  }
  .take-card p {
    font-size: 12px;
    line-height: 1.5;
    color: var(--ink-3);
  }

  /* Cluster radar block */
  .cluster-hero {
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: 36px;
    align-items: center;
    padding: 28px 32px;
    background: var(--paper-2);
    border-radius: 4px;
    margin-bottom: 28px;
  }
  .cluster-hero .chart-wrap {
    position: relative;
    width: 260px;
    height: 260px;
    margin: 0 auto;
  }
  .cluster-hero svg { width: 100%; height: 100%; }
  .cluster-hero .chart-center {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
  }
  .cluster-hero .chart-center .big-num {
    font-family: 'Fraunces', serif;
    font-weight: 400;
    font-size: 38px;
    line-height: 1;
    color: var(--ink);
    letter-spacing: -0.02em;
  }
  .cluster-hero .chart-center .sub {
    font-family: 'Geist Mono', monospace;
    font-size: 9px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--ink-4);
    margin-top: 2px;
  }
  .cluster-hero .side .label { margin-bottom: 12px; }
  .cluster-hero .side h3 {
    font-size: 22px;
    line-height: 1.2;
    color: var(--ink);
    margin-bottom: 10px;
    font-weight: 500;
    letter-spacing: -0.01em;
  }
  .cluster-hero .side p {
    font-size: 13px;
    color: var(--ink-3);
    line-height: 1.55;
  }

  .how-strip {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 24px;
    padding-top: 18px;
    border-top: 1px solid var(--rule);
  }
  .how-strip .cell .label { margin-bottom: 6px; }
  .how-strip .cell .val {
    font-family: 'Geist Mono', monospace;
    font-size: 11px;
    color: var(--ink-2);
    letter-spacing: 0.02em;
    line-height: 1.5;
  }

  /* =================================================================== */
  /* PAGE 2 — THE VERDICT (deep read)                                    */
  /* =================================================================== */
  .verdict-page .huge-statement {
    font-family: 'Fraunces', serif;
    font-weight: 300;
    font-size: 44px;
    line-height: 1.12;
    letter-spacing: -0.025em;
    color: var(--ink);
    margin-bottom: 32px;
    max-width: 680px;
  }
  .verdict-page .huge-statement .em-red {
    font-family: 'Instrument Serif', serif;
    font-style: italic;
    color: var(--red);
    font-weight: 400;
  }

  .insight-stack {
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .insight {
    display: grid;
    grid-template-columns: 36px 1fr 130px;
    gap: 20px;
    padding: 22px 0;
    border-bottom: 1px solid var(--rule-2);
    align-items: start;
  }
  .insight:first-child { border-top: 1px solid var(--ink); padding-top: 24px; }
  .insight:last-child { border-bottom: 1px solid var(--ink); }
  .insight .i-num {
    font-family: 'Fraunces', serif;
    font-weight: 400;
    font-size: 22px;
    color: var(--red);
    letter-spacing: -0.02em;
    padding-top: 2px;
  }
  .insight .i-body h3 {
    font-family: 'Fraunces', serif;
    font-weight: 500;
    font-size: 17px;
    color: var(--ink);
    letter-spacing: -0.005em;
    margin-bottom: 6px;
  }
  .insight .i-body p {
    font-size: 12.5px;
    line-height: 1.6;
    color: var(--ink-2);
  }
  .insight .i-body p strong { color: var(--ink); font-weight: 600; }
  .insight .i-body p em {
    font-family: 'Instrument Serif', serif;
    font-style: italic;
    color: var(--red);
    font-weight: 400;
  }
  .insight .i-proof {
    text-align: right;
    padding-left: 8px;
    border-left: 1px solid var(--rule);
    padding-top: 2px;
  }
  .insight .i-proof .p-lab {
    font-family: 'Geist Mono', monospace;
    font-size: 9px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--ink-5);
    margin-bottom: 4px;
  }
  .insight .i-proof .p-val {
    font-family: 'Fraunces', serif;
    font-weight: 400;
    font-size: 30px;
    color: var(--ink);
    line-height: 1;
    letter-spacing: -0.02em;
  }
  .insight .i-proof .p-cap {
    font-family: 'Geist Mono', monospace;
    font-size: 9px;
    letter-spacing: 0.08em;
    color: var(--ink-4);
    margin-top: 4px;
    text-transform: uppercase;
  }

  .state-grid {
    columns: 2;
    column-gap: 44px;
    margin-bottom: 44px;
  }
  .state-grid p {
    font-size: 13.5px;
    line-height: 1.65;
    color: var(--ink-2);
    break-inside: avoid;
    margin-bottom: 14px;
  }
  .state-grid p:first-child::first-letter {
    font-family: 'Fraunces', serif;
    font-weight: 400;
    float: left;
    font-size: 64px;
    line-height: 0.85;
    padding: 6px 8px 0 0;
    color: var(--red);
  }
  .state-grid strong { color: var(--ink); font-weight: 600; }

  /* Bar strip showing distribution */
  .distribution {
    margin-bottom: 28px;
  }
  .distribution .label { margin-bottom: 12px; }
  .distribution-bar {
    display: flex;
    height: 44px;
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 10px;
  }
  .distribution-bar .seg {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    padding: 0 14px;
    color: var(--paper);
    font-family: 'Geist Mono', monospace;
    font-size: 11px;
    letter-spacing: 0.05em;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
  }
  .distribution-bar .seg .n {
    font-family: 'Fraunces', serif;
    font-size: 20px;
    font-weight: 400;
    margin-right: 8px;
  }
  .seg-strong { background: var(--green); flex: 12; }
  .seg-partial { background: var(--amber); flex: 7; }
  .seg-unclear { background: var(--ink-3); flex: 1.2; min-width: 110px; }
  .seg-absent { background: var(--ink-dim); color: var(--ink-5); flex: 0.8; min-width: 90px; }

  .dist-legend {
    display: flex;
    justify-content: space-between;
    font-family: 'Geist Mono', monospace;
    font-size: 9px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--ink-4);
  }

  /* =================================================================== */
  /* PAGE 3 — EVIDENCE                                                   */
  /* =================================================================== */
  .money-quote {
    position: relative;
    padding: 28px 32px 28px 48px;
    background: var(--paper-2);
    border-radius: 3px;
    margin-bottom: 28px;
  }
  .money-quote::before {
    content: "";
    position: absolute;
    left: 20px;
    top: 24px;
    bottom: 24px;
    width: 3px;
    background: var(--red);
  }
  .money-quote .src {
    font-family: 'Geist Mono', monospace;
    font-size: 9.5px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--red);
    margin-bottom: 12px;
    font-weight: 500;
  }
  .money-quote blockquote {
    font-family: 'Instrument Serif', serif;
    font-style: italic;
    font-size: 17px;
    line-height: 1.5;
    color: var(--ink);
    letter-spacing: -0.005em;
  }
  .money-quote blockquote .nm {
    font-style: normal;
    font-family: 'Fraunces', serif;
    font-weight: 600;
  }
  .money-quote .cite {
    font-family: 'Geist Mono', monospace;
    font-size: 9.5px;
    color: var(--ink-5);
    margin-top: 14px;
    letter-spacing: 0.05em;
  }

  table.prompts {
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
  }
  table.prompts th {
    text-align: left;
    font-family: 'Geist Mono', monospace;
    font-size: 9px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--ink-4);
    padding: 0 10px 10px 0;
    border-bottom: 1px solid var(--ink);
    font-weight: 500;
  }
  table.prompts td {
    padding: 12px 10px 12px 0;
    border-bottom: 1px solid var(--rule-2);
    vertical-align: top;
    color: var(--ink-2);
  }
  table.prompts td.q {
    font-family: 'Fraunces', serif;
    font-weight: 400;
    font-size: 13.5px;
    color: var(--ink);
    max-width: 250px;
    line-height: 1.35;
  }
  table.prompts td.type {
    font-family: 'Geist Mono', monospace;
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-4);
  }
  table.prompts td.status {
    white-space: nowrap;
    font-size: 12px;
  }
  .status-dot {
    display: inline-block;
    width: 8px; height: 8px; border-radius: 50%;
    margin-right: 8px;
    vertical-align: baseline;
    position: relative;
    top: -1px;
  }
  .status-dot.first { background: var(--green); }
  .status-dot.listed { background: var(--amber); }
  .status-dot.incon {
    background: transparent;
    border: 1.5px solid var(--ink-4);
    width: 6px; height: 6px;
  }
  .status-txt.first { color: var(--green); font-weight: 500; }
  .status-txt.listed { color: var(--amber); font-weight: 500; }
  .status-txt.incon { color: var(--ink-3); }
  table.prompts .who {
    font-size: 12px;
    color: var(--ink-3);
    line-height: 1.4;
    max-width: 220px;
  }
  table.prompts .who em { font-style: normal; color: var(--red); font-weight: 500; }

  .prompt-footnote {
    margin-top: 20px;
    padding-top: 14px;
    border-top: 1px solid var(--rule-2);
    font-family: 'Geist Mono', monospace;
    font-size: 9.5px;
    color: var(--ink-5);
    line-height: 1.7;
    letter-spacing: 0.03em;
  }

  /* =================================================================== */
  /* PAGE 4 — FIELD                                                      */
  /* =================================================================== */
  .page-intro {
    font-family: 'Fraunces', serif;
    font-weight: 400;
    font-size: 22px;
    line-height: 1.4;
    color: var(--ink-2);
    max-width: 600px;
    margin-bottom: 40px;
    letter-spacing: -0.01em;
  }
  .page-intro em {
    font-family: 'Instrument Serif', serif;
    font-style: italic;
    color: var(--red);
    font-weight: 400;
  }

  .field-duo {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;
    margin-bottom: 32px;
  }
  .field-stat {
    padding: 24px 26px;
    background: var(--paper-2);
    border-radius: 3px;
    position: relative;
  }
  .field-stat .label { margin-bottom: 16px; }
  .field-stat .big {
    font-family: 'Fraunces', serif;
    font-weight: 300;
    font-size: 72px;
    line-height: 0.9;
    color: var(--ink);
    letter-spacing: -0.04em;
    margin-bottom: 12px;
  }
  .field-stat .big.red { color: var(--red); }
  .field-stat .caption {
    font-family: 'Geist Mono', monospace;
    font-size: 9.5px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-4);
    margin-bottom: 14px;
  }
  .field-stat p {
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--ink-3);
  }
  .field-stat p strong { color: var(--ink); font-weight: 600; }

  .watch-block {
    padding: 22px 26px;
    border-left: 3px solid var(--amber);
    background: var(--amber-dim);
    margin-bottom: 32px;
  }
  .watch-block .label { color: var(--amber); margin-bottom: 10px; font-weight: 600; }
  .watch-block p {
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--ink-2);
  }
  .watch-block strong { color: var(--ink); font-weight: 600; }
  .watch-block em { font-style: normal; color: var(--red); font-weight: 500; }

  /* Rival hero — elevated competitor finding */
  .rival-hero {
    border: 1px solid var(--ink);
    border-left: 4px solid var(--red);
    padding: 26px 28px;
    margin-bottom: 32px;
    background: var(--paper-2);
  }
  .rival-top {
    display: grid;
    grid-template-columns: 1fr 110px;
    gap: 20px;
    align-items: start;
    padding-bottom: 20px;
    border-bottom: 1px solid var(--rule);
    margin-bottom: 20px;
  }
  .rival-head .label { margin-bottom: 6px; font-weight: 600; }
  .rival-name {
    font-family: 'Fraunces', serif;
    font-weight: 500;
    font-size: 26px;
    color: var(--ink);
    letter-spacing: -0.015em;
    margin: 2px 0 10px;
  }
  .rival-meta {
    font-family: 'Geist Mono', monospace;
    font-size: 10px;
    color: var(--ink-3);
    letter-spacing: 0.03em;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
  }
  .rival-meta strong { color: var(--ink); font-weight: 500; }
  .rival-meta .sep-dot {
    width: 3px; height: 3px; border-radius: 50%;
    background: var(--ink-5);
  }
  .rival-score {
    text-align: right;
    border-left: 1px solid var(--rule);
    padding-left: 20px;
  }
  .rival-score .rs-num {
    font-family: 'Fraunces', serif;
    font-weight: 400;
    font-size: 44px;
    color: var(--red);
    line-height: 1;
    letter-spacing: -0.02em;
  }
  .rival-score .rs-lab {
    font-family: 'Geist Mono', monospace;
    font-size: 9px;
    color: var(--ink-4);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    margin-top: 6px;
  }
  .rival-excerpt {
    background: var(--paper);
    padding: 18px 22px;
    border-left: 2px solid var(--ink-3);
    margin-bottom: 18px;
  }
  .rival-excerpt .exc-lab {
    font-family: 'Geist Mono', monospace;
    font-size: 9px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--ink-4);
    font-weight: 500;
    margin-bottom: 10px;
  }
  .rival-excerpt blockquote {
    font-family: 'Instrument Serif', serif;
    font-style: italic;
    font-size: 15px;
    line-height: 1.5;
    color: var(--ink);
  }
  .rival-excerpt blockquote .hl-rival {
    font-style: normal;
    font-family: 'Fraunces', serif;
    font-weight: 600;
    color: var(--red);
    background: rgba(200,50,45,0.12);
    padding: 0 4px;
  }
  .rival-implication .imp-lab {
    font-family: 'Geist Mono', monospace;
    font-size: 9px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--ink-4);
    font-weight: 500;
    margin-bottom: 8px;
  }
  .rival-implication p {
    font-size: 13px;
    line-height: 1.6;
    color: var(--ink-2);
  }

  /* Vulnerability map */
  .vuln-map {
    margin-top: 32px;
  }
  .vuln-head {
    padding-bottom: 12px;
    border-bottom: 1px solid var(--ink);
    margin-bottom: 14px;
  }
  .vuln-head .vuln-sub {
    font-size: 12px;
    color: var(--ink-3);
    margin-top: 4px;
    font-family: 'Geist', sans-serif;
    letter-spacing: 0;
    text-transform: none;
  }
  .vuln-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  .vuln-table th {
    text-align: left;
    font-family: 'Geist Mono', monospace;
    font-size: 9px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--ink-4);
    padding: 0 10px 10px 0;
    border-bottom: 1px solid var(--rule);
    font-weight: 500;
  }
  .vuln-table td {
    padding: 11px 10px 11px 0;
    border-bottom: 1px solid var(--rule-2);
    vertical-align: middle;
    color: var(--ink-2);
  }
  .vuln-table tr.risk-high {
    background: rgba(200,50,45,0.04);
  }
  .vuln-table tr.risk-high td.p-q { font-weight: 500; }
  .vuln-table td.p-q {
    font-family: 'Fraunces', serif;
    font-size: 13px;
    color: var(--ink);
    letter-spacing: -0.005em;
  }
  .vuln-table td.p-c, .vuln-table td.p-p {
    font-family: 'Geist Mono', monospace;
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-4);
  }
  .vuln-table td.p-s {
    font-family: 'Geist Mono', monospace;
    font-size: 11px;
    font-weight: 500;
    color: var(--ink);
    white-space: nowrap;
  }
  .vuln-table .s-bar {
    display: inline-block;
    width: 44px; height: 5px;
    background: var(--paper-3);
    border-radius: 2px;
    position: relative;
    margin-right: 8px;
    vertical-align: middle;
  }
  .vuln-table .s-fill {
    position: absolute;
    left: 0; top: 0;
    height: 100%;
    border-radius: 2px;
  }
  .vuln-table .s-fill.amber { background: var(--amber); }
  .vuln-table .s-fill.ink { background: var(--ink-3); }
  .vuln-table td.p-r {
    font-size: 11px;
    color: var(--ink-3);
  }
  .vuln-table td.p-r strong { color: var(--ink); font-weight: 500; }
  .r-dot {
    display: inline-block;
    width: 7px; height: 7px; border-radius: 50%;
    margin-right: 8px;
    vertical-align: baseline;
    position: relative;
    top: -1px;
  }
  .r-dot.high { background: var(--red); }
  .r-dot.med { background: var(--amber); }
  .r-dot.low { background: var(--ink-4); }
  .vuln-foot {
    display: flex;
    gap: 24px;
    margin-top: 14px;
    padding-top: 10px;
    border-top: 1px solid var(--rule-2);
    font-family: 'Geist Mono', monospace;
    font-size: 9.5px;
    letter-spacing: 0.05em;
    color: var(--ink-4);
  }

  /* Bar chart for cluster scores */
  .cluster-chart {
    margin-top: 32px;
  }
  .cluster-chart .label { margin-bottom: 18px; }
  .cluster-bars {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .cluster-bar {
    display: grid;
    grid-template-columns: 130px 1fr 44px 64px;
    align-items: center;
    gap: 12px;
    font-size: 12.5px;
  }
  .cluster-bar .nm {
    font-family: 'Fraunces', serif;
    font-weight: 500;
    color: var(--ink);
  }
  .cluster-bar .track {
    position: relative;
    height: 28px;
    background: var(--paper-3);
    border-radius: 2px;
    overflow: hidden;
  }
  .cluster-bar .fill {
    position: absolute;
    left: 0; top: 0;
    height: 100%;
    background: var(--ink);
    border-radius: 2px 0 0 2px;
  }
  .cluster-bar .fill.green { background: var(--green); }
  .cluster-bar .fill.amber { background: var(--amber); }
  .cluster-bar .track .tick {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: rgba(21,23,28,0.15);
  }
  .cluster-bar .val {
    font-family: 'Fraunces', serif;
    font-size: 18px;
    font-weight: 500;
    color: var(--ink);
    text-align: right;
    letter-spacing: -0.01em;
  }
  .cluster-bar .dt {
    font-family: 'Geist Mono', monospace;
    font-size: 10px;
    color: var(--ink-4);
    text-align: right;
  }
  .cluster-bar .dt.up { color: var(--green); }
  .cluster-bar .dt.down { color: var(--red); }

  /* =================================================================== */
  /* PAGE 5 — WHAT MOVED                                                 */
  /* =================================================================== */
  .trend-wrap {
    background: var(--paper-2);
    padding: 28px 32px 24px;
    border-radius: 3px;
    margin-bottom: 32px;
  }
  .trend-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 16px;
  }
  .trend-head h3 {
    font-size: 16px;
    font-weight: 500;
    color: var(--ink);
    letter-spacing: -0.005em;
  }
  .trend-head .deltas {
    display: flex;
    gap: 20px;
    font-family: 'Geist Mono', monospace;
    font-size: 10px;
    color: var(--ink-3);
    letter-spacing: 0.04em;
  }
  .trend-head .deltas span .lab {
    color: var(--ink-5);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    margin-right: 6px;
    font-size: 9px;
  }
  .trend-wrap svg { display: block; width: 100%; height: auto; }

  /* small multiples */
  .small-mults {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 10px;
    margin-top: 4px;
  }
  .small-mult {
    padding: 10px 8px;
    background: var(--paper);
    border: 1px solid var(--rule-2);
    border-radius: 2px;
    text-align: center;
  }
  .small-mult .nm {
    font-family: 'Geist Mono', monospace;
    font-size: 8.5px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--ink-4);
    margin-bottom: 6px;
  }
  .small-mult svg { width: 100%; height: 30px; display: block; margin-bottom: 4px; }
  .small-mult .v {
    font-family: 'Fraunces', serif;
    font-weight: 500;
    font-size: 15px;
    color: var(--ink);
    letter-spacing: -0.01em;
  }

  .reading {
    margin-top: 28px;
    padding: 20px 24px;
    background: var(--paper);
    border: 1px solid var(--rule);
    border-radius: 3px;
  }
  .reading .label { color: var(--red); margin-bottom: 8px; }
  .reading p {
    font-size: 13px;
    line-height: 1.6;
    color: var(--ink-2);
  }
  .reading p strong { color: var(--ink); font-weight: 600; }

  /* Month-over-month grid */
  .mom-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 16px;
    margin-top: 28px;
  }
  .mom-card {
    padding: 18px 20px;
    background: var(--paper-2);
    border-top: 2px solid var(--ink-3);
    border-radius: 3px;
  }
  .mom-card.mom-up { border-top-color: var(--green); }
  .mom-card.mom-down { border-top-color: var(--red); }
  .mom-card.mom-new { border-top-color: var(--amber); }
  .mom-card .mom-lab {
    font-family: 'Geist Mono', monospace;
    font-size: 9px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--ink-4);
    font-weight: 500;
    margin-bottom: 8px;
  }
  .mom-card .mom-count {
    font-family: 'Fraunces', serif;
    font-weight: 400;
    font-size: 34px;
    line-height: 1;
    color: var(--ink);
    letter-spacing: -0.02em;
    margin-bottom: 12px;
  }
  .mom-card.mom-up .mom-count { color: var(--green); }
  .mom-card.mom-down .mom-count { color: var(--red); }
  .mom-card.mom-new .mom-count { color: var(--amber); }
  .mom-item .mi-title {
    font-family: 'Fraunces', serif;
    font-weight: 500;
    font-size: 13px;
    line-height: 1.3;
    color: var(--ink);
    margin-bottom: 6px;
    letter-spacing: -0.005em;
  }
  .mom-item .mi-detail {
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--ink-3);
  }
  .mom-item .mi-detail .was { color: var(--ink-4); font-weight: 500; }
  .mom-item .mi-detail .now { color: var(--ink); font-weight: 600; }

  /* =================================================================== */
  /* PAGE 6 — WHERE TO PRESS                                             */
  /* =================================================================== */
  .press-group {
    margin-bottom: 32px;
  }
  .press-group .group-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding-bottom: 10px;
    margin-bottom: 18px;
    border-bottom: 1px solid var(--ink);
  }
  .press-group .group-head h3 {
    font-size: 22px;
    font-weight: 500;
    letter-spacing: -0.01em;
    color: var(--ink);
  }
  .press-group .group-head h3 .em {
    font-family: 'Instrument Serif', serif;
    font-style: italic;
    color: var(--red);
    font-weight: 400;
  }
  .press-group .group-head .count {
    font-family: 'Geist Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-4);
  }

  .move {
    display: grid;
    grid-template-columns: 32px 1fr 120px;
    gap: 18px;
    padding: 18px 0;
    border-bottom: 1px solid var(--rule-2);
    align-items: start;
  }
  .move:last-child { border-bottom: none; }
  .move .idx {
    font-family: 'Fraunces', serif;
    font-size: 22px;
    color: var(--red);
    font-weight: 400;
    letter-spacing: -0.02em;
    padding-top: 2px;
  }
  .move .body h4 {
    font-family: 'Fraunces', serif;
    font-weight: 500;
    font-size: 16px;
    color: var(--ink);
    margin-bottom: 5px;
    letter-spacing: -0.005em;
  }
  .move .body p {
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--ink-3);
  }
  .move .body .evidence {
    font-family: 'Geist Mono', monospace;
    font-size: 9.5px;
    color: var(--ink-5);
    margin-top: 8px;
    letter-spacing: 0.03em;
  }
  .move .body .evidence em { color: var(--red); font-style: normal; font-weight: 500; }
  .move .body .outcome {
    margin-top: 10px;
    padding: 8px 12px;
    background: var(--green-dim);
    border-left: 2px solid var(--green);
    display: flex;
    gap: 10px;
    align-items: baseline;
    flex-wrap: wrap;
  }
  .move .body .outcome .o-lab {
    font-family: 'Geist Mono', monospace;
    font-size: 9px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--green);
    font-weight: 600;
    white-space: nowrap;
  }
  .move .body .outcome .o-val {
    font-size: 12px;
    color: var(--ink-2);
    line-height: 1.5;
  }
  .move .body .outcome .o-val strong {
    color: var(--green);
    font-weight: 600;
  }

  .move .matrix {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .meta-row {
    display: flex;
    justify-content: space-between;
    font-family: 'Geist Mono', monospace;
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .meta-row .k { color: var(--ink-5); }
  .meta-row .v { color: var(--ink-2); font-weight: 500; }
  .meta-row .v.red { color: var(--red); }
  .meta-row .v.amber { color: var(--amber); }

  /* =================================================================== */
  /* PAGE 7 — 30/60/90 + COLOPHON                                        */
  /* =================================================================== */
  .roadmap {
    margin-top: 32px;
    position: relative;
    padding-left: 8px;
  }
  .roadmap::before {
    content: "";
    position: absolute;
    left: 82px;
    top: 18px;
    bottom: 18px;
    width: 1px;
    background: var(--rule);
  }
  .phase {
    display: grid;
    grid-template-columns: 72px 1fr;
    gap: 36px;
    padding: 22px 0 26px;
    position: relative;
  }
  .phase::before {
    content: "";
    position: absolute;
    left: 78px;
    top: 32px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--paper);
    border: 2px solid var(--red);
    z-index: 2;
  }
  .phase .tag {
    padding-top: 22px;
    text-align: right;
  }
  .phase .tag .n {
    font-family: 'Fraunces', serif;
    font-weight: 400;
    font-size: 42px;
    color: var(--ink);
    line-height: 1;
    letter-spacing: -0.035em;
  }
  .phase .tag .d {
    font-family: 'Geist Mono', monospace;
    font-size: 9px;
    letter-spacing: 0.15em;
    color: var(--ink-4);
    text-transform: uppercase;
    margin-top: 4px;
  }
  .phase .items { padding-top: 8px; }
  .phase .items .item {
    padding-bottom: 16px;
    margin-bottom: 16px;
    border-bottom: 1px solid var(--rule-2);
  }
  .phase .items .item:last-child { margin-bottom: 0; padding-bottom: 0; border-bottom: none; }
  .phase .items h4 {
    font-family: 'Fraunces', serif;
    font-weight: 500;
    font-size: 15px;
    color: var(--ink);
    margin-bottom: 4px;
    letter-spacing: -0.005em;
  }
  .phase .items p {
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--ink-3);
  }
  .phase .items .tagline {
    font-family: 'Geist Mono', monospace;
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-5);
    margin-top: 6px;
  }

  .colophon {
    margin-top: 44px;
    padding-top: 24px;
    border-top: 1px solid var(--rule);
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;
  }
  .colophon h4 {
    font-family: 'Geist Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--red);
    margin-bottom: 10px;
    font-weight: 600;
  }
  .colophon p {
    font-size: 11.5px;
    color: var(--ink-3);
    line-height: 1.6;
  }

  @page {
    size: Letter;
    margin: 0.5in 0.55in;
  }

  @media print {
    html, body {
      background: white;
      padding: 0;
      margin: 0;
      font-size: 11px;
    }
    .page {
      box-shadow: none;
      margin: 0 0 0.3in 0;
      width: auto;
      min-height: auto;
      padding: 0 0.15in;
      page-break-after: always;
      break-after: page;
      overflow: visible;
    }
    .page:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .page::before { display: none; }
    .masthead { page-break-after: avoid; break-after: avoid; }
    h1, h2, h3, h4 { page-break-after: avoid; break-after: avoid; }
    .page-footer {
      position: static;
      margin-top: 30px;
      left: auto;
      right: auto;
      bottom: auto;
    }
    .insight, .move, .take-card, .field-stat, .phase, .mom-card {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .rival-hero, .trend-wrap, .cluster-hero, .money-quote {
      page-break-inside: avoid;
      break-inside: avoid;
    }
  }
`;
