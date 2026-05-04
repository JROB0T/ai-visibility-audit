// ============================================================
// Email + URL normalization for public input.
//
// Domain normalization re-exports the canonical implementation from
// @/lib/discovery so all callers agree on what a "domain" looks like.
// ============================================================

import { normalizeDomain } from '@/lib/discovery';
export { normalizeDomain };

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

// Permissive RFC-style check. Real validation requires a delivery attempt;
// this catches obvious typos and non-emails without blocking edge-case-
// valid addresses.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(input: string): boolean {
  return EMAIL_RE.test(input.trim());
}

// Domain validation runs through normalizeDomain first (strips protocol,
// www, path, query, hash) and then matches a hostname-shaped pattern.
// Accepts: example.com, sub.example.com, foo-bar.example.co.uk
// Rejects: bare strings without a dot, IP addresses, malformed hostnames.
const DOMAIN_RE = /^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)+$/;
export function isValidDomain(input: string): boolean {
  const normalized = normalizeDomain(input);
  if (!normalized) return false;
  return DOMAIN_RE.test(normalized);
}
