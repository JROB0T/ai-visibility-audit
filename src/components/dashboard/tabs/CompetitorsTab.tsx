'use client';

import { useMemo } from 'react';
import SeverityRow from '../SeverityRow';
import type { DiscoveryCompetitor, DiscoveryResult } from '@/lib/types';

interface CompetitorsTabProps {
  competitors: DiscoveryCompetitor[];
  results: DiscoveryResult[];
}

interface AppearanceCounts {
  competitorId: string;
  name: string;
  domain: string | null;
  timesAppeared: number;
  timesBeatUs: number;
}

export default function CompetitorsTab(props: CompetitorsTabProps): React.ReactElement {
  const counts = useMemo(() => deriveCounts(props.competitors, props.results), [props.competitors, props.results]);
  const major = counts.filter((c) => c.timesAppeared >= 2);
  const minor = counts.filter((c) => c.timesAppeared === 1);

  const directories = useMemo(() => collectMentions(props.results, (r) => r.directories_detected || []), [props.results]);
  const marketplaces = useMemo(() => collectMentions(props.results, (r) => r.marketplaces_detected || []), [props.results]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Major competitors / empty state */}
      <section
        className="rounded-xl border p-6"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <h2
          className="text-sm font-bold uppercase tracking-wider mb-4"
          style={{ color: 'var(--text-primary)' }}
        >
          Major competitors
        </h2>
        {major.length === 0 ? (
          <div className="py-6 px-2">
            <p className="text-sm leading-relaxed max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
              No competitors are consistently appearing alongside your business in AI answers. This is a
              strong signal: in your market, AI doesn&rsquo;t have an obvious go-to rival to your brand.
              Maintaining this gap is defensive priority #1 in your action plan.
            </p>
          </div>
        ) : (
          major.map((c) => (
            <SeverityRow
              key={c.competitorId}
              severity={severityFromBeats(c.timesBeatUs)}
              title={c.name}
              subtitle={c.domain || undefined}
              rightLabel={`${c.timesBeatUs}/${c.timesAppeared} won`}
            />
          ))
        )}
      </section>

      {/* Minor mentions */}
      <section
        className="rounded-xl border p-6"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <h2
          className="text-sm font-bold uppercase tracking-wider mb-4"
          style={{ color: 'var(--text-primary)' }}
        >
          Minor mentions
        </h2>
        {minor.length === 0 ? (
          <p className="text-sm py-4" style={{ color: 'var(--text-tertiary)' }}>
            No one-off mentions detected in this run.
          </p>
        ) : (
          minor.map((c) => (
            <SeverityRow
              key={c.competitorId}
              severity="low"
              title={c.name}
              subtitle={c.domain || undefined}
              rightLabel="1 prompt"
            />
          ))
        )}
      </section>

      {/* Directories & marketplaces */}
      <section
        className="rounded-xl border p-6"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <h2
          className="text-sm font-bold uppercase tracking-wider mb-4"
          style={{ color: 'var(--text-primary)' }}
        >
          Directories & marketplaces
        </h2>
        {directories.length === 0 && marketplaces.length === 0 ? (
          <p className="text-sm py-4" style={{ color: 'var(--text-tertiary)' }}>
            No directories or marketplaces dominated AI answers in this run.
          </p>
        ) : (
          <div className="space-y-4">
            {directories.length > 0 && (
              <MentionList title="Directories" items={directories} />
            )}
            {marketplaces.length > 0 && (
              <MentionList title="Marketplaces" items={marketplaces} />
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function MentionList({
  title,
  items,
}: {
  title: string;
  items: Array<{ name: string; count: number }>;
}): React.ReactElement {
  return (
    <div>
      <h3
        className="text-xs uppercase tracking-wider font-medium mb-2"
        style={{ color: 'var(--text-tertiary)' }}
      >
        {title}
      </h3>
      <ul className="space-y-1.5">
        {items.map((it) => (
          <li
            key={it.name}
            className="flex items-center justify-between text-sm py-1"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span>{it.name}</span>
            <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
              {it.count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function deriveCounts(
  competitors: DiscoveryCompetitor[],
  results: DiscoveryResult[],
): AppearanceCounts[] {
  return competitors
    .map((c) => {
      const nameLower = c.name.toLowerCase();
      const domainLower = (c.domain || '').toLowerCase();
      let appeared = 0;
      let beatUs = 0;
      for (const r of results) {
        if (r.suppressed) continue;
        const names = (r.competitor_names_detected || []).map((s) => s.toLowerCase());
        const domains = (r.competitor_domains_detected || []).map((s) => s.toLowerCase());
        const present =
          (nameLower && names.includes(nameLower)) ||
          (domainLower && domains.includes(domainLower));
        if (!present) continue;
        appeared++;
        if (!r.business_mentioned) beatUs++;
      }
      return {
        competitorId: c.id,
        name: c.name,
        domain: c.domain,
        timesAppeared: appeared,
        timesBeatUs: beatUs,
      };
    })
    .filter((c) => c.timesAppeared > 0)
    .sort((a, b) => b.timesAppeared - a.timesAppeared);
}

function collectMentions(
  results: DiscoveryResult[],
  extract: (r: DiscoveryResult) => string[],
): Array<{ name: string; count: number }> {
  const tally = new Map<string, number>();
  for (const r of results) {
    if (r.suppressed) continue;
    for (const n of extract(r)) {
      tally.set(n, (tally.get(n) || 0) + 1);
    }
  }
  return Array.from(tally.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function severityFromBeats(beats: number): 'high' | 'medium' | 'low' {
  if (beats >= 3) return 'high';
  if (beats >= 1) return 'medium';
  return 'low';
}
