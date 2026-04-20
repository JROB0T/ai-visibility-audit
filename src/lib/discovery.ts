// ============================================================
// AI Discovery Prompt Testing — utility helpers
// ============================================================

import type {
  DiscoveryCluster,
  DiscoveryClusterWeights,
  DiscoveryPrompt,
  DiscoveryVisibilityStatus,
} from '@/lib/types';
import { ADMIN_EMAILS } from '@/lib/entitlements';

export const DEFAULT_DISCOVERY_CLUSTER_WEIGHTS: DiscoveryClusterWeights = {
  core: 0.30,
  problem: 0.20,
  comparison: 0.20,
  long_tail: 0.15,
  brand: 0.10,
  adjacent: 0.05,
};

export function clusterLabel(cluster: DiscoveryCluster): string {
  switch (cluster) {
    case 'core':
      return 'Core Purchase Intent';
    case 'problem':
      return 'Problem-Based';
    case 'comparison':
      return 'Comparison / Best-Of';
    case 'long_tail':
      return 'Service Detail / Long-Tail';
    case 'brand':
      return 'Brand & Category';
    case 'adjacent':
      return 'Adjacent Opportunity';
  }
}

export function visibilityStatusLabel(status: DiscoveryVisibilityStatus): string {
  switch (status) {
    case 'strong_presence':
      return 'Strong presence';
    case 'partial_presence':
      return 'Partial presence';
    case 'indirect_presence':
      return 'Indirect presence';
    case 'absent':
      return 'Absent';
    case 'competitor_dominant':
      return 'Competitor-dominant';
    case 'directory_dominant':
      return 'Directory-dominant';
    case 'unclear':
      return 'Unclear';
  }
}

export function visibilityStatusColor(status: DiscoveryVisibilityStatus): string {
  switch (status) {
    case 'strong_presence':
      return 'text-emerald-500';
    case 'partial_presence':
      return 'text-amber-500';
    case 'indirect_presence':
      return 'text-amber-500';
    case 'absent':
      return 'text-red-500';
    case 'competitor_dominant':
      return 'text-red-500';
    case 'directory_dominant':
      return 'text-red-500';
    case 'unclear':
      return 'text-slate-400';
  }
}

// ============================================================
// Admin / auth helpers
// ============================================================

export const adminEmails: string[] = ADMIN_EMAILS;

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails.includes(email.toLowerCase());
}

// ============================================================
// Prompt distribution targets (used by generation + validation)
// ============================================================

export const clusterDistributionTargets: Record<DiscoveryCluster, { min: number; max: number }> = {
  core: { min: 5, max: 8 },
  problem: { min: 4, max: 6 },
  comparison: { min: 4, max: 6 },
  long_tail: { min: 4, max: 8 },
  brand: { min: 2, max: 4 },
  adjacent: { min: 2, max: 4 },
};

// ============================================================
// Client-side fetch helper
// ============================================================

export async function fetchDiscoveryPrompts(siteId: string): Promise<DiscoveryPrompt[]> {
  const res = await fetch(`/api/discovery/prompts?siteId=${encodeURIComponent(siteId)}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch discovery prompts: ${res.status}`);
  }
  const data = await res.json();
  return (data.prompts || []) as DiscoveryPrompt[];
}
