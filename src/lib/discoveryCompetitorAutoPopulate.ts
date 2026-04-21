// ============================================================
// Auto-populate discovery_competitors after a discovery run.
//
// Reads competitor_names_detected / competitor_domains_detected off this
// run's non-suppressed results, ranks competitors by frequency (with
// asymmetric frequency weighted higher — times they beat us), and
// upserts the top 5 into discovery_competitors with source='inferred'.
//
// If the run produced fewer than 2 detected competitors, also calls the
// shared inferCompetitors() helper as a fallback and upserts anything new.
//
// Called from the post-run hook in run-tests/route.ts and from the
// admin-only /api/discovery/backfill-post-run endpoint.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeDomain } from '@/lib/discovery';
import { inferCompetitors } from '@/lib/competitorInference';
import type { DiscoveryResult } from '@/lib/types';

const MAX_AUTO_COMPETITORS = 5;
const FALLBACK_THRESHOLD = 2;

interface AggregatedCompetitor {
  name: string;
  domain: string | null;
  count: number;
  asymmetricCount: number;
}

export interface AutoPopulateResult {
  inserted: number;
  updated: number;
  total: number;
}

function aggregateFromResults(results: DiscoveryResult[]): AggregatedCompetitor[] {
  const active = results.filter(r => !r.suppressed);
  const byKey = new Map<string, AggregatedCompetitor>();

  for (const r of active) {
    const names = (r.competitor_names_detected || []).map(s => s.trim()).filter(s => s.length > 0);
    const domains = (r.competitor_domains_detected || []).map(s => normalizeDomain(s)).filter(s => s.length > 0);
    const businessMissed = !r.business_mentioned;

    // Key each distinct competitor once per result even if it appears on both
    // name and domain lists. Iterate names first, then domains that weren't
    // already keyed by a paired name.
    const seenThisResult = new Set<string>();

    for (const name of names) {
      const domainForName = domains.find(d => d.length > 0) || null;
      const key = domainForName || name.toLowerCase();
      if (seenThisResult.has(key)) continue;
      seenThisResult.add(key);
      const existing = byKey.get(key);
      if (existing) {
        existing.count++;
        if (businessMissed) existing.asymmetricCount++;
        // Prefer a domain if we didn't have one yet
        if (!existing.domain && domainForName) existing.domain = domainForName;
      } else {
        byKey.set(key, {
          name,
          domain: domainForName,
          count: 1,
          asymmetricCount: businessMissed ? 1 : 0,
        });
      }
    }

    // Domains that don't have a matching name in this result — track them
    // too (useful when Claude cited a URL but didn't name the business).
    for (const domain of domains) {
      if (seenThisResult.has(domain)) continue;
      // Check if a name-keyed entry already covers this domain
      let covered = false;
      for (const existing of Array.from(byKey.values())) {
        if (existing.domain === domain) { covered = true; break; }
      }
      if (covered) {
        seenThisResult.add(domain);
        continue;
      }
      seenThisResult.add(domain);
      const existing = byKey.get(domain);
      if (existing) {
        existing.count++;
        if (businessMissed) existing.asymmetricCount++;
      } else {
        byKey.set(domain, {
          name: domain,
          domain,
          count: 1,
          asymmetricCount: businessMissed ? 1 : 0,
        });
      }
    }
  }

  return Array.from(byKey.values()).sort((a, b) => {
    if (b.asymmetricCount !== a.asymmetricCount) return b.asymmetricCount - a.asymmetricCount;
    return b.count - a.count;
  });
}

export async function autoPopulateCompetitorsForRun(
  serviceRoleClient: SupabaseClient,
  siteId: string,
  runId: string,
): Promise<AutoPopulateResult> {
  // 1. Load non-suppressed results for this run
  const { data: resultRows, error: resultsErr } = await serviceRoleClient
    .from('discovery_results')
    .select('*')
    .eq('site_id', siteId)
    .eq('run_id', runId)
    .eq('suppressed', false);
  if (resultsErr) {
    throw new Error(`Failed to load results for auto-populate: ${resultsErr.message}`);
  }
  const results = (resultRows || []) as DiscoveryResult[];

  // 2. Aggregate + rank
  const ranked = aggregateFromResults(results);
  const topFromDetection = ranked.slice(0, MAX_AUTO_COMPETITORS);

  // 3. Load existing competitors for dedupe
  const { data: existingRows } = await serviceRoleClient
    .from('discovery_competitors')
    .select('id, name, domain')
    .eq('site_id', siteId);
  const existing = (existingRows || []) as { id: string; name: string; domain: string | null }[];
  const existingByDomain = new Map<string, { id: string; name: string; domain: string | null }>();
  const existingByName = new Map<string, { id: string; name: string; domain: string | null }>();
  for (const c of existing) {
    const d = (c.domain || '').toLowerCase();
    if (d) existingByDomain.set(d, c);
    if (c.name) existingByName.set(c.name.toLowerCase(), c);
  }

  let inserted = 0;
  let updated = 0;

  async function upsertOne(name: string, domain: string | null, source: 'inferred' | 'growth_strategy'): Promise<void> {
    const d = (domain || '').toLowerCase();
    const existingRow = (d && existingByDomain.get(d)) || existingByName.get(name.toLowerCase()) || null;
    if (existingRow) {
      // Just ensure active=true; leave name/domain alone
      const { error } = await serviceRoleClient
        .from('discovery_competitors')
        .update({ active: true, updated_at: new Date().toISOString() })
        .eq('id', existingRow.id);
      if (error) {
        console.error('[autoPopulateCompetitors] update error:', error.message);
        return;
      }
      updated++;
      return;
    }
    const { data, error } = await serviceRoleClient
      .from('discovery_competitors')
      .insert({
        site_id: siteId,
        name,
        domain: domain || null,
        source,
        active: true,
      })
      .select('id, name, domain')
      .single();
    if (error) {
      console.error('[autoPopulateCompetitors] insert error:', error.message);
      return;
    }
    inserted++;
    // Add to in-memory maps so subsequent upserts dedupe
    const row = data as { id: string; name: string; domain: string | null };
    if (row.domain) existingByDomain.set(row.domain.toLowerCase(), row);
    existingByName.set(row.name.toLowerCase(), row);
  }

  for (const c of topFromDetection) {
    await upsertOne(c.name, c.domain, 'inferred');
  }

  // 4. Fallback: if detection found fewer than threshold, ask Claude.
  if (topFromDetection.length < FALLBACK_THRESHOLD) {
    const { data: siteRow } = await serviceRoleClient
      .from('sites')
      .select('domain, vertical')
      .eq('id', siteId)
      .maybeSingle();
    if (siteRow?.domain) {
      console.log(`[autoPopulateCompetitors] detection gave ${topFromDetection.length} — calling inferCompetitors() fallback`);
      try {
        const estimates = await inferCompetitors({
          domain: siteRow.domain as string,
          businessType: (siteRow.vertical as string | null) || 'other',
          count: MAX_AUTO_COMPETITORS,
        });
        for (const e of estimates) {
          if (!e.domain) continue;
          await upsertOne(e.domain, e.domain, 'growth_strategy');
        }
      } catch (err) {
        console.warn('[autoPopulateCompetitors] inferCompetitors fallback failed:', err instanceof Error ? err.message : err);
      }
    }
  }

  // 5. Return counts
  const { count: totalCount } = await serviceRoleClient
    .from('discovery_competitors')
    .select('id', { count: 'exact', head: true })
    .eq('site_id', siteId)
    .eq('active', true);

  return {
    inserted,
    updated,
    total: totalCount || 0,
  };
}
