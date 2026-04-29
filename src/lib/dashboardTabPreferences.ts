// ============================================================
// Per-user tab persistence via localStorage.
//
// Stored key: "dashboardTab:{auditId}" → tab id string.
// Falls back to 'overview' if missing or invalid.
//
// Per-audit, not global — different audits may have different
// "last visited" tabs depending on what the user was doing.
// ============================================================

import type { DashboardTabId } from '@/components/dashboard/TabNav';

const VALID_TABS: ReadonlySet<DashboardTabId> = new Set<DashboardTabId>([
  'overview',
  'findings',
  'priorities',
  'competitors',
  'trends',
  'readiness',
]);

export function getLastVisitedTab(auditId: string): DashboardTabId {
  if (typeof window === 'undefined') return 'overview';
  try {
    const raw = window.localStorage.getItem(`dashboardTab:${auditId}`);
    if (raw && VALID_TABS.has(raw as DashboardTabId)) {
      return raw as DashboardTabId;
    }
  } catch {
    // localStorage may be disabled or unavailable
  }
  return 'overview';
}

export function setLastVisitedTab(auditId: string, tab: DashboardTabId): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`dashboardTab:${auditId}`, tab);
  } catch {
    // ignore quota errors etc
  }
}
