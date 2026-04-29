'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Filter as FilterIcon } from 'lucide-react';
import FixListItem from '../priorities/FixListItem';
import type {
  FixListOwnerType,
  FixListPriority,
  FixListStatus,
  UnifiedFixItem,
} from '@/app/api/audit/[id]/fix-list/route';
import { exportFixListAsMarkdown } from '@/lib/fixListExport';

interface PrioritiesTabProps {
  auditId: string;
  domain?: string;
  businessName?: string;
}

type StatusFilter = 'open' | 'all' | 'done' | 'skipped';
type OwnerFilter = 'all' | FixListOwnerType;
type PriorityFilter = 'all' | FixListPriority;

export default function PrioritiesTab(props: PrioritiesTabProps): React.ReactElement {
  const [items, setItems] = useState<UnifiedFixItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/audit/${props.auditId}/fix-list`);
      if (!res.ok) throw new Error(`Failed to load fix list (${res.status})`);
      const data = await res.json();
      setItems(data.items as UnifiedFixItem[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [props.auditId]);

  useEffect(() => { void load(); }, [load]);

  const handleUpdateStatus = useCallback(
    async (id: string, source: 'audit' | 'discovery', status: FixListStatus) => {
      setItems((curr) =>
        curr.map((i) => (i.id === id && i.source === source ? { ...i, status } : i)),
      );
      try {
        const res = await fetch(`/api/audit/${props.auditId}/fix-list/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source, status }),
        });
        if (!res.ok) throw new Error(`Update failed (${res.status})`);
      } catch (err) {
        void load();
        throw err;
      }
    },
    [props.auditId, load],
  );

  const handleUpdateNotes = useCallback(
    async (id: string, source: 'audit' | 'discovery', notes: string) => {
      setItems((curr) =>
        curr.map((i) => (i.id === id && i.source === source ? { ...i, notes } : i)),
      );
      try {
        const res = await fetch(`/api/audit/${props.auditId}/fix-list/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source, notes }),
        });
        if (!res.ok) throw new Error(`Notes save failed (${res.status})`);
      } catch (err) {
        void load();
        throw err;
      }
    },
    [props.auditId, load],
  );

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (statusFilter !== 'all' && i.status !== statusFilter) return false;
      if (ownerFilter !== 'all' && i.owner_type !== ownerFilter) return false;
      if (priorityFilter !== 'all' && i.priority !== priorityFilter) return false;
      return true;
    });
  }, [items, statusFilter, ownerFilter, priorityFilter]);

  const stats = useMemo(() => {
    const total = items.length;
    const done = items.filter((i) => i.status === 'done').length;
    const skipped = items.filter((i) => i.status === 'skipped').length;
    const open = total - done - skipped;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, skipped, open, pct };
  }, [items]);

  const handleExport = useCallback(() => {
    const md = exportFixListAsMarkdown(items, {
      includeDone: false,
      includeSkipped: false,
      business: { name: props.businessName, domain: props.domain },
      generatedAt: new Date().toISOString(),
    });
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fix-list-${(props.domain || props.auditId).replace(/[^a-z0-9]/gi, '-')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [items, props.businessName, props.domain, props.auditId]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <section
        className="rounded-xl border p-6"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div>
            <h2
              className="text-sm font-bold uppercase tracking-wider"
              style={{ color: 'var(--text-primary)' }}
            >
              Fix list
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              All technical and strategic items, in one checkable list
            </p>
          </div>
          <button
            type="button"
            onClick={handleExport}
            disabled={items.length === 0}
            className="text-sm px-3 py-1.5 rounded-md inline-flex items-center gap-1.5 transition disabled:opacity-50"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            <Download className="w-3.5 h-3.5" />
            Export to dev
          </button>
        </div>

        <div className="mb-4">
          <div className="flex items-baseline justify-between text-xs mb-1.5">
            <span style={{ color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--text-primary)' }}>{stats.done}</strong> of{' '}
              {stats.total} complete
            </span>
            <span style={{ color: 'var(--text-tertiary)' }}>
              {stats.open} open · {stats.skipped} skipped
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${stats.pct}%`, background: '#10B981' }}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs">
          <FilterIcon className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
          <FilterDropdown
            label="Status"
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
            options={[
              { value: 'open', label: 'Open' },
              { value: 'all', label: 'All' },
              { value: 'done', label: 'Done' },
              { value: 'skipped', label: 'Skipped' },
            ]}
          />
          <FilterDropdown
            label="For"
            value={ownerFilter}
            onChange={(v) => setOwnerFilter(v as OwnerFilter)}
            options={[
              { value: 'all', label: 'Anyone' },
              { value: 'developer', label: 'Developer' },
              { value: 'marketer', label: 'Marketer' },
              { value: 'business_owner', label: 'Business Owner' },
            ]}
          />
          <FilterDropdown
            label="Priority"
            value={priorityFilter}
            onChange={(v) => setPriorityFilter(v as PriorityFilter)}
            options={[
              { value: 'all', label: 'Any priority' },
              { value: 'high', label: 'High only' },
              { value: 'medium', label: 'Medium only' },
              { value: 'low', label: 'Low only' },
            ]}
          />
          <span style={{ color: 'var(--text-tertiary)' }}>
            · Showing {filtered.length} of {items.length}
          </span>
        </div>
      </section>

      <section
        className="rounded-xl border p-6"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        {loading ? (
          <p className="text-sm py-8 text-center" style={{ color: 'var(--text-tertiary)' }}>
            Loading…
          </p>
        ) : error ? (
          <p className="text-sm py-8 text-center" style={{ color: '#EF4444' }}>{error}</p>
        ) : items.length === 0 ? (
          <div className="py-12 text-center max-w-md mx-auto">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              No fixes generated yet. Run AI Discovery and your audit will generate specific
              items here.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm py-8 text-center" style={{ color: 'var(--text-tertiary)' }}>
            No items match your filters.
          </p>
        ) : (
          <div>
            {filtered.map((item) => (
              <FixListItem
                key={`${item.source}:${item.id}`}
                item={item}
                onUpdateStatus={handleUpdateStatus}
                onUpdateNotes={handleUpdateNotes}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function FilterDropdown({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}): React.ReactElement {
  return (
    <label className="inline-flex items-center gap-1">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1 rounded border text-xs cursor-pointer"
        style={{
          background: 'var(--background)',
          borderColor: 'var(--border)',
          color: 'var(--text-secondary)',
        }}
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
