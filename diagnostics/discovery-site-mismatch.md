# Diagnostic: discovery-site-mismatch

## Symptom

Three domains (`candcair.com`, `attilioplumbing.com`, `rfbondurant.com`) completed AI Discovery runs. `discovery_prompts`, `discovery_results`, `discovery_score_snapshots`, and `discovery_profiles` rows all exist on the backend. When the audit page's Discovery tab calls `GET /api/discovery/results?siteId=...`, it returns empty. Cross-checking: `discovery_profiles.site_id` does not equal the `site_id` the audit page is passing.

---

## 1. How `siteId` flows to DiscoveryTab

**Audit page (`src/app/audit/[id]/page.tsx`)** — `siteId` is read straight off the audit row returned by the GET endpoint:

```tsx
// line 822-825
const res = await fetch(`/api/audit/${params.id}`);
const auditData = await res.json();
setData(auditData);

// line 2065-2072
{isAuthenticated && activeTab === 'ai-discovery' && audit?.site_id && (
  <DiscoveryTab
    auditId={audit.id}
    siteId={audit.site_id}     // ← this is audits.site_id, verbatim from DB
    isPaid={hasPaid}
    isAdmin={isAdmin}
  />
)}
```

**Audit API (`src/app/api/audit/[id]/route.ts:13-17`)** returns the audit row with an embedded site join:

```ts
const { data: audit } = await supabase
  .from('audits')
  .select('*, site:sites(*)')
  .eq('id', id)
  .single();
```

The audit page uses `audit.site_id` (the FK column) directly, not `audit.site.id`. These should always match.

**Conclusion for #1**: the UI is passing whatever `audits.site_id` is stored in the DB for the audit being viewed. No transformation, no lookup. **This is correct.** The UI is not the bug.

---

## 2. Where discovery_profiles rows get created

**`src/lib/discoveryBootstrap.ts:90-102`** is the only place that inserts `discovery_profiles`:

```ts
export async function ensureDiscoveryProfileAndPrompts(input: BootstrapInput): Promise<BootstrapResult> {
  const { siteId, auditId, force } = input;
  const admin = getAdminClient();

  // Load site
  const { data: site, error: siteErr } = await admin
    .from('sites')
    .select('id, domain, vertical, url')
    .eq('id', siteId)       // ← uses passed-in siteId as-is
    .maybeSingle();
  if (siteErr || !site) {
    throw new BootstrapError('site_not_found', 'Site not found');
  }
  ...
```

And later:

```ts
await admin.from('discovery_profiles').insert({
  site_id: siteId,   // ← same siteId that was passed in
  ...
});
```

**`src/app/api/discovery/generate-prompts/route.ts`** — thin wrapper around `ensureDiscoveryProfileAndPrompts`; parses body, auth-checks, delegates. Does not mutate sites.

**Conclusion for #2**: discovery bootstrap accepts `siteId` as input and trusts it. It reads the `sites` row by id, writes `discovery_profiles.site_id` = input siteId. **It cannot create a `sites` row and cannot cause a site_id mismatch by itself.** If `discovery_profiles.site_id` doesn't match the audit's `site_id`, it's because discovery was called with a different `siteId` earlier.

---

## 3. Audit-creation flow (`src/app/api/audit/route.ts:41-66`)

```ts
// Reuse existing site record for the same domain + user
let site;
const { data: existingSite } = await supabase
  .from('sites')
  .select()
  .eq('domain', domain)
  .eq('user_id', user.id)      // ← exact match on user_id
  .single();                    // ← errors if 0 or >1 rows

if (existingSite) {
  site = existingSite;
}

if (!site) {
  const { data: newSite, error: siteError } = await supabase
    .from('sites')
    .insert({ domain, url: siteUrl, user_id: user.id })
    .select()
    .single();
  // ...
  site = newSite;
}
```

**This is the find-or-create path.** Three failure modes are visible:

1. **Zero existing rows** → `.single()` sets error, `existingSite === null`, we insert. Correct.
2. **Exactly one existing row** → reused. Correct.
3. **Two or more existing rows for this (domain, user_id)** → `.single()` returns error `"JSON object requested, multiple rows returned"`, `existingSite === null`, **code inserts a THIRD row**. Silent data corruption — the error is destructured but never checked.
4. **Existing row with `user_id IS NULL`** (legacy/unauth audit) → does NOT match `eq('user_id', user.id)`, code inserts a new owned row. The null-owned row still exists alongside the new one.

Domain normalization: `www.` is stripped and hostname is lowercased by `new URL().hostname`. Consistent with itself, so case/www is unlikely to be the direct cause.

---

## 4. Database state (cannot run — documenting the queries to run)

**I cannot execute SQL against your Supabase instance from this environment.** Please run these in the Supabase SQL editor (or via MCP) to confirm:

```sql
-- 4a. For each domain, list all matching sites rows
SELECT id, domain, user_id, created_at
FROM sites
WHERE lower(regexp_replace(domain, '^www\.', '')) IN
  ('candcair.com', 'attilioplumbing.com', 'rfbondurant.com')
ORDER BY domain, created_at;

-- 4b. For each discovery_profiles row, show which site it maps to
SELECT
  dp.site_id AS profile_site_id,
  s.domain,
  s.user_id,
  s.created_at AS site_created_at,
  dp.created_at AS profile_created_at
FROM discovery_profiles dp
JOIN sites s ON s.id = dp.site_id
WHERE lower(regexp_replace(s.domain, '^www\.', '')) IN
  ('candcair.com', 'attilioplumbing.com', 'rfbondurant.com')
ORDER BY s.domain;

-- 4c. For each audit, show its site_id
SELECT
  a.id AS audit_id,
  a.site_id,
  a.status,
  a.created_at AS audit_created_at,
  s.domain,
  s.user_id
FROM audits a
JOIN sites s ON s.id = a.site_id
WHERE lower(regexp_replace(s.domain, '^www\.', '')) IN
  ('candcair.com', 'attilioplumbing.com', 'rfbondurant.com')
ORDER BY s.domain, a.created_at;

-- 4d. Quick sanity: are there any sites with null user_id for these domains?
SELECT id, domain, user_id, created_at FROM sites
WHERE lower(regexp_replace(domain, '^www\.', '')) IN
  ('candcair.com', 'attilioplumbing.com', 'rfbondurant.com')
  AND user_id IS NULL;
```

**Expected interpretation:**
- If (4a) returns 2+ rows per domain → **confirms theory (a): duplicate sites.**
- If (4b) maps profiles to a different `site_id` than the audits in (4c) → **confirms the mismatch directionally.**
- If (4d) returns rows → **legacy unclaimed sites exist; lookup-by-(domain,user_id) is missing them and creating duplicates.**

---

## 5. Discovery_profiles → sites mapping

Covered by query 4b above. Whichever `sites.id` is referenced by `discovery_profiles.site_id` will reveal which specific `sites` row discovery ran against. If it's a different row than the audit currently being viewed, the mismatch is confirmed.

---

## 6. Every location that can mutate `sites`

Grepped `from('sites')` across `src/`. Inserts/upserts only (modifications to existing rows excluded):

| Location | Op | Notes |
|---|---|---|
| `src/app/api/audit/route.ts:57` | INSERT | `{ domain, url, user_id: user.id }`. **This is the only `sites` insert in the codebase.** |

Updates (not duplicating, but relevant):
| Location | Op | Notes |
|---|---|---|
| `src/app/api/audit/route.ts:128` | UPDATE | Sets `vertical` on existing row after AI classification. |
| `src/app/api/cron/monthly-reruns/route.ts:103, 190` | UPDATE | `next_scheduled_scan_at`, `last_auto_rerun_at`. |
| `src/app/api/webhooks/stripe/route.ts:74, 171, 197, 204` | UPDATE | `has_monthly_monitoring`, plan status, etc. |
| `src/app/api/audit/[id]/route.ts:162` | UPDATE | **"Claim" PATCH** — sets `user_id` on `sites` rows that still have `user_id IS NULL`. Strong signal that unclaimed sites exist in the DB. |
| `src/app/api/site/[id]/route.ts:97` | UPDATE | Admin mutation of a specific site. |

**Only ONE insert path. The duplication must come from that single insert firing when it should have reused.**

---

## Confirmed root cause (based on code inspection alone)

The audit POST handler is the sole insert site, and it has two known failure modes that produce duplicates:

**Primary suspect: legacy unclaimed sites.** Line 162 of `audit/[id]/route.ts` exists specifically to claim sites where `user_id IS NULL`. That claim path exists because historically (or via some flow not currently visible in `src/`) sites have been created without a user_id. If any of these three domains has a null-owned row that hasn't been claimed yet, the `eq('user_id', user.id)` lookup in the audit POST handler will miss it and insert a new owned row — producing duplicates.

**Secondary suspect: silent `.single()` error.** The `const { data: existingSite } = await supabase...single();` at line 43 discards the error. If duplicates already exist for any reason, the code cannot reconcile — it will keep adding more.

**Tertiary suspect: race on concurrent first-time audits.** Two parallel audit POSTs for the same (domain, user_id) both hit the SELECT, both miss, both INSERT. Plausible but narrow window.

**I cannot pick between these with code inspection alone.** Queries 4a and 4d will distinguish them:
- If query 4d returns any rows → legacy null-owned sites is the culprit.
- If query 4a returns duplicates BUT none have null user_id → it was either the `.single()` error path or a race.
- If query 4a returns exactly one row per domain but the audits point to one and discovery points to another → the mismatch is something else entirely (possibly a user_id change mid-flow, or a bug we haven't found).

**The UI and the discovery bootstrap are not at fault.** They both correctly pass and consume the `siteId` they're handed. Corruption is entirely upstream in the `sites` table itself.

---

## Proposed fixes

### Fix A — Data cleanup + unique index + harden the insert path

**What:**
1. Write a one-time SQL migration that merges duplicate `sites` rows per `(user_id, normalized_domain)`. Pick the oldest as canonical. `UPDATE` all child tables (`audits`, `discovery_profiles`, `discovery_prompts`, `discovery_results`, `discovery_score_snapshots`, `discovery_insights`, `discovery_recommendations`, `discovery_competitors`, `entitlements`, `billing_events`) to reference the canonical `site_id`. `DELETE` the orphaned `sites` rows.
2. Add a `normalized_domain` generated column (`lower(regexp_replace(domain, '^www\.', ''))`) and a partial unique index on `(user_id, normalized_domain) WHERE user_id IS NOT NULL`. For legacy unclaimed rows, also add a unique partial index on `(normalized_domain) WHERE user_id IS NULL` if that makes sense (or leave null rows free and rely on the claim flow).
3. Rewrite `audit/route.ts:43-66` as an `upsert` on the new unique index, or at minimum:
   - Search by `normalized_domain` AND `user_id OR user_id IS NULL` (to catch unclaimed rows).
   - Use `.maybeSingle()` instead of `.single()` to avoid silent errors on duplicates.
   - If an unclaimed match is found, claim it (`UPDATE sites SET user_id = ?`) instead of inserting.

**Pros:**
- Fixes the data AND the ongoing bug.
- DB-level constraint means future code paths physically cannot create duplicates.
- Cleans up the legacy null-owned sites.

**Cons:**
- Largest change. Requires a migration, a data-backfill script, and schema change.
- Partial unique indexes with computed expressions need careful testing.
- If any pending signup/auth flow depends on creating null-owned sites, that flow breaks until updated.

### Fix B — Discovery always derives siteId from an audit

**What:**
- Change `DiscoveryTab`'s API calls to pass `auditId` instead of (or in addition to) `siteId`.
- Every `/api/discovery/**` endpoint resolves `siteId` server-side by doing `SELECT site_id FROM audits WHERE id = ?`. The UI never passes `siteId` directly.
- `discoveryBootstrap` already takes an optional `auditId` — make it mandatory, or the first hop inside every discovery handler.

**Pros:**
- Doesn't require a data migration. Existing duplicates become harmless as long as discovery anchors off a single authoritative audit row.
- Smallest UI surface change — just swap the prop.

**Cons:**
- Does NOT fix the underlying `sites` duplication. Over time, more duplicates will accumulate and other surfaces (checkout, dashboard, billing) will keep stumbling on them.
- Adds an extra query per discovery request.
- Doesn't fix the case where a user runs a NEW audit for the same domain (audit #2 has a new duplicate site_id, so discovery written against audit #1's site_id will look "missing" from audit #2's page).
- Most importantly: this is a patch over a deeper data-integrity problem. Every future surface (analytics, reports, dashboard) will hit the same issue.

### Fix C — Centralized `findOrCreateSite` helper

**What:**
- Extract a single helper `src/lib/findOrCreateSite.ts` that every caller uses when it needs a site row for a (user, domain) pair.
- The helper:
  - Normalizes the domain (strip `www.`, lowercase).
  - Queries `sites` by `normalized_domain` AND `(user_id = $userId OR user_id IS NULL)`, ordered by `user_id NULLS LAST`, `created_at ASC`, `LIMIT 1`.
  - If result is unclaimed, claim it (set `user_id`).
  - If no result, insert and return.
  - Wraps in a transaction or uses `.maybeSingle()` + defensive logic so duplicates never cause silent `.single()` failures.
- Replace the inline find-or-create in `audit/route.ts` with a call to this helper. Audit every other place that needs a site and route it through the helper.
- Do NOT rely on a DB constraint (unlike Fix A).

**Pros:**
- Moderate scope. Fixes the code-level bug immediately. No schema change, no migration.
- Easy to unit-test in isolation.
- Discovers and absorbs legacy null-owned sites as users re-engage.

**Cons:**
- Without a DB unique constraint, new duplicate code paths in the future could still insert duplicates (e.g., if a new developer bypasses the helper).
- Doesn't clean up existing duplicate rows — they're still there, just shadowed by the helper's preferred ordering. Reporting and analytics may still show split data across duplicate site_ids until a separate cleanup is run.
- Still leaves the data inconsistency for the three existing sites. Those users' discovery history is linked to site_id X, but their audit page is showing site_id Y — they'll keep seeing "no results" until you either re-point `discovery_*.site_id` to the canonical one, or delete/replay discovery.

---

## Recommendation

**Fix A is the right long-term answer** — it addresses data integrity at every layer. But it's the biggest change.

**If you want to un-block the three affected users today:** combine Fix C (helper) with a small targeted migration to re-point their existing `discovery_profiles`, `discovery_prompts`, `discovery_results`, `discovery_score_snapshots`, `discovery_insights`, and `discovery_recommendations` rows to whatever `sites.id` their currently-visible audit page is using. That's a one-shot `UPDATE discovery_* SET site_id = $canonical_id WHERE site_id = $orphan_id` per affected domain. This is data surgery, not a code fix, and it unblocks them without the full migration.

**Run the SQL queries in Section 4 first** — we cannot pick the right fix path without knowing whether the duplicates are null-owned legacy rows (Fix A targeted at claim flow) or orthogonal duplicates (Fix A with race/error hardening). The queries will tell us in ~30 seconds.
