'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Wand2, X } from 'lucide-react';
import type { DiscoveryCompetitor, DiscoveryResult } from '@/lib/types';
import { type FindingSeverity } from '@/lib/dashboardColors';
import AddCompetitorForm from '../competitors/AddCompetitorForm';
import CompetitorRow from '../competitors/CompetitorRow';

interface CompetitorsTabProps {
  siteId: string;
  results: DiscoveryResult[];
}

interface CountedCompetitor {
  competitor: DiscoveryCompetitor;
  timesAppeared: number;
  timesBeatUs: number;
}

export default function CompetitorsTab(props: CompetitorsTabProps): React.ReactElement {
  const [competitors, setCompetitors] = useState<DiscoveryCompetitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [inferBusy, setInferBusy] = useState(false);
  const [inferFlash, setInferFlash] = useState<string | null>(null);

  const loadCompetitors = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`/api/discovery/competitors?siteId=${encodeURIComponent(props.siteId)}`);
      if (!res.ok) {
        setError('Could not load competitors');
        return;
      }
      const data = await res.json();
      setCompetitors((data.competitors || []) as DiscoveryCompetitor[]);
      setError(null);
    } catch {
      setError('Could not load competitors');
    } finally {
      setLoading(false);
    }
  }, [props.siteId]);

  useEffect(() => { void loadCompetitors(); }, [loadCompetitors]);

  // ----- Mutations -----

  async function handleAdd(input: {
    name: string;
    domain: string;
    location: string;
    category: string;
  }): Promise<void> {
    const res = await fetch('/api/discovery/competitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteId: props.siteId,
        name: input.name,
        domain: input.domain || null,
        location: input.location || null,
        category: input.category || null,
        source: 'manual',
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Add failed (${res.status})`);
    }
    setShowAddForm(false);
    await loadCompetitors();
  }

  async function handleUpdate(id: string, patch: Partial<DiscoveryCompetitor>): Promise<void> {
    // The route takes id in the JSON body, not in the URL.
    const res = await fetch('/api/discovery/competitors', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Update failed (${res.status})`);
    }
    await loadCompetitors();
  }

  async function handleDelete(id: string): Promise<void> {
    // The route takes id as a query param, not a path segment.
    const res = await fetch(`/api/discovery/competitors?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Delete failed (${res.status})`);
    }
    await loadCompetitors();
  }

  async function handleInfer(): Promise<void> {
    setInferBusy(true);
    setInferFlash(null);
    try {
      const res = await fetch('/api/discovery/competitors/infer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: props.siteId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Auto-detect failed');
        return;
      }
      const data = await res.json();
      const added = typeof data.added === 'number' ? data.added : 0;
      setInferFlash(`Detected ${added} new competitor${added === 1 ? '' : 's'} from the latest run.`);
      setTimeout(() => setInferFlash(null), 4000);
      await loadCompetitors();
    } catch {
      setError('Auto-detect failed');
    } finally {
      setInferBusy(false);
    }
  }

  // ----- Derived: appearance counts from props.results -----

  const counted = useMemo<CountedCompetitor[]>(() => {
    return competitors.map((c) => {
      const nameLower = c.name.toLowerCase();
      const domainLower = (c.domain || '').toLowerCase();
      let appeared = 0;
      let beatUs = 0;
      for (const r of props.results) {
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
      return { competitor: c, timesAppeared: appeared, timesBeatUs: beatUs };
    });
  }, [competitors, props.results]);

  const major = counted.filter((c) => c.timesAppeared >= 2);
  const minor = counted.filter((c) => c.timesAppeared === 1);
  const tracked = counted.filter((c) => c.timesAppeared === 0);

  // ----- Mentions of directories / marketplaces from results -----
  const directories = useMemo(
    () => collectMentions(props.results, (r) => r.directories_detected || []),
    [props.results],
  );
  const marketplaces = useMemo(
    () => collectMentions(props.results, (r) => r.marketplaces_detected || []),
    [props.results],
  );

  function severityOf(c: CountedCompetitor): FindingSeverity {
    if (c.timesBeatUs >= 3) return 'high';
    if (c.timesBeatUs >= 1) return 'medium';
    return 'low';
  }

  function rightLabelOf(c: CountedCompetitor): string | undefined {
    if (c.timesAppeared === 0) return 'Not yet seen';
    if (c.timesBeatUs > 0) return `beat us ${c.timesBeatUs}× · listed ${c.timesAppeared}×`;
    return `listed ${c.timesAppeared}×`;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* TOOLBAR */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Competitors
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            {competitors.length} tracked · who&rsquo;s appearing alongside you in AI answers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="text-sm px-3 py-1.5 rounded-md border inline-flex items-center gap-1.5 transition hover:bg-black/5"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            {showAddForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {showAddForm ? 'Cancel' : 'Add competitor'}
          </button>
          <button
            type="button"
            onClick={handleInfer}
            disabled={inferBusy}
            className="text-sm px-3 py-1.5 rounded-md inline-flex items-center gap-1.5 transition disabled:opacity-60"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            <Wand2 className={`w-3.5 h-3.5 ${inferBusy ? 'animate-pulse' : ''}`} />
            {inferBusy ? 'Refreshing…' : 'Refresh from latest run'}
          </button>
        </div>
      </div>

      {inferFlash && (
        <div
          className="text-sm p-3 rounded-md border"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          {inferFlash}
        </div>
      )}

      {showAddForm && (
        <AddCompetitorForm onSubmit={handleAdd} onCancel={() => setShowAddForm(false)} />
      )}

      {/* REPEAT APPEARANCES */}
      <section
        className="rounded-xl border p-6"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text-primary)' }}>
          Repeat appearances ({major.length})
        </h3>

        {loading ? (
          <p className="text-sm py-4" style={{ color: 'var(--text-tertiary)' }}>Loading…</p>
        ) : major.length === 0 ? (
          <div className="py-8 text-center max-w-md mx-auto">
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              No competitors are appearing in 2+ prompts alongside your business. In your market,
              AI doesn&rsquo;t have an obvious go-to rival to your brand. Maintaining this gap is
              defensive priority #1 in your action plan.
            </p>
            <p className="text-xs mt-3" style={{ color: 'var(--text-tertiary)' }}>
              Add known competitors manually above, or detect them from your latest run.
            </p>
          </div>
        ) : (
          <div>
            {major.map((c) => (
              <CompetitorRow
                key={c.competitor.id}
                competitor={c.competitor}
                severity={severityOf(c)}
                rightLabel={rightLabelOf(c)}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </section>

      {/* SINGLE APPEARANCES */}
      {minor.length > 0 && (
        <section
          className="rounded-xl border p-6"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text-primary)' }}>
            Single appearances ({minor.length})
          </h3>
          <div>
            {minor.map((c) => (
              <CompetitorRow
                key={c.competitor.id}
                competitor={c.competitor}
                severity="low"
                rightLabel={rightLabelOf(c)}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </section>
      )}

      {/* TRACKED, NOT YET SEEN */}
      {tracked.length > 0 && (
        <section
          className="rounded-xl border p-6"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text-primary)' }}>
            Tracked, not yet seen ({tracked.length})
          </h3>
          <p className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>
            Added to your list but haven&rsquo;t appeared in any prompts yet — they&rsquo;ll surface
            here on the next run.
          </p>
          <div>
            {tracked.map((c) => (
              <CompetitorRow
                key={c.competitor.id}
                competitor={c.competitor}
                severity="low"
                rightLabel={rightLabelOf(c)}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </section>
      )}

      {/* DIRECTORIES & MARKETPLACES — preserved from Phase 2 */}
      <section
        className="rounded-xl border p-6"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text-primary)' }}>
          Directories & marketplaces
        </h3>
        {directories.length === 0 && marketplaces.length === 0 ? (
          <p className="text-sm py-4" style={{ color: 'var(--text-tertiary)' }}>
            No directories or marketplaces dominated AI answers in this run.
          </p>
        ) : (
          <div className="space-y-4">
            {directories.length > 0 && <MentionList title="Directories" items={directories} />}
            {marketplaces.length > 0 && <MentionList title="Marketplaces" items={marketplaces} />}
          </div>
        )}
      </section>

      {error && (
        <div
          className="text-sm p-3 rounded-md border"
          style={{ background: 'rgba(239,68,68,0.05)', borderColor: '#EF4444', color: '#EF4444' }}
        >
          {error}
        </div>
      )}
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
      <h4 className="text-xs uppercase tracking-wider font-medium mb-2" style={{ color: 'var(--text-tertiary)' }}>
        {title}
      </h4>
      <ul className="space-y-1.5">
        {items.map((it) => (
          <li
            key={it.name}
            className="flex items-center justify-between text-sm py-1"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span>{it.name}</span>
            <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{it.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
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
