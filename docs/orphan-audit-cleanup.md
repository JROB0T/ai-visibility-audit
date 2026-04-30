# Orphan Audit Row Cleanup

**Background:** prior to Round 1.3, the rescan webhook inserted audit rows
with `status: 'pending'` that were never processed by any worker. Those rows
are orphans — they don't represent real work in progress; they were artifacts
of an incomplete flow.

After Round 1.3, the rescan webhook no longer creates audit rows. Existing
orphans should be cleaned up manually in each environment (dev, staging,
production).

## Identify orphans

```sql
SELECT id, site_id, user_id, run_type, status, created_at
FROM audits
WHERE status = 'pending'
  AND run_type = 'manual_paid_rescan'
ORDER BY created_at;
```

These rows were created by the rescan webhook. Verify they're at least 24h
old — real pending audits shouldn't sit pending that long; if they're recent,
an active scan may be using them.

## Delete

```sql
-- Verify count first
SELECT COUNT(*) FROM audits
WHERE status = 'pending'
  AND run_type = 'manual_paid_rescan'
  AND created_at < NOW() - INTERVAL '24 hours';

-- Then delete
DELETE FROM audits
WHERE status = 'pending'
  AND run_type = 'manual_paid_rescan'
  AND created_at < NOW() - INTERVAL '24 hours';
```

The `ON DELETE CASCADE` on the audits primary key references downstream
tables (`audit_findings`, `audit_recommendations`, `audit_pages`), but those
orphans should be empty since the scan never ran.

## Why not a migration

Migrations should be idempotent and safe across environments. Cleanup of bad
data is environment-specific and operator-judgment-required. One-time SQL
run by an operator is the right pattern.
