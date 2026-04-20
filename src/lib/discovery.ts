// ============================================================
// AI Discovery Prompt Testing — utility helpers
// ============================================================

import type {
  DiscoveryCluster,
  DiscoveryClusterWeights,
  DiscoveryVisibilityStatus,
} from '@/lib/types';

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
