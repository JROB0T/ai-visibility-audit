// ============================================================
// Dashboard color system — semantic, not decorative.
//
// Three categories of color, NEVER overlapping:
//
// SEVERITY: scores, status indicators, severity chips, deltas.
//   Green = good (≥85), amber = okay (70-84), grey = mediocre (55-69), red = bad (<55).
//
// IDENTITY: interactive elements only — buttons, tab indicators, links.
//   Uses --accent (purple/indigo) from existing theme.
//
// CONTENT: everything else — text, borders, backgrounds, dividers.
//   Uses neutral greys from existing CSS variables.
// ============================================================

export const SEVERITY_COLORS = {
  good: '#10B981',
  okay: '#F59E0B',
  meh:  '#6B7280',
  bad:  '#EF4444',
} as const;

export type SeverityLevel = 'good' | 'okay' | 'meh' | 'bad';

export function severityFromScore(score: number | null): SeverityLevel {
  if (score === null) return 'meh';
  if (score >= 85) return 'good';
  if (score >= 70) return 'okay';
  if (score >= 55) return 'meh';
  return 'bad';
}

export function severityColor(score: number | null): string {
  return SEVERITY_COLORS[severityFromScore(score)];
}

export function severityFromDelta(delta: number | null): SeverityLevel {
  if (delta === null || delta === 0) return 'meh';
  return delta > 0 ? 'good' : 'bad';
}

// Severity for findings/recommendations: explicit levels from the data, not derived
export type FindingSeverity = 'high' | 'medium' | 'low';

export function findingSeverityColor(sev: FindingSeverity): string {
  switch (sev) {
    case 'high':   return SEVERITY_COLORS.bad;
    case 'medium': return SEVERITY_COLORS.okay;
    case 'low':    return SEVERITY_COLORS.meh;
  }
}

// Severity chip background — 12% alpha of the severity color
export function severityChipBg(sev: SeverityLevel): string {
  return `${SEVERITY_COLORS[sev]}1F`;
}
