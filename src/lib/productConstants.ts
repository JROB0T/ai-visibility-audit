// ============================================================
// Product constants — the single source of truth for numbers that
// appear in BOTH the scan engine and marketing copy, so they cannot
// drift (WO2 Task 5: marketing sold "18-prompt" while runs tested 19).
//
// SCAN_PROMPT_COUNT is enforced by selectPromptsForTier() in
// discoveryRunner.ts (paid runs select exactly this many prompts,
// filled per SCAN_CLUSTER_QUOTA) and rendered by /pricing, the
// homepage feature lists, and the root-layout JSON-LD offer.
//
// NOT importable surfaces that must be kept in sync BY HAND when
// these change:
//   - public/llms.txt ("18-prompt scan")
// ============================================================

import type { DiscoveryCluster } from './types';

/** Prompts tested per paid scan. Marketing says "{SCAN_PROMPT_COUNT}-prompt scan". */
export const SCAN_PROMPT_COUNT = 18;

/** Prompts tested per free sample (one per cluster). */
export const FREE_SCAN_PROMPT_COUNT = 6;

/**
 * Per-cluster composition of a paid run. Sums to SCAN_PROMPT_COUNT.
 * Mirrors the minimums in clusterDistributionTargets (discovery.ts) —
 * the library generator produces 20-28 candidates so this selection
 * always has headroom.
 */
export const SCAN_CLUSTER_QUOTA: Record<DiscoveryCluster, number> = {
  core: 5,
  problem: 3,
  comparison: 3,
  long_tail: 3,
  brand: 2,
  adjacent: 2,
};

// Compile-time-ish guard: quota must sum to the advertised count.
// Throws at module load in dev/test if someone edits one side only.
const quotaSum = Object.values(SCAN_CLUSTER_QUOTA).reduce((a, b) => a + b, 0);
if (quotaSum !== SCAN_PROMPT_COUNT) {
  throw new Error(
    `SCAN_CLUSTER_QUOTA sums to ${quotaSum} but SCAN_PROMPT_COUNT is ${SCAN_PROMPT_COUNT} — keep productConstants.ts internally consistent.`,
  );
}
