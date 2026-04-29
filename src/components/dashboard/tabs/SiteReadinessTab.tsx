'use client';

import { useEffect, useState } from 'react';
import StatPair from '../StatPair';
import SeverityRow from '../SeverityRow';
import type { AuditFinding } from '@/lib/types';

interface DeltasResponse {
  hasPrevious: boolean;
  previousAuditDate: string | null;
  deltas: {
    crawlability: number | null;
    machineReadability: number | null;
    commercialClarity: number | null;
    trustClarity: number | null;
    overall: number | null;
  } | null;
}

interface AuditPage {
  id: string;
  url: string;
  page_type: string;
  title: string | null;
  has_schema: boolean;
  schema_types: string[];
  meta_description: string | null;
  h1_text: string | null;
  word_count: number | null;
  load_time_ms: number | null;
  status_code: number | null;
  issues: string[];
}

interface AuditShape {
  id: string;
  overall_score: number | null;
  crawlability_score: number | null;
  machine_readability_score: number | null;
  commercial_clarity_score: number | null;
  trust_clarity_score: number | null;
  pages_scanned: number;
  created_at: string;
  completed_at: string | null;
}

interface SiteReadinessTabProps {
  auditId: string;
  audit: AuditShape;
  findings: AuditFinding[];
  pages: AuditPage[];
  onPageDrilldown: (pageId: string) => void;
}

export default function SiteReadinessTab(props: SiteReadinessTabProps): React.ReactElement {
  const [deltas, setDeltas] = useState<DeltasResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/audit/${props.auditId}/site-readiness-deltas`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: DeltasResponse | null) => {
        if (!cancelled && data) setDeltas(data);
      })
      .catch(() => { /* silent */ });
    return () => { cancelled = true; };
  }, [props.auditId]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Top stat row */}
      <section
        className="rounded-xl border p-6"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <StatPair
            label="Overall readiness"
            value={props.audit.overall_score}
            scoreForColor={props.audit.overall_score}
            delta={deltas?.deltas?.overall ?? undefined}
            size="lg"
            subtitle={
              deltas?.previousAuditDate
                ? `Since ${formatShortDate(deltas.previousAuditDate)}`
                : 'First scan'
            }
          />
        </div>
      </section>

      {/* Four pillar tiles */}
      <section
        className="rounded-xl border p-6"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <h2
          className="text-sm font-bold uppercase tracking-wider mb-4"
          style={{ color: 'var(--text-primary)' }}
        >
          Pillars
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <StatPair
            label="Findability"
            value={props.audit.crawlability_score}
            scoreForColor={props.audit.crawlability_score}
            delta={deltas?.deltas?.crawlability ?? undefined}
            size="md"
            subtitle="Can AI find your site?"
          />
          <StatPair
            label="Explainability"
            value={props.audit.machine_readability_score}
            scoreForColor={props.audit.machine_readability_score}
            delta={deltas?.deltas?.machineReadability ?? undefined}
            size="md"
            subtitle="Can AI explain what you do?"
          />
          <StatPair
            label="Buyability"
            value={props.audit.commercial_clarity_score}
            scoreForColor={props.audit.commercial_clarity_score}
            delta={deltas?.deltas?.commercialClarity ?? undefined}
            size="md"
            subtitle="Can AI help someone buy?"
          />
          <StatPair
            label="Trustworthiness"
            value={props.audit.trust_clarity_score}
            scoreForColor={props.audit.trust_clarity_score}
            delta={deltas?.deltas?.trustClarity ?? undefined}
            size="md"
            subtitle="Can AI trust you?"
          />
        </div>
      </section>

      {/* Pages scanned */}
      <section
        className="rounded-xl border p-6"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <h2
          className="text-sm font-bold uppercase tracking-wider mb-4"
          style={{ color: 'var(--text-primary)' }}
        >
          Pages scanned ({props.pages.length})
        </h2>
        {props.pages.length === 0 ? (
          <p className="text-sm py-4" style={{ color: 'var(--text-tertiary)' }}>
            No page-level data available for this audit.
          </p>
        ) : (
          props.pages.map((p) => {
            const issueCount = p.issues?.length || 0;
            return (
              <SeverityRow
                key={p.id}
                severity={severityFromIssueCount(issueCount)}
                title={p.title || formatUrl(p.url)}
                subtitle={`${formatPageType(p.page_type)} · ${formatUrl(p.url)}`}
                rightLabel={`${issueCount} ${issueCount === 1 ? 'issue' : 'issues'}`}
                onClick={() => props.onPageDrilldown(p.id)}
              />
            );
          })
        )}
      </section>

      {/* Technical findings */}
      <section
        className="rounded-xl border p-6"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <h2
          className="text-sm font-bold uppercase tracking-wider mb-4"
          style={{ color: 'var(--text-primary)' }}
        >
          Technical findings ({props.findings.length})
        </h2>
        {props.findings.length === 0 ? (
          <p className="text-sm py-4" style={{ color: 'var(--text-tertiary)' }}>
            No technical findings flagged for this audit.
          </p>
        ) : (
          [...props.findings]
            .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
            .map((f) => (
              <SeverityRow
                key={f.id}
                severity={f.severity}
                label={categoryLabel(f.category)}
                title={f.title}
                subtitle={f.description}
                rightLabel={
                  f.affected_urls?.length
                    ? `${f.affected_urls.length} ${f.affected_urls.length === 1 ? 'page' : 'pages'}`
                    : undefined
                }
              />
            ))
        )}
      </section>
    </div>
  );
}

function severityFromIssueCount(n: number): 'high' | 'medium' | 'low' {
  if (n >= 5) return 'high';
  if (n >= 1) return 'medium';
  return 'low';
}

function severityRank(s: 'high' | 'medium' | 'low'): number {
  if (s === 'high') return 0;
  if (s === 'medium') return 1;
  return 2;
}

function categoryLabel(c: AuditFinding['category']): string {
  switch (c) {
    case 'crawlability':         return 'Findability';
    case 'machine_readability':  return 'Explainability';
    case 'commercial_clarity':   return 'Buyability';
    case 'trust_clarity':        return 'Trustworthiness';
  }
}

function formatPageType(t: string): string {
  if (!t) return 'Page';
  return t.charAt(0).toUpperCase() + t.slice(1).replace(/-/g, ' ');
}

function formatUrl(url: string): string {
  try {
    return new URL(url).pathname || '/';
  } catch {
    return url;
  }
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
