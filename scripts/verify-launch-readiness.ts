// ============================================================
// scripts/verify-launch-readiness.ts
//
// Automates items 1-6 of the Google App Verification checklist
// (item 7, Google Cloud Console branding fields, must be checked
// manually — no public API).
//
// Usage:
//   npx tsx scripts/verify-launch-readiness.ts
//   npx tsx scripts/verify-launch-readiness.ts --base https://staging.aivascan.com
//
// Exits 0 if all checks pass, 1 if any fail.
// ============================================================

interface Check {
  name: string;
  description: string;
  run: (html: string, headers: Headers) => { pass: boolean; detail?: string };
}

function resolveBaseUrl(): string {
  const argv = process.argv;
  // --base=https://...
  const eqForm = argv.find((a) => a.startsWith('--base='));
  if (eqForm) return eqForm.slice(7);
  // --base https://...   (only honor when --base is actually present;
  // indexOf returns -1 otherwise, and -1+1=0 would pick argv[0] —
  // the node binary path — as the URL, which is the bug we're fixing.)
  const flagIdx = argv.indexOf('--base');
  if (flagIdx >= 0) {
    const next = argv[flagIdx + 1];
    if (next && !next.startsWith('--')) return next;
  }
  return 'https://aivascan.com';
}

const BASE = resolveBaseUrl();

// ANSI colors for terminal output
const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

async function fetchUrl(path: string): Promise<{ status: number; html: string; headers: Headers }> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'AivascanLaunchVerifier/1.0' },
    redirect: 'follow',
  });
  const html = await res.text();
  return { status: res.status, html, headers: res.headers };
}

// ----- Check definitions -----

const homeChecks: Check[] = [
  {
    name: 'homepage loads',
    description: 'GET / returns 200',
    run: (_html, _headers) => ({ pass: true }), // status checked separately
  },
  {
    name: 'homepage mentions Aivascan',
    description: 'product brand name visible on the page',
    run: (html) => {
      const has = /aivascan/i.test(html);
      return { pass: has, detail: has ? undefined : 'no "Aivascan" string found in HTML' };
    },
  },
  {
    name: 'homepage has footer Privacy link',
    description: 'footer links to /privacy',
    run: (html) => {
      const has = /href=["']\/privacy["']/i.test(html);
      return { pass: has, detail: has ? undefined : 'no <a href="/privacy"> link in homepage HTML' };
    },
  },
  {
    name: 'homepage has footer Terms link',
    description: 'footer links to /terms',
    run: (html) => {
      const has = /href=["']\/terms["']/i.test(html);
      return { pass: has, detail: has ? undefined : 'no <a href="/terms"> link in homepage HTML' };
    },
  },
];

const privacyChecks: Check[] = [
  {
    name: 'privacy page loads',
    description: 'GET /privacy returns 200',
    run: () => ({ pass: true }),
  },
  {
    name: 'no FILL placeholders in privacy',
    description: 'all {{FILL: ...}} placeholders removed',
    run: (html) => {
      const matches = html.match(/\{\{FILL[^}]*\}\}/g);
      return matches?.length
        ? { pass: false, detail: `found ${matches.length} placeholder(s): ${matches.slice(0, 2).join(', ')}` }
        : { pass: true };
    },
  },
  {
    name: 'privacy mentions legal entity',
    description: 'The Bergen Standard, LLC appears',
    run: (html) => {
      const has = /Bergen\s*Standard,?\s*LLC/i.test(html);
      return { pass: has, detail: has ? undefined : 'legal entity name not found' };
    },
  },
  {
    name: 'privacy mentions effective date',
    description: 'a recent "Last updated:" date is present',
    run: (html) => {
      const has = /Last updated:\s*\w+ \d{1,2},?\s*\d{4}/i.test(html);
      return { pass: has, detail: has ? undefined : 'no "Last updated: <date>" line' };
    },
  },
  {
    name: 'privacy has contact email',
    description: 'team@aivascan.com mailto link',
    run: (html) => {
      const has = /mailto:team@aivascan\.com/i.test(html);
      return { pass: has, detail: has ? undefined : 'no mailto:team@aivascan.com link' };
    },
  },
  {
    name: 'privacy lists processors',
    description: 'mentions Stripe, Supabase, Anthropic',
    run: (html) => {
      const need = ['Stripe', 'Supabase', 'Anthropic'];
      const missing = need.filter((n) => !new RegExp(n, 'i').test(html));
      return missing.length === 0
        ? { pass: true }
        : { pass: false, detail: `missing processor(s): ${missing.join(', ')}` };
    },
  },
];

const termsChecks: Check[] = [
  {
    name: 'terms page loads',
    description: 'GET /terms returns 200',
    run: () => ({ pass: true }),
  },
  {
    name: 'no FILL placeholders in terms',
    description: 'all {{FILL: ...}} placeholders removed',
    run: (html) => {
      const matches = html.match(/\{\{FILL[^}]*\}\}/g);
      return matches?.length
        ? { pass: false, detail: `found ${matches.length} placeholder(s): ${matches.slice(0, 2).join(', ')}` }
        : { pass: true };
    },
  },
  {
    name: 'terms mentions legal entity',
    description: 'The Bergen Standard, LLC appears',
    run: (html) => {
      const has = /Bergen\s*Standard,?\s*LLC/i.test(html);
      return { pass: has, detail: has ? undefined : 'legal entity name not found' };
    },
  },
  {
    name: 'terms specifies New Jersey jurisdiction',
    description: 'governing law clause names NJ',
    run: (html) => {
      const has = /New Jersey/i.test(html);
      return { pass: has, detail: has ? undefined : 'no "New Jersey" reference (check §11 Governing Law)' };
    },
  },
  {
    name: 'terms has explicit refund stance',
    description: '"non-refundable" appears in the refund section',
    run: (html) => {
      const has = /non[\s-]?refundable/i.test(html);
      return { pass: has, detail: has ? undefined : 'no "non-refundable" language found in terms' };
    },
  },
  {
    name: 'terms has contact email',
    description: 'team@aivascan.com mailto link',
    run: (html) => {
      const has = /mailto:team@aivascan\.com/i.test(html);
      return { pass: has, detail: has ? undefined : 'no mailto:team@aivascan.com link' };
    },
  },
];

// ----- Runner -----

async function runChecks(label: string, path: string, checks: Check[]): Promise<number> {
  console.log(`\n${C.bold}━━━ ${label} (${BASE}${path}) ━━━${C.reset}`);
  let failed = 0;

  let response: { status: number; html: string; headers: Headers };
  try {
    response = await fetchUrl(path);
  } catch (err) {
    console.log(`  ${C.red}✗${C.reset} fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    return checks.length; // count all as failed
  }

  if (response.status !== 200) {
    console.log(`  ${C.red}✗${C.reset} HTTP ${response.status} — page didn't return 200`);
    return checks.length;
  }

  for (const check of checks) {
    const result = check.run(response.html, response.headers);
    if (result.pass) {
      console.log(`  ${C.green}✓${C.reset} ${check.name}`);
    } else {
      failed += 1;
      console.log(`  ${C.red}✗${C.reset} ${check.name}`);
      if (result.detail) {
        console.log(`      ${C.dim}${result.detail}${C.reset}`);
      }
    }
  }
  return failed;
}

async function main(): Promise<void> {
  console.log(`\n${C.bold}Launch readiness verification${C.reset}`);
  console.log(`${C.dim}Base URL: ${BASE}${C.reset}`);

  const totalFailed =
    (await runChecks('Homepage',       '/',         homeChecks)) +
    (await runChecks('Privacy Policy', '/privacy',  privacyChecks)) +
    (await runChecks('Terms of Service','/terms',    termsChecks));

  console.log('');
  if (totalFailed === 0) {
    console.log(`${C.green}${C.bold}✓ All automated checks passed.${C.reset}`);
    console.log(`${C.dim}Remaining manual check: Google Cloud Console → Branding fields (item 7).${C.reset}`);
    process.exit(0);
  } else {
    console.log(`${C.red}${C.bold}✗ ${totalFailed} check(s) failed.${C.reset} Fix and re-run before submitting for Google verification.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
