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
  core: { min: 5, max: 7 },
  problem: { min: 3, max: 5 },
  comparison: { min: 3, max: 5 },
  long_tail: { min: 3, max: 5 },
  brand: { min: 2, max: 3 },
  adjacent: { min: 2, max: 3 },
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

// ============================================================
// Domain helpers (used by runner + competitor inference)
// ============================================================

/**
 * Normalize a URL or domain string to just the bare lowercased hostname.
 * Strips protocol, 'www.', any path, and trailing slash.
 */
export function normalizeDomain(input: string | null | undefined): string {
  if (!input) return '';
  return String(input)
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/.*$/, '')
    .replace(/\/$/, '')
    .toLowerCase();
}

/**
 * Common directory/aggregator domains. AI answers that lean heavily on these
 * are a sign that the business itself is invisible in AI discovery.
 */
export const DIRECTORY_DOMAINS: readonly string[] = [
  'yelp.com',
  'yellowpages.com',
  'angi.com',
  'angieslist.com',
  'thumbtack.com',
  'bbb.org',
  'tripadvisor.com',
  'houzz.com',
  'bark.com',
  'homeadvisor.com',
  'trustpilot.com',
  'g2.com',
  'capterra.com',
];

/**
 * Common marketplace domains. Similar signal as directories.
 */
/**
 * Format a date as a plain-English relative string.
 * Returns 'Never' for null, 'just now' for <60s, '5 minutes ago', '2 hours ago',
 * '3 days ago', or 'Oct 12' for older dates.
 */
export function formatRelativeDate(date: string | Date | null): string {
  if (!date) return 'Never';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return 'Never';
  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 14) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const MARKETPLACE_DOMAINS: readonly string[] = [
  'amazon.com',
  'ebay.com',
  'etsy.com',
  'walmart.com',
  'target.com',
  'wayfair.com',
  'homedepot.com',
  'lowes.com',
];
