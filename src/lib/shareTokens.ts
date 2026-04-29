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
