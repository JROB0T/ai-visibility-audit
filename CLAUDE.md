# AI Visibility Audit — Project Handoff

> **For future Claude sessions:** This file is the canonical "where are we"
> doc. Read it before doing anything. Update it before ending any session
> that changed material state (shipped a phase, fixed a real bug, made an
> architectural decision, or surfaced a pending item). Treat the file as
> living — out-of-date entries are worse than missing ones.

Last updated: 2026-05-21 (launch-prep pass)

---

## TL;DR for new chats

**Product:** AIVA — a web app that scores how well businesses appear in
AI-assistant search results (ChatGPT, Claude, Perplexity, Gemini). Jon
uses it both as a self-serve SaaS and as a lead-gen engine — he generates
free sample reports for prospects, cold-emails them a share link, and
the recipients self-serve upgrade via Stripe.

**Real domain:** aivascan.com (target — see "Domain swap" below for what's
needed before the cutover)
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

- **Stripe checkout button on `/pricing` is still broken in prod.** Clicking
  Subscribe does not start checkout. Code is wired correctly
  (`src/app/api/checkout/tier/route.ts` + `src/app/pricing/_BuyButton.tsx`);
  almost certainly a missing or mismatched Vercel env var
  (`STRIPE_SECRET_KEY` or `STRIPE_PRICE_TIER_1_MONTHLY`). **Diagnostic
  needed before launch:** open `/pricing` in browser with DevTools Console
  (NOT Issues) tab open, click Subscribe, capture the network call to
  `/api/checkout/tier` and any console errors. This is the #1 launch
  blocker.
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
- **PDF download bug** (chip-tracked, not yet picked up). Symptom: browser
  saves the public PDF as `pdf.json` with "Site wasn't available". Likely
  Vercel chromium spin-up failing and the JSON error response getting saved.
  Lives in `/api/r/[token]/pdf/route.ts`.

### Not yet revisited

- **Phase 5 — monthly subscription cron.** The cron route at
  `src/app/api/cron/monthly-reruns/route.ts` exists and is registered,
  but does NOT currently send a "report refreshed" email. The email
  function `sendReportReadyEmail` supports `isMonthlyRerun: true` —
  the cron just doesn't call it. Future: wire the cron to send the
  refresh email so subscribers know their score moved.
- **Empty-state polish for new users** on `/dashboard`.
- **Branded 404 page.** Currently using Next.js default.

---

## Domain swap to aivascan.com — manual checklist

The code references `aivascan.com` in metadata + footer + Terms/Privacy
text. The actual DNS / hosting / env wiring still needs Jon to do these
steps in order. Anything Claude can prep is noted; the rest is dashboard
clicks.

1. **Buy the domain** (if not already owned) and have DNS access.
2. **Vercel → Project Settings → Domains.** Add `aivascan.com` and
   `www.aivascan.com`. Vercel will show DNS records to add at the
   registrar (typically an `A` record to `76.76.21.21` and a `CNAME` for
   `www` to `cname.vercel-dns.com`). Add them at the registrar.
3. **Vercel → Project Settings → Environment Variables.** Update:
   - `NEXT_PUBLIC_APP_URL` → `https://aivascan.com`
   (No code change needed — the magic-link generation and email helpers
   read this at request time.)
4. **Stripe → Developers → Webhooks.** Update the webhook endpoint URL
   from the old Vercel default to `https://aivascan.com/api/webhooks/stripe`.
   Confirm `STRIPE_WEBHOOK_SECRET` matches the new endpoint's signing
   secret if it changed.
5. **Supabase → Authentication → URL Configuration.**
   - Site URL: `https://aivascan.com`
   - Redirect URLs: add `https://aivascan.com/auth/callback`
   - (Keep the old Vercel URL as a redirect during the cutover so
     in-flight magic links don't break.)
6. **Google OAuth** (in Google Cloud Console → OAuth client) — add
   `https://aivascan.com/auth/callback` to authorized redirect URIs.
7. **Resend → Domains.** Add and verify `aivascan.com` for sending. Update
   `EMAIL_FROM` env var in Vercel to e.g. `AIVA <hello@aivascan.com>`.
   This is critical for deliverability — without a verified sender, all
   transactional emails go to spam or fail.
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
