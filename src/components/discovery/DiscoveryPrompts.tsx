'use client';

import { useMemo, useState } from 'react';
import { Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { clusterLabel, formatRelativeDate } from '@/lib/discovery';
import type { DiscoveryCluster, DiscoveryPriority, DiscoveryPrompt } from '@/lib/types';

const ALL_CLUSTERS: DiscoveryCluster[] = ['core', 'problem', 'comparison', 'long_tail', 'brand', 'adjacent'];
const ALL_PRIORITIES: DiscoveryPriority[] = ['high', 'medium', 'low'];

type ClusterFilter = DiscoveryCluster | 'all';
type PriorityFilter = DiscoveryPriority | 'all';

interface PromptsProps {
  prompts: DiscoveryPrompt[];
  siteId: string;
  isPaid: boolean;
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
}

function priorityColor(p: DiscoveryPriority): string {
  if (p === 'high') return '#EF4444';
  if (p === 'medium') return '#F59E0B';
  return '#10B981';
}

export default function DiscoveryPrompts(props: PromptsProps): React.ReactElement {
  const { prompts, siteId, isPaid, isAdmin, onRefresh } = props;

  // Hooks must run unconditionally — declare all state before any early returns.
  const [clusterFilter, setClusterFilter] = useState<ClusterFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [activeOnly, setActiveOnly] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addText, setAddText] = useState('');
  const [addCluster, setAddCluster] = useState<DiscoveryCluster>('core');
  const [addPriority, setAddPriority] = useState<DiscoveryPriority>('medium');
  const [addServiceTag, setAddServiceTag] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  const [regenBusy, setRegenBusy] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return prompts.filter(p => {
      if (activeOnly && !p.active) return false;
      if (clusterFilter !== 'all' && p.cluster !== clusterFilter) return false;
      if (priorityFilter !== 'all' && p.priority !== priorityFilter) return false;
      return true;
    });
  }, [prompts, clusterFilter, priorityFilter, activeOnly]);

  const activeCount = useMemo(() => prompts.filter(p => p.active).length, [prompts]);

  const allowFull = isPaid || isAdmin;

  // ============================================================
  // Mutations
  // ============================================================
  async function patchPrompt(id: string, patch: Record<string, unknown>): Promise<void> {
    setBusyId(id);
    setRowError(prev => ({ ...prev, [id]: '' }));
    try {
      const res = await fetch('/api/discovery/prompts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Update failed' }));
        setRowError(prev => ({ ...prev, [id]: data.error || 'Update failed' }));
        return;
      }
      await onRefresh();
    } catch (err) {
      console.error('[DiscoveryPrompts] patch failed:', err);
      setRowError(prev => ({ ...prev, [id]: 'Update failed' }));
    } finally {
      setBusyId(null);
    }
  }

  async function softDelete(id: string): Promise<void> {
    setBusyId(id);
    try {
      const res = await fetch(`/api/discovery/prompts?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Delete failed' }));
        setRowError(prev => ({ ...prev, [id]: data.error || 'Delete failed' }));
        return;
      }
      await onRefresh();
    } catch (err) {
      console.error('[DiscoveryPrompts] delete failed:', err);
      setRowError(prev => ({ ...prev, [id]: 'Delete failed' }));
    } finally {
      setBusyId(null);
    }
  }

  async function addPrompt(): Promise<void> {
    if (addText.trim().length < 10) {
      setAddError('Prompt must be at least 10 characters.');
      return;
    }
    setAddBusy(true);
    setAddError(null);
    try {
      const res = await fetch('/api/discovery/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId,
          prompt_text: addText.trim(),
          cluster: addCluster,
          priority: addPriority,
          service_line_tag: addServiceTag.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Add failed' }));
        setAddError(data.error || 'Add failed');
        return;
      }
      setShowAdd(false);
      setAddText('');
      setAddServiceTag('');
      setAddCluster('core');
      setAddPriority('medium');
      await onRefresh();
    } catch (err) {
      console.error('[DiscoveryPrompts] add failed:', err);
      setAddError('Add failed');
    } finally {
      setAddBusy(false);
    }
  }

  async function regenerate(): Promise<void> {
    if (!confirm('Regenerate your prompt library? This will archive existing generated prompts and create a fresh set. Your custom prompts will be preserved.')) return;
    setRegenBusy(true);
    setRegenError(null);
    try {
      const res = await fetch('/api/discovery/generate-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, force: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Regeneration failed' }));
        setRegenError(data.error || 'Regeneration failed');
        return;
      }
      await onRefresh();
    } catch (err) {
      console.error('[DiscoveryPrompts] regenerate failed:', err);
      setRegenError('Regeneration failed');
    } finally {
      setRegenBusy(false);
    }
  }

  async function generateInitial(): Promise<void> {
    setRegenBusy(true);
    setRegenError(null);
    try {
      const res = await fetch('/api/discovery/generate-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Generation failed' }));
        setRegenError(data.error || 'Generation failed');
        return;
      }
      await onRefresh();
    } catch (err) {
      console.error('[DiscoveryPrompts] generate failed:', err);
      setRegenError('Generation failed');
    } finally {
      setRegenBusy(false);
    }
  }

  // ============================================================
  // TEASER MODE (render after hooks)
  // ============================================================
  if (!allowFull) {
    const teaserPrompts = prompts.slice(0, 5);
    return (
      <div>
        <div className="mb-4">
          <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Prompts library</h3>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            You&rsquo;re viewing a free preview. Upgrade to see and manage your full 25-prompt discovery library, add custom prompts, and run targeted tests.
          </p>
        </div>
        <div className="space-y-2">
          {teaserPrompts.map(p => (
            <div
              key={p.id}
              className="rounded-xl border p-4"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <ClusterPill cluster={p.cluster} />
                <PriorityPill priority={p.priority} />
              </div>
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{p.prompt_text}</p>
            </div>
          ))}
        </div>
        <div className="mt-5">
          <a href="/pricing" className="btn-primary px-4 py-2 text-sm font-medium inline-flex items-center gap-2">
            Upgrade for full library
          </a>
        </div>
      </div>
    );
  }

  // ============================================================
  // FULL MODE
  // ============================================================
  if (prompts.length === 0) {
    return (
      <div
        className="rounded-xl border p-10 text-center"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
          You haven&rsquo;t generated a prompt library yet.
        </h3>
        <p className="mt-2 text-sm max-w-lg mx-auto" style={{ color: 'var(--text-secondary)' }}>
          We&rsquo;ll create a tailored set of 20-28 prompts covering every question type a buyer might ask AI about your business.
        </p>
        <button
          type="button"
          onClick={generateInitial}
          disabled={regenBusy}
          className="mt-5 btn-primary px-5 py-2.5 text-sm font-medium inline-flex items-center gap-2"
        >
          {regenBusy ? 'Generating…' : 'Generate prompts'}
        </button>
        {regenError && (
          <p className="mt-3 text-sm" style={{ color: '#F87171' }}>{regenError}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Your AI Discovery prompts</h3>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {activeCount} active prompts across 6 categories. Edit, toggle, add your own, or regenerate the library.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowAdd(v => !v)}
            className="btn-secondary px-3 py-2 text-sm font-medium inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Add custom prompt
          </button>
          <button
            type="button"
            onClick={regenerate}
            disabled={regenBusy}
            className="btn-secondary px-3 py-2 text-sm font-medium inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${regenBusy ? 'animate-spin' : ''}`} />
            {regenBusy ? 'Regenerating…' : 'Regenerate library'}
          </button>
        </div>
      </div>

      {regenError && (
        <div
          className="mb-3 p-3 rounded-md border text-sm"
          style={{ borderColor: 'rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)', color: '#F87171' }}
        >
          {regenError}
        </div>
      )}

      {/* FILTERS */}
      <div
        className="mb-4 rounded-xl border p-3 flex items-center gap-2 flex-wrap"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <label className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>Cluster</label>
        <select
          value={clusterFilter}
          onChange={e => setClusterFilter(e.target.value as ClusterFilter)}
          className="text-sm rounded-md border px-2 py-1"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        >
          <option value="all">All</option>
          {ALL_CLUSTERS.map(c => <option key={c} value={c}>{clusterLabel(c)}</option>)}
        </select>
        <label className="text-xs font-medium uppercase tracking-wide ml-2" style={{ color: 'var(--text-tertiary)' }}>Priority</label>
        <select
          value={priorityFilter}
          onChange={e => setPriorityFilter(e.target.value as PriorityFilter)}
          className="text-sm rounded-md border px-2 py-1"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        >
          <option value="all">All</option>
          {ALL_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <label className="inline-flex items-center gap-1.5 text-sm ml-2" style={{ color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} />
          Active only
        </label>
      </div>

      {/* ADD FORM */}
      {showAdd && (
        <div
          className="mb-3 rounded-xl border p-4"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-start justify-between mb-3">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Add a custom prompt</p>
            <button type="button" onClick={() => setShowAdd(false)} aria-label="Close add form">
              <X className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
            </button>
          </div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Prompt text</label>
          <textarea
            value={addText}
            onChange={e => setAddText(e.target.value)}
            rows={2}
            className="w-full text-sm rounded-md border px-3 py-2 mb-3"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            placeholder="e.g. What&apos;s the best tool for…"
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Cluster</label>
              <select
                value={addCluster}
                onChange={e => setAddCluster(e.target.value as DiscoveryCluster)}
                className="w-full text-sm rounded-md border px-2 py-1.5"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                {ALL_CLUSTERS.map(c => <option key={c} value={c}>{clusterLabel(c)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Priority</label>
              <select
                value={addPriority}
                onChange={e => setAddPriority(e.target.value as DiscoveryPriority)}
                className="w-full text-sm rounded-md border px-2 py-1.5"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                {ALL_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Service line (optional)</label>
              <input
                type="text"
                value={addServiceTag}
                onChange={e => setAddServiceTag(e.target.value)}
                className="w-full text-sm rounded-md border px-2 py-1.5"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>
          {addError && <p className="mb-2 text-sm" style={{ color: '#F87171' }}>{addError}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={addPrompt}
              disabled={addBusy}
              className="btn-primary px-3 py-1.5 text-sm font-medium"
            >
              {addBusy ? 'Saving…' : 'Save prompt'}
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
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div
            className="rounded-xl border p-6 text-center text-sm"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-tertiary)' }}
          >
            No prompts match these filters.
          </div>
        )}
        {filtered.map(p => {
          const isEditing = editingId === p.id;
          return (
            <div
              key={p.id}
              className="rounded-xl border p-3 flex items-start gap-3 flex-wrap md:flex-nowrap"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)', opacity: p.active ? 1 : 0.55 }}
            >
              <div className="flex flex-col gap-1.5 shrink-0 min-w-[140px]">
                <ClusterPill cluster={p.cluster} />
                <select
                  value={p.priority}
                  onChange={e => patchPrompt(p.id, { priority: e.target.value })}
                  disabled={busyId === p.id}
                  className="text-xs rounded-md border px-1.5 py-0.5"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: priorityColor(p.priority) }}
                  aria-label="Priority"
                >
                  {ALL_PRIORITIES.map(pri => <option key={pri} value={pri}>{pri}</option>)}
                </select>
                <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  {p.last_tested_at ? `Tested ${formatRelativeDate(p.last_tested_at)}` : 'Never tested'}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                {isEditing ? (
                  <textarea
                    autoFocus
                    rows={2}
                    value={editDraft}
                    onChange={e => setEditDraft(e.target.value)}
                    onBlur={() => {
                      const trimmed = editDraft.trim();
                      if (trimmed.length >= 10 && trimmed !== p.prompt_text) {
                        void patchPrompt(p.id, { prompt_text: trimmed });
                      }
                      setEditingId(null);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Escape') { setEditingId(null); }
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        (e.target as HTMLTextAreaElement).blur();
                      }
                    }}
                    className="w-full text-sm rounded-md border px-2 py-1.5"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => { setEditingId(p.id); setEditDraft(p.prompt_text); }}
                    className="text-left w-full text-sm"
                    style={{ color: 'var(--text-primary)' }}
                    title="Click to edit"
                  >
                    {p.prompt_text}
                  </button>
                )}
                {rowError[p.id] && (
                  <p className="mt-1 text-xs" style={{ color: '#F87171' }}>{rowError[p.id]}</p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <label className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  <input
                    type="checkbox"
                    checked={p.active}
                    onChange={e => patchPrompt(p.id, { active: e.target.checked })}
                    disabled={busyId === p.id}
                  />
                  Active
                </label>
                <button
                  type="button"
                  onClick={() => softDelete(p.id)}
                  disabled={busyId === p.id}
                  className="p-1.5 rounded-md"
                  style={{ color: 'var(--text-tertiary)' }}
                  aria-label="Delete prompt"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Small pills
// ============================================================
function ClusterPill({ cluster }: { cluster: DiscoveryCluster }): React.ReactElement {
  return (
    <span
      className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full"
      style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
    >
      {clusterLabel(cluster)}
    </span>
  );
}

function PriorityPill({ priority }: { priority: DiscoveryPriority }): React.ReactElement {
  const color = priorityColor(priority);
  return (
    <span
      className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full uppercase tracking-wide"
      style={{ color, background: `${color}20` }}
    >
      {priority}
    </span>
  );
}
