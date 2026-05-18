// ============================================================
// Share token generation.
//
// 16-character URL-safe alphabet. ~95 bits of entropy — collision
// odds are vanishing for the volume this product will ever see.
//
// Tokens are generated on the server via crypto.getRandomValues()
// in the API route; this module is the pure utility.
// ============================================================

// Excluded: 0 / O / I / l / 1 — visually ambiguous if anyone reads
// the URL aloud or types it.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function generateShareToken(): string {
  const out: string[] = [];
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 16; i++) {
    out.push(ALPHABET[bytes[i] % ALPHABET.length]);
  }
  return out.join('');
}

export function looksLikeShareToken(s: string): boolean {
  if (s.length !== 16) return false;
  for (const c of s) {
    if (!ALPHABET.includes(c)) return false;
  }
  return true;
}

// ============================================================
// mintShareToken — persist a fresh share_token on a snapshot row.
//
// Used by:
//   - src/lib/freeScan.ts        (free-scan flow auto-mints)
//   - src/lib/paidScan.ts        (paid-scan flow auto-mints, Phase 6)
//   - any future audit-generation path that needs a public link
//
// Retries on Postgres 23505 (unique-violation) — collisions are
// cosmically unlikely with 16 chars from a 56-char alphabet, but
// the retry costs nothing and removes a class of bug entirely.
// Throws after 3 attempts so failures surface.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export async function mintShareToken(
  admin: SupabaseClient,
  snapshotId: string,
): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = generateShareToken();
    const now = new Date().toISOString();
    const { error } = await admin
      .from('discovery_score_snapshots')
      .update({ share_token: token, shared_at: now })
      .eq('id', snapshotId);
    if (!error) return token;
    if (error.code !== '23505') {
      throw new Error(`mintShareToken: persist failed: ${error.message}`);
    }
  }
  throw new Error('mintShareToken: could not mint share token after retries');
}
