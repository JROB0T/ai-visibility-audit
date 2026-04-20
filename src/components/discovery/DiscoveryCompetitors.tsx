'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, X, Wand2 } from 'lucide-react';
import type { DiscoveryCompetitor, DiscoveryTier } from '@/lib/types';

const MAX_COMPETITORS = 10;

interface CompetitorsProps {
  siteId: string;
  tier: DiscoveryTier | null;
  isPaid: boolean;
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
}

function sourceLabel(source: DiscoveryCompetitor['source']): string {
  switch (source) {
    case 'manual': return 'Manual';
    case 'inferred': return 'Inferred';
    case 'growth_strategy': return 'Auto-detected';
  }
}

export default function DiscoveryCompetitors(props: CompetitorsProps): React.ReactElement {
  const { siteId, isPaid, isAdmin, onRefresh } = props;

  const [competitors, setCompetitors] = useState<DiscoveryCompetitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addDomain, setAddDomain] = useState('');
  const [addLocation, setAddLocation] = useState('');
  const [addCategory, setAddCategory] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);

  const [inferBusy, setInferBusy] = useState(false);
  const [inferFlash, setInferFlash] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editField, setEditField] = useState<'name' | 'domain' | 'location' | 'category' | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const loadCompetitors = useCallback(async () => {
    try {
      const res = await fetch(`/api/discovery/competitors?siteId=${encodeURIComponent(siteId)}`);
      if (!res.ok) {
        setError('Could not load competitors');
        return;
      }
      const data = await res.json();
      setCompetitors((data.competitors || []) as DiscoveryCompetitor[]);
    } catch (err) {
      console.error('[DiscoveryCompetitors] load failed:', err);
      setError('Could not load competitors');
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    void loadCompetitors();
  }, [loadCompetitors]);

  async function patchCompetitor(id: string, patch: Record<string, unknown>): Promise<void> {
    setBusyId(id);
    setRowError(prev => ({ ...prev, [id]: '' }));
    try {
      const res = await fetch('/api/discovery/competitors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Update failed' }));
        setRowError(prev => ({ ...prev, [id]: data.error || 'Update failed' }));
        return;
      }
      await loadCompetitors();
      await onRefresh();
    } catch (err) {
      console.error('[DiscoveryCompetitors] patch failed:', err);
      setRowError(prev => ({ ...prev, [id]: 'Update failed' }));
    } finally {
      setBusyId(null);
    }
  }

  async function deleteCompetitor(id: string, name: string): Promise<void> {
    if (!confirm(`Delete ${name}?`)) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/discovery/competitors?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Delete failed' }));
        setRowError(prev => ({ ...prev, [id]: data.error || 'Delete failed' }));
        return;
      }
      await loadCompetitors();
      await onRefresh();
    } catch (err) {
      console.error('[DiscoveryCompetitors] delete failed:', err);
      setRowError(prev => ({ ...prev, [id]: 'Delete failed' }));
    } finally {
      setBusyId(null);
    }
  }

  async function addCompetitor(): Promise<void> {
    const nameTrim = addName.trim();
    if (nameTrim.length < 2) {
      setAddError('Name must be at least 2 characters.');
      return;
    }
    const domainTrim = addDomain.trim();
    if (domainTrim && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domainTrim)) {
      setAddError('Domain format looks invalid.');
      return;
    }
    setAddBusy(true);
    setAddError(null);
    try {
      const res = await fetch('/api/discovery/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId,
          name: nameTrim,
          domain: domainTrim || undefined,
          location: addLocation.trim() || undefined,
          category: addCategory.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Add failed' }));
        setAddError(data.error || 'Add failed');
        return;
      }
      setShowAdd(false);
      setAddName(''); setAddDomain(''); setAddLocation(''); setAddCategory('');
      await loadCompetitors();
      await onRefresh();
    } catch (err) {
      console.error('[DiscoveryCompetitors] add failed:', err);
      setAddError('Add failed');
    } finally {
      setAddBusy(false);
    }
  }

  async function inferCompetitors(): Promise<void> {
    setInferBusy(true);
    setInferFlash(null);
    try {
      const before = competitors.length;
      const res = await fetch('/api/discovery/competitors/infer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Auto-detect failed' }));
        setError(data.error || 'Auto-detect failed');
        return;
      }
      const data = await res.json();
      const after = (data.competitors || []).length;
      const added = Math.max(0, after - before);
      setInferFlash(added > 0 ? `Added ${added} competitor${added === 1 ? '' : 's'}` : 'No new competitors detected');
      await loadCompetitors();
      await onRefresh();
    } catch (err) {
      console.error('[DiscoveryCompetitors] infer failed:', err);
      setError('Auto-detect failed');
    } finally {
      setInferBusy(false);
    }
  }

  function startEdit(id: string, field: 'name' | 'domain' | 'location' | 'category', current: string | null): void {
    setEditingId(id);
    setEditField(field);
    setEditDraft(current || '');
  }

  function commitEdit(c: DiscoveryCompetitor): void {
    if (!editField) return;
    const trimmed = editDraft.trim();
    const currentVal = (c[editField] as string | null) || '';
    setEditingId(null);
    setEditField(null);
    if (trimmed === currentVal.trim()) return;
    if (editField === 'name' && trimmed.length < 2) return;
    void patchCompetitor(c.id, { [editField]: trimmed || null });
  }

  const allowFull = isPaid || isAdmin;

  // ============================================================
  // TEASER GATE
  // ============================================================
  if (!allowFull) {
    return (
      <div
        className="rounded-xl border p-10 text-center"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Competitor tracking is part of the full report.</h3>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Upgrade to track competitors, auto-detect rivals from your existing data, and see who surfaces instead of you in AI answers.
        </p>
        <a href="/pricing" className="mt-5 btn-primary px-4 py-2 text-sm font-medium inline-flex items-center gap-2">
          Upgrade
        </a>
      </div>
    );
  }

  // ============================================================
  // FULL MODE
  // ============================================================
  if (loading) {
    return (
      <div
        className="rounded-xl border p-8 text-center"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading competitors…</p>
      </div>
    );
  }

  const activeCount = competitors.filter(c => c.active).length;
  const atLimit = competitors.length >= MAX_COMPETITORS;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Competitors tracked</h3>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {activeCount} active competitor{activeCount === 1 ? '' : 's'}. We&rsquo;ll look for these in every AI answer.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowAdd(v => !v)}
            disabled={atLimit}
            className="btn-secondary px-3 py-2 text-sm font-medium inline-flex items-center gap-1.5"
            title={atLimit ? `Up to ${MAX_COMPETITORS} competitors` : ''}
          >
            <Plus className="w-4 h-4" />
            Add competitor
          </button>
          <button
            type="button"
            onClick={inferCompetitors}
            disabled={inferBusy}
            className="btn-secondary px-3 py-2 text-sm font-medium inline-flex items-center gap-1.5"
          >
            <Wand2 className={`w-4 h-4 ${inferBusy ? 'animate-pulse' : ''}`} />
            {inferBusy ? 'Detecting…' : 'Auto-detect competitors'}
          </button>
        </div>
      </div>

      {atLimit && (
        <p className="mb-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          You&rsquo;ve reached the {MAX_COMPETITORS}-competitor limit. Delete one to add another.
        </p>
      )}

      {inferFlash && (
        <div
          className="mb-3 p-3 rounded-md border text-sm"
          style={{ borderColor: 'rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.08)', color: '#10B981' }}
        >
          {inferFlash}
        </div>
      )}
      {error && (
        <div
          className="mb-3 p-3 rounded-md border text-sm"
          style={{ borderColor: 'rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)', color: '#F87171' }}
        >
          {error}
        </div>
      )}

      {/* ADD FORM */}
      {showAdd && (
        <div
          className="mb-3 rounded-xl border p-4"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-start justify-between mb-3">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Add a competitor</p>
            <button type="button" onClick={() => setShowAdd(false)} aria-label="Close add form">
              <X className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <Field label="Name (required)" value={addName} onChange={setAddName} />
            <Field label="Domain (optional)" value={addDomain} onChange={setAddDomain} placeholder="example.com" />
            <Field label="Location (optional)" value={addLocation} onChange={setAddLocation} />
            <Field label="Category (optional)" value={addCategory} onChange={setAddCategory} />
          </div>
          {addError && <p className="mb-2 text-sm" style={{ color: '#F87171' }}>{addError}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={addCompetitor}
              disabled={addBusy}
              className="btn-primary px-3 py-1.5 text-sm font-medium"
            >
              {addBusy ? 'Saving…' : 'Save competitor'}
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="btn-secondary px-3 py-1.5 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* LIST */}
      {competitors.length === 0 ? (
        <div
          className="rounded-xl border p-8 text-center"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            No competitors yet. Add them manually or use Auto-detect to pull from your recent audits.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {competitors.map(c => (
            <div
              key={c.id}
              className="rounded-xl border p-3"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)', opacity: c.active ? 1 : 0.55 }}
            >
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-center">
                <EditableCell
                  label="Name"
                  value={c.name}
                  editing={editingId === c.id && editField === 'name'}
                  draft={editDraft}
                  onDraft={setEditDraft}
                  onStart={() => startEdit(c.id, 'name', c.name)}
                  onCommit={() => commitEdit(c)}
                />
                <EditableCell
                  label="Domain"
                  value={c.domain}
                  editing={editingId === c.id && editField === 'domain'}
                  draft={editDraft}
                  onDraft={setEditDraft}
                  onStart={() => startEdit(c.id, 'domain', c.domain)}
                  onCommit={() => commitEdit(c)}
                />
                <EditableCell
                  label="Location"
                  value={c.location}
                  editing={editingId === c.id && editField === 'location'}
                  draft={editDraft}
                  onDraft={setEditDraft}
                  onStart={() => startEdit(c.id, 'location', c.location)}
                  onCommit={() => commitEdit(c)}
                />
                <EditableCell
                  label="Category"
                  value={c.category}
                  editing={editingId === c.id && editField === 'category'}
                  draft={editDraft}
                  onDraft={setEditDraft}
                  onStart={() => startEdit(c.id, 'category', c.category)}
                  onCommit={() => commitEdit(c)}
                />
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="inline-flex px-2 py-0.5 text-[11px] font-medium rounded-full"
                    style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                  >
                    {sourceLabel(c.source)}
                  </span>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      <input
                        type="checkbox"
                        checked={c.active}
                        onChange={e => patchCompetitor(c.id, { active: e.target.checked })}
                        disabled={busyId === c.id}
                      />
                      Active
                    </label>
                    <button
                      type="button"
                      onClick={() => deleteCompetitor(c.id, c.name)}
                      disabled={busyId === c.id}
                      className="p-1.5 rounded-md"
                      style={{ color: 'var(--text-tertiary)' }}
                      aria-label={`Delete ${c.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
              {rowError[c.id] && (
                <p className="mt-2 text-xs" style={{ color: '#F87171' }}>{rowError[c.id]}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Small helpers
// ============================================================
function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }): React.ReactElement {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-sm rounded-md border px-2 py-1.5"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
      />
    </div>
  );
}

function EditableCell({
  label, value, editing, draft, onDraft, onStart, onCommit,
}: {
  label: string;
  value: string | null;
  editing: boolean;
  draft: string;
  onDraft: (v: string) => void;
  onStart: () => void;
  onCommit: () => void;
}): React.ReactElement {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
      {editing ? (
        <input
          autoFocus
          type="text"
          value={draft}
          onChange={e => onDraft(e.target.value)}
          onBlur={onCommit}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
            if (e.key === 'Escape') { onDraft(value || ''); (e.target as HTMLInputElement).blur(); }
          }}
          className="w-full text-sm rounded-md border px-2 py-1 mt-0.5"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        />
      ) : (
        <button
          type="button"
          onClick={onStart}
          className="text-left w-full text-sm mt-0.5 truncate"
          style={{ color: value ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
          title="Click to edit"
        >
          {value || '—'}
        </button>
      )}
    </div>
  );
}
