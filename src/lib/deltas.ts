import type { AuditDelta, FindingState, MonthlyActions } from '@/lib/types';

// Loose finding shape that works with both typed AuditFinding and API response objects
interface FindingLike {
  id: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  affected_urls: string[];
}

// Loose page shape
interface PageLike {
  url: string;
}

interface AuditWithRelations {
  overall_score: number | null;
  crawlability_score: number | null;
  machine_readability_score: number | null;
  commercial_clarity_score: number | null;
  trust_clarity_score: number | null;
  findings: FindingLike[];
  pages: PageLike[];
}

export function compareAudits(
  current: AuditWithRelations,
  previous: AuditWithRelations
): AuditDelta {
  const overallDelta = (current.overall_score ?? 0) - (previous.overall_score ?? 0);

  const categoryDeltas = {
    crawlability: (current.crawlability_score ?? 0) - (previous.crawlability_score ?? 0),
    machine_readability: (current.machine_readability_score ?? 0) - (previous.machine_readability_score ?? 0),
    commercial_clarity: (current.commercial_clarity_score ?? 0) - (previous.commercial_clarity_score ?? 0),
    trust_clarity: (current.trust_clarity_score ?? 0) - (previous.trust_clarity_score ?? 0),
  };

  const currentFindings = current.findings;
  const previousFindings = previous.findings;

  const newFindings: FindingLike[] = [];
  const resolvedFindings: FindingLike[] = [];
  const regressedFindings: FindingLike[] = [];
  const ongoingFindings: FindingLike[] = [];

  for (const finding of currentFindings) {
    const state = classifyFinding(finding, previousFindings);
    switch (state) {
      case 'new': newFindings.push(finding); break;
      case 'regressed': regressedFindings.push(finding); break;
      case 'ongoing': ongoingFindings.push(finding); break;
    }
  }

  for (const prevFinding of previousFindings) {
    const stillExists = currentFindings.some(
      (f) => f.category === prevFinding.category && f.title === prevFinding.title
    );
    if (!stillExists) {
      resolvedFindings.push(prevFinding);
    }
  }

  const currentUrls = new Set(current.pages.map((p) => p.url));
  const previousUrls = new Set(previous.pages.map((p) => p.url));

  const pagesAdded = current.pages.filter((p) => !previousUrls.has(p.url)).map((p) => p.url);
  const pagesRemoved = previous.pages.filter((p) => !currentUrls.has(p.url)).map((p) => p.url);

  return {
    overallDelta,
    categoryDeltas,
    newFindings,
    resolvedFindings,
    regressedFindings,
    ongoingFindings,
    pagesAdded,
    pagesRemoved,
  };
}

export function classifyFinding(
  finding: FindingLike,
  previousFindings: FindingLike[]
): FindingState {
  const match = previousFindings.find(
    (pf) => pf.category === finding.category && pf.title === finding.title
  );

  if (!match) return 'new';

  const severityOrder: Record<string, number> = { low: 0, medium: 1, high: 2 };
  if ((severityOrder[finding.severity] ?? 0) > (severityOrder[match.severity] ?? 0)) {
    return 'regressed';
  }

  return 'ongoing';
}

export function generateMonthlyActions(
  findings: FindingLike[],
  deltas: AuditDelta
): MonthlyActions {
  const highFindings = findings.filter((f) => f.severity === 'high');
  const medFindings = findings.filter((f) => f.severity === 'medium');
  const lowFindings = findings.filter((f) => f.severity === 'low');

  const quickWinCandidates = [
    ...deltas.regressedFindings.filter((f) => f.severity !== 'high'),
    ...deltas.newFindings.filter((f) => f.severity === 'low'),
    ...lowFindings,
  ];
  const quickWins = dedup(quickWinCandidates).slice(0, 3);

  const mediumCandidates = [
    ...deltas.newFindings.filter((f) => f.severity === 'medium'),
    ...highFindings.filter((f) => deltas.ongoingFindings.some((o) => o.title === f.title)),
    ...medFindings,
  ];
  const mediumEffort = dedup(mediumCandidates)
    .filter((f) => !quickWins.some((q) => q.title === f.title))
    .slice(0, 2);

  const strategicCandidates = [
    ...highFindings,
    ...deltas.newFindings.filter((f) => f.severity === 'high'),
  ];
  const strategic = dedup(strategicCandidates)
    .filter((f) => !quickWins.some((q) => q.title === f.title) && !mediumEffort.some((m) => m.title === f.title))
    .slice(0, 1);

  return { quickWins, mediumEffort, strategic };
}

function dedup(findings: FindingLike[]): FindingLike[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.category}:${f.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
