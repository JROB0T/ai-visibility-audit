import type { RunType, BillingEventType } from '@/lib/types';

export const PRICES = {
  initialScan: 5000,
  rescan: 3500,
  monthly: 2500,
} as const;

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function isRescanBillable(site: { has_monthly_monitoring?: boolean }): boolean {
  return true;
}

export function getPriceForRunType(runType: RunType): number {
  switch (runType) {
    case 'free_preview': return 0;
    case 'paid_initial': return PRICES.initialScan;
    case 'manual_paid_rescan': return PRICES.rescan;
    case 'monthly_auto_rerun': return PRICES.monthly;
    default: return 0;
  }
}

export type { RunType, BillingEventType };
