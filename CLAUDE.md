# AI Visibility Audit — Project Handoff

> **For future Claude sessions:** This file is the canonical "where are we"
> doc. Read it before doing anything. Update it before ending any session
> that changed material state (shipped a phase, fixed a real bug, made an
> architectural decision, or surfaced a pending item). Treat the file as
> living — out-of-date entries are worse than missing ones.

Last updated: 2026-07-01 (WO1 site-audit + WO2 report-engine consistency work orders)

---

## TL;DR for new chats

**Product:** Aivascan — a web app that scores how well businesses appear in
AI-assistant search results (ChatGPT, Claude, Perplexity, Gemini). Jon
uses it both as a self-serve SaaS and as a lead-gen engine — he generates
free sample reports for prospects, cold-emails them a share link, and
the recipients self-serve upgrade via Stripe. (Brand was "AIVA" through
2026-06-09; renamed to **Aivascan** to match the domain on 2026-06-22.
In-app strings are all updated; external-service names — Google OAuth
consent screen, Resend `EMAIL_FROM` — are dashboard config, see Domain
swap.)

**Real domain:** aivascan.com — **owned** (registered on Squarespace);
DNS cutover to Vercel still pending — see "Domain swap" below.
**Current Vercel URL:** https://ai-visibility-audit-bvdd.vercel.app
**Repo:** github.com/JROB0T/ai-visibility-audit
**Stack:** Next.js 15 App Router · Supabase (Postgres + Auth) · Stripe ·
Resend · Vercel

**Operator profile:** Jon is the sole operator. He is not a full-time
developer but is technically capable. He uses GitHub Desktop for commits
and works on `main` directly. Deploys are continuous via Vercel.

---

## Active work and recent history

### Recently shipped (most recent first)

- **Report-engine work order (2026-07-01, branch `work-order-report-engine`,
  built on top of `work-order-site-audit`):** fixes the SEVIS-class report
  contradictions at the engine level. Core idea: `src/lib/report/reportFacts.ts`
  computes every derived number ONCE (presence levels, rollups, high-priority
  counts, rival wins vs mentions, distribution percentages via
  largest-remainder rounding) and `buildReportHtml` now VALIDATES —
  data invariants, narrative-vs-facts count claims ("X of N" must match a
  real fact pair), banded-tone rules, and a leader-language gate on the
  final HTML. Violations throw `ReportInvariantError` BEFORE report_html
  persists, so a contradictory report can't be emailed/PDF'd; run-and-report
  retries the narrative once, then fails the job visibly. Root cause of the
  SEVIS "Absent but score 50" row: the evidence table labeled rows by
  position_type while scores come from visibility_status (`unclear` = 50
  neutral credit) — the table now uses the shared presence rubric. Other
  changes: "How to read the scores" legend on page 2 (generated from the
  real rubric + cluster weights, test-asserted in sync with promptScore /
  DEFAULT_DISCOVERY_CLUSTER_WEIGHTS); radar average moved out of the chart
  center to a labeled caption ("13 · avg of 6 cluster scores" — it's the
  UNWEIGHTED mean; overall is weighted, which is why 6 vs 13 was never a
  bug, just unexplained); score-banded copy (Needs Foundation 0-20 /
  Building 21-45 / Contending 46-70 / Leading 71-100; postures Build &
  Claim / Publish & Contest / Consolidate & Extend / Defend & Expand,
  posture set deterministically from the band) — "signature of a category
  leader" now renders ONLY at Leading; rival vocabulary standardized (a
  "win" = rival appeared where you didn't; never "outranked/ahead of you");
  30/60/90 timeline gets a dedicated `plan_summary` narrative field
  (no migration — report_narrative is JSONB) with sentence-aware fallback,
  dependency on its own line; narrative hygiene pass (digit–digit dashes →
  "2 to 3", paren-balance repair, terminal punctuation); Directory-risk
  panel rebuilt with a metric line ("Low · 0 directory appearances on
  purchase-intent queries"). **Task 5:** paid runs now select EXACTLY 18
  prompts (`SCAN_PROMPT_COUNT` + per-cluster quota in
  `src/lib/productConstants.ts`, quota sums asserted = 18); pricing page,
  homepage, and JSON-LD render from the constant (llms.txt manual-sync
  noted in the constants file). SEVIS's 19 was the old test-whole-library
  behavior. **Task 6:** homepage hero mock rebuilt to the real report
  taxonomy (AI Positioning Score, grade, Core/Problem/Comparison/Long-tail
  bars) — Findability/Explainability/etc. remain the SITE-READINESS
  taxonomy in-product, not retired. **Task 7:** golden fixtures
  (`fixtures/low-score.json` SEVIS-shape, `fixtures/high-score.json`
  Leading) hydrated through the real scoring functions; `npm run
  test:report` (tsx, new devDep) runs 25 checks incl. corruption tests and
  is wired into `npm run build`, so Vercel deploys are gated. Scoring-graph
  imports (`discoveryScoring`/`discovery`/`entitlements`) switched from
  `@/lib` aliases to same-dir relative so the harness runs outside Next.
  **Task 0 (pending, Jon):** run `npx tsx --env-file=.env.local
  scripts/repair-sevis-report.ts --domain <sevis-domain>` (dry-run first;
  `--apply` fixes the disputed prompt row from ground truth, recomputes the
  snapshot, re-renders through the validated pipeline). Requires prod env
  vars; no local .env.local exists on this machine.

- **Site-audit work order (2026-07-01, branch `work-order-site-audit`):**
  external SEO/claims audit applied. (1) **Canonical fix** — root layout's
  `alternates.canonical: '/'` was inherited by every page, marking all
  subpages as homepage duplicates; removed from the root, each public page
  now self-canonicals. Homepage split into server `page.tsx` (metadata) +
  `_HomeClient.tsx` (the old client component) because a 'use client' page
  can't export metadata. (2) **Per-page meta** — unique titles (template
  `%s · Aivascan`, pages no longer double-brand), unique descriptions,
  per-page og:url + twitter mirrors, meta-keywords removed. (3) **Engine
  claim accuracy** — backend calls only api.anthropic.com, so all copy
  claiming to test/query ChatGPT/Perplexity/Gemini directly was reworded
  to "AI engine with live web search (Claude)" framing; engine names kept
  only as context. Touched homepage feature card + FAQ, free-scan meta,
  dashboard/audit upsells, share layout/OG image, llms.txt. (4) **Terms**
  — added §5(d) (no misrepresenting AI systems / disparagement); KEPT
  §5(c) CAN-SPAM export clause (the work order called it vestigial but the
  batch CSV export really ships prospect emails + outreach copy) and kept
  §4 one-time/rescan language (both SKUs live in checkout). Date bumped
  2026-07-01. (5) **JSON-LD** — Organization now names The Bergen
  Standard, LLC (NJ) as parentOrganization + team@aivascan.com;
  SoftwareApplication offers now include Monthly $29.99 (hardcoded, sync
  with env price). (6) **Polish** — hero mock "Trust" → "Trustworthiness"
  (matches report taxonomy), −58% stat now sourced to the Ahrefs 300k-
  keyword AI Overviews CTR study (Dec 2025 update — the number checks
  out), agency/multi-site line added under the /pricing Monthly card.
  NOT done from the work order: `public/robots.txt` (would conflict with
  the existing, more complete `src/app/robots.ts`). Honeypot was already
  compliant. Verified: `npm run build` clean; canonicals/titles/og:url/
  descriptions checked in prerendered HTML; both JSON-LD blocks parse.

- **Aivascan rebrand (2026-06-22, branch `rebrand-aivascan`):** renamed
  the product wordmark "AIVA" → "Aivascan" across every user-facing
  surface (nav/footer, page metadata + titles, OG + JSON-LD, report
  template + PDF, transactional emails, share badge compact+card, OG
  share image, error/404, pricing/site, legal-page product refs). 77
  string replacements, 20 files. Left the `aiva-theme` localStorage key
  alone (not a brand string). **Still dashboard-only** (not in repo):
  Google OAuth consent-screen App name, Resend `EMAIL_FROM` sender name —
  see Domain swap. Casing chosen: "Aivascan".

- **Admin entitlement grant for Mike (2026-06-22):** added reusable
  `scripts/grant-entitlements.ts` (looks up a user by email, upserts a
  full-access `entitlements` row per site, idempotent). Mike
  (`mikedaman@sawyer.com`) was granted on all sites via the SQL
  equivalent in the Supabase editor. NOTE: the discovery API gate
  (`requireFullDiscoveryAccess` → `resolveAccess`) checks site
  **ownership before entitlements** and only `ADMIN_EMAILS` bypass it, so
  the grant only materially helps on sites Mike owns; true cross-account
  view needs his email added to `ADMIN_EMAILS` in
  `src/lib/entitlements.ts` (not done).

- **Growth features pass (2026-06-09, branch `aeo-and-growth` —
  cumulative with the AEO pass):** three conversion/virality features,
  all no-migration, no new dependencies:
  (1) **Live embeddable score badge** — `GET /api/badge/[token]`
  returns an SVG (compact 220×48 pill by default, `?style=card` for
  260×120) rendering the snapshot's overall score by share token.
  Score colors match the app tiers. Cache: 1h + 1d SWR so monthly
  reruns propagate. Invalid token → 404; DB failure → 503 no-store.
  Embed UI added to `ReportShareToggle` (collapsible block with live
  preview + copyable `<a><img></a>` snippet) — every embedded badge
  links back to the report. Read-only on `discovery_score_snapshots`;
  revoking sharing kills the report link AND the badge (by design).
  (2) **Dynamic OG share cards** — `/r/[token]/opengraph-image.tsx`
  (next/og ImageResponse, 1200×630) renders a branded score-ring card
  when share links unfurl in Slack/LinkedIn/iMessage; falls back to a
  generic AIVA card if the lookup fails. New `/r/[token]/layout.tsx`
  adds per-report `generateMetadata` (title = domain, score in
  description, noindex) since the page itself is a client component.
  Avoid `→` and other non-Inter glyphs in the OG file (missing from
  next/og's bundled font — they render as tofu).
  (3) **Revenue-at-risk calculator** — `RevenueAtRiskCalculator`
  client component on the homepage (under the stat band): avg sale ×
  monthly customers × adjustable AI-research share (default 37%) →
  monthly/yearly revenue influenced by AI answers, math shown and
  labeled an estimate. CTA → /free-scan.
  Untested-in-prod branch: the with-score OG card (local env has no
  DB); verify by pasting a live share link into a Slack DM after merge.

- **AEO positioning + dogfooding pass (2026-06-09, branch `aeo-positioning`):**
  (1) AIVA now passes its own audit — added `src/app/robots.ts`
  (explicitly allowing GPTBot/ClaudeBot/PerplexityBot etc., disallowing
  /api /dashboard /auth /audit /site /r /checkout), `src/app/sitemap.ts`,
  `public/llms.txt`, and Organization/WebSite/SoftwareApplication JSON-LD
  in the root layout; middleware matcher now skips robots.txt /
  sitemap.xml / llms.txt so crawlers bypass the Supabase session
  roundtrip. Self-scan via the product's own scanner: 83/100 locally
  (machine-readability 100; the HTTPS issue is a localhost artifact).
  (2) **Scanner accuracy bugfix** in `src/lib/scanner.ts`: the JSON-LD
  parser only read top-level `@type` and ignored `@graph` wrappers and
  top-level arrays — the exact format Google recommends and
  Yoast/WordPress emit by default — so those customers were falsely
  scored as having no structured data. Parser now flattens all three
  shapes. Existing stored scores predate the fix; rescans will correct.
  (3) Homepage repositioned around "SEO gets you ranked, AIVA gets you
  recommended": new hero headline with inline domain input → 
  /free-scan?url=..., sourced why-now stat band (37% AI-first searches /
  Gartner −25% search volume / −58% CTR under AI answers — stats dated
  2026, revisit quarterly), SEO-vs-AIVA comparison section, FAQ section
  with FAQPage JSON-LD. Funnel fix: hero/bottom CTAs now go to
  /free-scan (no-account flow) instead of /auth/signup.
  (4) New static guide page `/ai-visibility-vs-seo` with Article schema,
  linked from homepage, sitemap, and llms.txt.
  (5) `/free-scan` pre-fills the website field from `?url=`.
  Known leftovers the self-scan still flags (owner-content decisions,
  not fabricatable): about page, social links, testimonials/social
  proof, review platform links.

- **Final cleanup pass (2026-06-09, shipped to prod):** (1) fixed a
  share/PDF bug where regenerating a pre-existing report did NOT update
  the public `/r/[token]` view or its PDF — the force-regenerate UPDATE
  used a singular `.maybeSingle()` accept header, which 406s and rolls
  back when duplicate `(site_id, run_id)` rows exist, so `report_html`
  never persisted; the owner view only looked correct because it renders
  the in-memory response. Fix: the UPDATE now applies across all matching
  rows. (2) Report template made mobile-responsive (viewport meta +
  `@media screen` reflow); screen-only so PDF/desktop unchanged.
  (3) Lazy-loaded `page.legacy.tsx` via `next/dynamic` — `/audit/[id]`
  first-load 231kB → 178kB; `?legacy=true` still works. (4) Rescan
  display price moved to env-driven `PRICE_RESCAN_DOLLARS` (default $35).
  (5) Onboarding `/dashboard` empty state; `NoSnapshotState` now
  distinguishes a paid mid-first-run from a genuinely empty report.
  Drafted (NOT applied) migration `017_unique_snapshot_site_run.sql`:
  dedupe + UNIQUE INDEX on `(site_id, run_id)` — the root cause behind
  the cache + share bugs. **Owner must apply 017 by hand** (preview STEP
  1 first).
- **Legal disclaimers pass (2026-06-09, shipped to prod):** Terms §4
  (auto-renewal) and §6 (no-guarantee-of-results) strengthened;
  conspicuous at-checkout auto-renewal line beneath the Subscribe CTA on
  `/pricing` and `/site/[id]` (price from the env-driven pricing source);
  non-affiliation/independence line in the global footer; disclaimer
  footer baked into the report template so the owner view, `/r/[token]`,
  and the PDF all inherit it (dynamic for full reports, static for the
  free sample). Note: already-cached reports show it only after a
  regenerate. `{{FILL: …}}` tokens in `/terms` remain owner-supplied.

- **Payment-status gate on monthly cron (2026-05-21):** customers in
  `past_due` / `canceled` / `paused` state are now skipped by the
  monthly rerun cron — no report sent until Stripe reports them
  `active` again. Sites without a matching `subscriptions` row run as
  normal (legacy / admin-granted access unaffected).
- **Launch-prep round 2 (2026-05-21):** monthly rerun completion email
  with magic-link sign-in (`/api/cron/monthly-reruns/route.ts` now
  calls `sendReportReadyEmail` with `isMonthlyRerun: true` after each
  successful audit); branded `src/app/not-found.tsx` 404 page;
  public PDF download bug fixed two ways — share page (`/r/[token]`)
  now uses JS-driven fetch + blob download so chromium failures no
  longer save the bogus `pdf.json` artifact, and the PDF route has a
  one-retry on chromium launch to ride out cold-start races.
- **Launch-prep pass (2026-05-21):** brand swap to AIVA in nav/footer/
  metadata/OpenGraph; new footer with Terms / Privacy / Contact /
  Pricing links; scaffolded `/terms`, `/privacy`, `/contact` pages with
  visibly marked `[TODO]` placeholders; one-time tier hidden from
  `/pricing` and homepage (Stripe SKU stays valid in env for existing
  customers); magic-link sign-in option added to `/auth/login`;
  magic-link CTA generated server-side and embedded in the
  report-ready email so first-time Stripe subscribers can sign in in
  one click (was a real launch blocker); new `/dashboard/account`
  page with Stripe Customer Portal link via
  `POST /api/account/portal`; dashboard nav now has Batch upload /
  API keys / Account.
- **Option A — per-row email + outreach copy in batch export** (in flight at
  end of prior session; requires migration 015 applied via Supabase
  Dashboard, then push). Adds optional `email` column to CSV upload,
  joins through `audit_jobs.email` in the export, includes pre-written
  `outreach_subject` + `outreach_body` per row built from the shared
  `src/lib/outreachEmail.ts` template. Operator pastes the export into
  Instantly/Smartlead/etc.
- **Iframe upgrade-CTA fix** (`757b811`): the `/r/[token]` share page now
  injects `<base target="_top">` into the report HTML so the "Upgrade to
  the full report" link breaks out of the iframe and loads `/pricing`.
- **Phase 10 — batch upload UI** (`b557be5`): `/dashboard/batch-upload`
  client page parses CSV, auto-splits into chunks of 50, polls all batches,
  downloads unified CSV via `/api/audits/export?audit_ids=...`.
- **Phase 9** (`cce4656`, `bb89cbb`): outreach email snippet generator;
  template pivoted from "let's hop on a 15-min call" to a self-serve
  `/pricing` CTA. Auto-pulls Tier 1 prices from env vars so price changes
  don't require code edits.
- **Phase 8** (`79d0d31`): batch API (`/api/audits/batch`), batch status,
  admin tier picker.
- **Phase 7** (`721e476`): CSV/JSON export endpoint, API key auth (Bearer
  tokens, hashed in DB, dashboard UI at `/dashboard/api-keys`).
- **Phase 6** (`1e57819`): auto-minted share tokens for paid scans, public
  PDF endpoint at `/api/r/[token]/pdf`.

### Open / pending

- **SEVIS report repair (WO2 Task 0)** — data + re-render must run against
  prod with env vars. Dry-run first:
  `npx tsx --env-file=.env.local scripts/repair-sevis-report.ts --domain <sevis-domain>`
  then re-run with `--apply`. Do this AFTER deploying the
  `work-order-report-engine` branch so the re-render uses the validated
  template. Then read the regenerated PDF end to end against
  the WO2 QA invariants.
- **Stripe checkout button works in sandbox** (resolved 2026-05-21).
  Was a confusion not a bug — clicking Subscribe lands on Stripe's
  sandbox/test-mode Checkout page, which is correct. Switch to live
  mode keys (`sk_live_...`) before taking real money. See "Domain swap"
  section for the full live-mode cutover.
- **Migration 015 must be applied via Supabase Dashboard SQL Editor**
  before pushing the Option A code or the new code crashes:
  ```sql
  ALTER TABLE audit_jobs ADD COLUMN IF NOT EXISTS email TEXT;
  ```
- **Legal pages need real content.** `/terms`, `/privacy`, `/contact`
  are scaffolded with `[TODO]` placeholders. Resolve via Termly or
  Iubenda (recommended) or attorney review before public launch.
  Email addresses (support@aivascan.com, privacy@aivascan.com) and
  legal entity name need to be filled in.
- **Domain swap pending** (see dedicated section below).
### Not yet revisited

- **Empty-state polish for new users** on `/dashboard`.
- **Real legal content** in `/terms`, `/privacy`, `/contact` — replace
  `[TODO]` placeholders (Termly/Iubenda or lawyer).

---

## Pre-launch checklist (Jon's to-do list)

The code side is complete. Everything below is dashboard / DNS / billing
config that only Jon can do. Work top to bottom — items lower in the
list depend on the ones above.

### 1. Supabase
- [ ] Apply migration 015 via SQL Editor:
  ```sql
  ALTER TABLE audit_jobs ADD COLUMN IF NOT EXISTS email TEXT;
  ```

### 2. Stripe Customer Portal config
Stripe Dashboard → Settings → Billing → Customer Portal:
- [ ] Allow customers to **cancel subscriptions**
- [ ] Choose **"At end of billing period"** (recommended) for cancellations
- [ ] Allow customers to **update payment method**
- [ ] Allow customers to **view invoices and payment history**
- [ ] Set the "Return to business" URL → `https://aivascan.com/dashboard/account`
  (use the current Vercel URL until domain is swapped)

### 3. Stripe email + dunning config
Stripe Dashboard → Settings → Emails (in current sandbox mode AND repeat
in live mode later):
- [ ] Enable "Successful payments" customer email
- [ ] Enable "Failed payments" customer email
- [ ] Enable "Upcoming renewal" customer email (heads-up before charge)
- [ ] Settings → Billing → Subscriptions and emails → confirm Smart
  Retries is on (default — retries failed payments automatically over
  ~3 weeks before canceling)

### 4. Domain swap to aivascan.com
Full step-by-step in "Domain swap" section below.

### 5. Legal pages — replace `[TODO]` placeholders
Files: `src/app/terms/page.tsx`, `src/app/privacy/page.tsx`,
`src/app/contact/page.tsx`. Easiest paths:
- [ ] Use **Termly** or **Iubenda** (~$10-20/mo, generates compliant ToS +
  Privacy from a questionnaire) — paste their output into the pages
- [ ] OR have an attorney review the scaffolded drafts
- [ ] Fill in: legal entity name, jurisdiction, support email
  (e.g. `support@aivascan.com`), privacy email, dated "last updated"

### 6. End-to-end smoke test (still in Stripe sandbox before going live)
- [ ] Free scan from `/free-scan` → confirmation email arrives → click
  share link → 2-page sample report renders → "Upgrade to the full
  report" CTA opens `/pricing`
- [ ] Click Subscribe on `/pricing` → Stripe Checkout opens → pay with
  card `4242 4242 4242 4242`, any future expiry, any CVC/ZIP
- [ ] Within ~90 seconds: report-ready email arrives → click the
  primary CTA → land directly on the report, signed in (magic link
  worked)
- [ ] Visit `/dashboard/account` → click **Manage billing** → Stripe
  Customer Portal opens → confirm it shows your subscription, invoices,
  payment method
- [ ] In the portal: cancel the subscription → return to the app →
  confirm `Subscription: No active subscription` shows on
  `/dashboard/account`
- [ ] Run a batch upload via `/dashboard/batch-upload` with a 2-row
  CSV including an `email` column → wait for completion → Download
  CSV → confirm `email`, `outreach_subject`, `outreach_body` columns
  are populated

### 7. Stripe live mode flip (when ready for real money)
- [ ] Stripe Dashboard → switch from Sandbox to live account
- [ ] Live mode → Products → recreate the Monthly subscription product
  → copy its `price_…` ID
- [ ] Live mode → Developers → API keys → copy the `sk_live_…`
  secret key
- [ ] Vercel env vars → update `STRIPE_SECRET_KEY` and
  `STRIPE_PRICE_TIER_1_MONTHLY` with the live values
- [ ] Live mode → Webhooks → add endpoint at
  `https://aivascan.com/api/webhooks/stripe` → copy its signing
  secret → update `STRIPE_WEBHOOK_SECRET` in Vercel
- [ ] Trigger a Vercel redeploy so the new env vars take effect
- [ ] Repeat the section-6 smoke test with a real card (cancel right
  after to avoid being charged twice)
- [ ] Stripe Dashboard → Products → **archive** the test-mode one-time
  product. (Don't delete — Archive keeps webhook history intact.)

### 8. Operational tooling
- [ ] Set up monitoring for the daily cron at `/api/cron/monthly-reruns`
  (Vercel Logs → filter to that path; consider adding an alert if it
  reports `failed > 0` for several days in a row)
- [ ] Bookmark Stripe Dashboard → Customers (to handle support tickets
  about billing without diving into code)
- [ ] Confirm `CRON_SECRET` env var exists in Vercel (lets you trigger
  the monthly cron manually for testing via `Authorization: Bearer
  $CRON_SECRET`)

---

## Domain swap to aivascan.com — manual checklist

Brand is **Aivascan** (the code rebrand from "AIVA" shipped 2026-06-22 —
all in-app wordmarks, metadata, OG, emails, report/PDF now say Aivascan).
The domain `aivascan.com` is **owned (registered via Squarespace)**. The
DNS / hosting / env / external-service wiring still needs Jon to do these
steps in order. Anything Claude can prep is noted; the rest is dashboard
clicks.

1. **Domain owned** — `aivascan.com` registered on Squarespace. DNS is
   managed in **Squarespace → Settings → Domains → aivascan.com → DNS
   Settings**.
2. **Vercel → Project Settings → Domains.** Add `aivascan.com` and
   `www.aivascan.com`; set `aivascan.com` as **Primary Domain**. Vercel
   shows the records to create. Then in **Squarespace DNS Settings** add:
   - `A` record: host `@` → `76.76.21.21`
   - `CNAME`: host `www` → `cname.vercel-dns.com`
   Remove any existing `@`/`www` records pointing at Squarespace's parking
   page so they don't conflict. Vercel auto-issues SSL once DNS resolves.
3. **Vercel → Project Settings → Environment Variables.** Update:
   - `NEXT_PUBLIC_APP_URL` → `https://aivascan.com` (then redeploy)
   (No code change needed — magic-link generation, email helpers, sitemap,
   robots, and OG cards all read this at request time.)
4. **Stripe → Developers → Webhooks.** Update the webhook endpoint URL
   from the old Vercel default to `https://aivascan.com/api/webhooks/stripe`.
   Confirm `STRIPE_WEBHOOK_SECRET` matches the new endpoint's signing
   secret if it changed.
5. **Supabase → Authentication → URL Configuration.**
   - Site URL: `https://aivascan.com`
   - Redirect URLs: add `https://aivascan.com/auth/callback`
   - (Keep the old Vercel URL as a redirect during the cutover so
     in-flight magic links don't break.)
6. **Google OAuth** (Google Cloud Console):
   - **Credentials → OAuth client** — add
     `https://aivascan.com/auth/callback` to Authorized redirect URIs.
   - **OAuth consent screen → App name → "Aivascan"** — this is the name
     shown on the Google sign-in page. It lives ONLY here, not in the
     repo, so the code rebrand does not change it.
7. **Resend → Domains.** Add and verify `aivascan.com` for sending. Update
   `EMAIL_FROM` env var in Vercel to e.g. `Aivascan <hello@aivascan.com>`.
   This is critical for deliverability — without a verified sender, all
   transactional emails go to spam or fail. (Email body copy already says
   Aivascan; this env var is the sender display name.)
8. **Replace placeholders in legal pages** at `src/app/terms/page.tsx`,
   `src/app/privacy/page.tsx`, `src/app/contact/page.tsx` (all
   `[TODO: ...]` strings — legal entity name, jurisdiction, support
   email, dated).
9. **Archive one-time Stripe products** in Stripe Dashboard once the
   subscription-only era is confirmed working. Don't delete — Archive
   keeps webhook history intact for any historical customers.
10. **Final smoke test before announcing:**
    - Visit https://aivascan.com — homepage renders
    - Submit a free scan → email arrives
    - Click Subscribe → Stripe Checkout opens
    - Complete a test purchase (use Stripe test mode + test card)
    - Magic-link email arrives → click it → land signed in on report
    - `/dashboard/account` → Manage billing → Stripe Portal loads

## Operator workflows (how Jon actually ships)

These are the conventions Jon has established. Don't invent new ones unless
asked.

- **Branching:** Works on `main` directly. Worktrees created by Claude Code
  agents do exist under `.claude/worktrees/` but Jon doesn't push from them
  — file edits should land at the real repo path so GitHub Desktop sees
  them.
- **Commits:** Via GitHub Desktop. Jon writes a one-line summary, hits
  Commit, then Push origin.
- **Untracked `.claude/worktrees/` noise:** GitHub Desktop always shows
  these as untracked. Jon knows to uncheck them. Adding the path to
  `.gitignore` is deferred (Jon opted out of it on 2026-05-21).
- **Migrations:** Applied manually via **Supabase Dashboard → SQL Editor →
  paste & run**. Do NOT assume `supabase db push` works locally. When
  shipping new migrations, give Jon the exact SQL to paste, and tell him
  to apply it BEFORE pushing the code (otherwise the new code crashes on
  the missing column).
- **Env vars:** Set in Vercel project settings, not in `.env.local`. The
  `.env.local.example` is generic placeholder text — don't trust it for
  values.
- **Verification:** Jon's localhost is used by another project, so verify
  on the Vercel preview/prod URL after push, not on `localhost:3000`.
  Vercel builds in ~60–90s. Claude Code's built-in preview server cannot
  start because port 3000 is occupied — don't try.
- **Auth on terminal git:** Jon set up `gh auth login` on 2026-05-21. He
  can now `git push` from terminal if needed, but GitHub Desktop remains
  his default.

---

## Product mental model

### Three customer-facing products

| Product | Price | What they get |
|---|---|---|
| Free Sample | $0 | 6-prompt scan, 2-page report, one example weak prompt. One free per email + per site. |
| Tier 1 Monthly | $29.99/mo | 18-prompt scan, full strategic report, 30/60/90 plan, refreshed monthly. |
| Tier 1 One-time | $39.99 | Same as monthly but single-shot, no recurring. |

Tier 2 SKUs exist in code/env (`STRIPE_PRICE_TIER_2_*`) but are
intentionally hidden from the pricing page until "spec 2" ships.

### Cold-outreach workflow (Jon's lead-gen engine)

This is core to the business model — not a side feature.

1. Jon uploads a CSV of prospect businesses at `/dashboard/batch-upload`
2. Each row gets a free sample audit (no email needed for them to exist)
3. After completion, Jon downloads the export CSV which includes
   `share_url`, `outreach_subject`, `outreach_body`, and (Option A onward)
   the prospect's `email`
4. Jon pastes the export into a real cold-email tool (Instantly,
   Smartlead, Apollo) — those tools handle deliverability, warming, and
   unsubscribes
5. Recipients click the share link, see their 2-page sample, click
   "Upgrade to the full report" → land on `/pricing` → self-serve via
   Stripe

**The app does NOT send cold email.** Outbound sending is delegated to
specialized tools because of deliverability and CAN-SPAM compliance.
Resend is set up but reserved for transactional mail (free-sample delivery,
account emails). Do not propose adding mass-outreach sending to the app.

---

## Architecture cheat sheet

### Key directories

```
src/
  app/
    page.tsx                              landing page (hardcoded pricing — see open items)
    pricing/                              pricing page (env-driven)
    free-scan/                            self-serve free sample form
    dashboard/                            authed customer dashboard
      page.tsx                            site list + new-scan input
      api-keys/                           API key management
      batch-upload/                       CSV upload UI (Phase 10)
    audit/[id]/                           authed audit view
    r/[token]/                            public share viewer (iframe-rendered report)
    api/
      audit/[id]/outreach-email/          per-audit outreach copy
      audits/batch/                       batch endpoints
      audits/batch/[batchId]/             status + export wrappers
      audits/export/                      generic CSV/JSON export (the workhorse)
      r/[token]/                          public share data + PDF
      checkout/tier/                      Stripe Checkout session creation
      cron/monthly-reruns/                monthly auto-refresh
      cron/run-batch-jobs/                background batch worker
      free-scan/request/                  email-capture sample creation
      keys/                               API key CRUD
      webhooks/                           Stripe webhook handler
  lib/
    outreachEmail.ts                      shared cold-email template (Option A)
    reportTemplate.ts                     HTML report builder (incl. free sample)
    pricing.ts                            env-driven price resolution
    apiAuth.ts                            Bearer-or-session auth gate
    types.ts                              shared type definitions
supabase/migrations/                      sequentially numbered SQL migrations
```

### Important data model bits

- `sites` → one row per scanned domain
- `audits` → one row per scan; foreign key to `sites`
- `discovery_score_snapshots` → the score data (overall + cluster scores +
  share_token + run_id). One per scan run.
- `discovery_results` → individual prompt-level results for a scan run.
  Used to find "top missing queries" (where business not mentioned + not
  cited).
- `audit_batches` + `audit_jobs` → batch processing queue. `audit_jobs.email`
  added in migration 015 for Option A.
- `discovery_profiles` → enriched business metadata (name, category,
  service area).

### How a scan flows

1. User submits domain (dashboard form, free-scan form, or batch CSV)
2. A `discovery_job` (or `audit_job` for batches) is enqueued
3. Cron worker picks it up, runs the audit (web scrape + AI prompts +
   scoring)
4. Results land in `audits`, `discovery_score_snapshots`,
   `discovery_results`, `discovery_profiles`
5. For paid tiers and free samples, a `share_token` is minted and the
   report HTML is built once via `reportTemplate.ts` and persisted on the
   snapshot
6. `/r/[token]` reads that persisted HTML and renders it in an iframe

---

## Non-obvious decisions worth remembering

- **Report HTML is persisted, not regenerated.** Older scans have older
  template output. Any template fix only helps NEW scans unless we patch
  at render time (which is what the iframe-CTA fix does — it injects
  `<base target="_top">` into the persisted HTML at render, so old reports
  benefit too).
- **Pricing is env-driven by design.** The pricing page renders dollar
  amounts from `PRICE_TIER_*_DOLLARS` env vars, and Stripe price IDs come
  from `STRIPE_PRICE_TIER_*` env vars. To raise/lower prices, update the
  env var AND the matching Stripe product — no code change needed. The
  homepage is the one exception (hardcoded — see open items).
- **Outreach copy lives in `src/lib/outreachEmail.ts`.** Used by both the
  per-audit endpoint and the export route. Editing it changes both
  surfaces — that's the whole point, so they can't drift.
- **The free sample CTA target is `/pricing` (relative).** Because the
  report HTML is rendered in `<iframe srcdoc>`, the iframe needs
  `<base target="_top">` injected at render time for the link to escape.
  Don't change CTA to an absolute URL hoping that fixes it — the iframe
  patch is the real fix.
- **Stripe test vs live mode mismatch will silently fail.** If
  `STRIPE_SECRET_KEY` is a `sk_live_*` but a price ID points to a
  test-mode product (or vice versa), Stripe rejects the session create
  call. Check both before adding env vars.

---

## What to do when picking up a new session

1. Read this file, then `git log --oneline -10` to see what's actually
   landed
2. If the user references a feature/phase, search this file first for the
   shorthand
3. If the user describes a bug, check the "Open / pending" section before
   diving into code — it may already be tracked
4. Before suggesting major architecture moves, check "Non-obvious
   decisions" — Jon has reasons for the current shape

## When to update this file

Update before ending a session that:
- Shipped a phase, fix, or feature → move it to "Recently shipped"
- Introduced a new bug or revealed an open item → add to "Open / pending"
- Changed an operator workflow (e.g. new deploy step) → update workflows section
- Made an architectural decision worth remembering → add to "Non-obvious decisions"

Keep entries terse. The point is fast skim, not an exhaustive history.
The git log is authoritative for what happened — this file is for what
matters.
