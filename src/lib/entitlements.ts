import type { Entitlement, PlanStatus } from '@/lib/types';

// Two admin tiers (split 2026-07-12):
//
//   ADMIN_EMAILS    — cross-account VISIBILITY: see every site/audit,
//                     bypass entitlement checks and the one-site cap.
//   OPERATOR_EMAILS — Jon's OPERATIONAL tools on top of that: batch
//                     upload and API-key management (the cold-outreach
//                     machinery). Must be a subset of ADMIN_EMAILS.
//
// Mike (mikedaman@sawyer.com) is admin but deliberately NOT operator.
export const ADMIN_EMAILS = ['demo@aivisibility.test', 'mikedaman@sawyer.com'];
export const OPERATOR_EMAILS = ['demo@aivisibility.test'];

export function isAdminAccount(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

export function isOperatorAccount(email: string | null | undefined): boolean {
  if (!email) return false;
  return OPERATOR_EMAILS.includes(email.toLowerCase());
}

type Feature = 'core' | 'growth_strategy' | 'marketing_perception' | 'export';

export function checkEntitlement(entitlement: Entitlement | null, feature: Feature, userEmail?: string | null): boolean {
  if (isAdminAccount(userEmail)) return true;
  if (!entitlement) return false;
  switch (feature) {
    case 'core': return entitlement.can_view_core;
    case 'growth_strategy': return entitlement.can_view_growth_strategy;
    case 'marketing_perception': return entitlement.can_view_marketing_perception;
    case 'export': return entitlement.can_export;
    default: return false;
  }
}

export function getRunTypeLabel(runType: string): string {
  switch (runType) {
    case 'free_preview': return 'Free Preview';
    case 'paid_initial': return 'Initial Paid Audit';
    case 'manual_paid_rescan': return 'Manual Rescan';
    case 'monthly_auto_rerun': return 'Monthly Auto Rerun';
    default: return runType;
  }
}

export function getPlanBadge(planStatus: PlanStatus): { label: string; color: string } {
  switch (planStatus) {
    case 'free': return { label: 'Free', color: 'gray' };
    case 'core': return { label: 'Core', color: 'blue' };
    case 'core_premium': return { label: 'Core + Premium', color: 'purple' };
    default: return { label: 'Free', color: 'gray' };
  }
}
