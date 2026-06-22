// ============================================================
// scripts/grant-entitlements.ts
//
// Grant a user full entitlements on every site in the project.
// Idempotent — safe to re-run.
//
// Usage (from project root):
//   npx tsx --env-file=.env.local scripts/grant-entitlements.ts <email>
//
// Or with Node 20+ directly:
//   node --env-file=.env.local --import=tsx \
//     scripts/grant-entitlements.ts <email>
//
// Requires in .env.local:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// What it does:
//   1. Looks up the user by email (case-insensitive) via the admin auth API.
//   2. Lists every site in the project.
//   3. Upserts one entitlements row per site with every can_view_* flag,
//      can_export, has_monthly_monitoring, and monthly_scope='core_premium'.
//
// If the email isn't found, prints the 10 most recent users so the caller
// can pick the right address and re-run.
// ============================================================

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.\n' +
      'Run with --env-file=.env.local or export them first.',
  );
  process.exit(1);
}

const email = process.argv[2];
if (!email) {
  console.error('Usage: tsx scripts/grant-entitlements.ts <email>');
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main(): Promise<void> {
  // 1. Find the user. listUsers is the supported admin path; perPage is
  //    1000 in modern supabase-js, more than enough pre-launch.
  const { data: usersPage, error: lookupErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (lookupErr) {
    console.error('Failed to list users:', lookupErr.message);
    process.exit(1);
  }
  const user = usersPage.users.find(
    (u) => (u.email ?? '').toLowerCase() === email.toLowerCase(),
  );
  if (!user) {
    console.error(`No user found with email "${email}".`);
    console.error('\n10 most recent users:');
    usersPage.users
      .slice()
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
      .slice(0, 10)
      .forEach((u) => console.error(`  ${u.email}   (id: ${u.id})`));
    process.exit(1);
  }
  console.log(`Found user: ${user.email}   (id: ${user.id})`);

  // 2. Load every site. Mike's audit-page checks entitlements keyed on
  //    (user_id, site_id) — site ownership doesn't matter for viewing.
  const { data: sites, error: sitesErr } = await admin
    .from('sites')
    .select('id, domain');
  if (sitesErr) {
    console.error('Failed to load sites:', sitesErr.message);
    process.exit(1);
  }
  if (!sites || sites.length === 0) {
    console.error('No sites found in the project. Nothing to grant.');
    process.exit(1);
  }
  console.log(`Granting full entitlements on ${sites.length} site(s)…`);

  // 3. Upsert one row per site. ON CONFLICT (user_id, site_id) → update
  //    so this is safe to re-run.
  const now = new Date().toISOString();
  const rows = sites.map((s) => ({
    user_id: user.id,
    site_id: s.id,
    can_view_core: true,
    can_view_growth_strategy: true,
    can_view_marketing_perception: true,
    can_export: true,
    has_monthly_monitoring: true,
    monthly_scope: 'core_premium' as const,
    updated_at: now,
  }));

  const { error: upsertErr } = await admin
    .from('entitlements')
    .upsert(rows, { onConflict: 'user_id,site_id' });
  if (upsertErr) {
    console.error('Upsert failed:', upsertErr.message);
    process.exit(1);
  }

  console.log(`\n✓ Granted full entitlements on ${sites.length} site(s):`);
  for (const s of sites) console.log(`    ${s.domain}`);
  console.log(
    '\nDone. The user should see paid views immediately (a hard refresh may help).',
  );
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
