'use client';

import { useState } from 'react';
import { Trash2, Check, X, Pencil } from 'lucide-react';
import type { DiscoveryCompetitor } from '@/lib/types';
import { findingSeverityColor, type FindingSeverity } from '@/lib/dashboardColors';

type EditableField = 'name' | 'domain' | 'location' | 'category';

interface CompetitorRowProps {
  competitor: DiscoveryCompetitor;
  severity: FindingSeverity;
  rightLabel?: string;
  onUpdate: (id: string, patch: Partial<DiscoveryCompetitor>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export default function CompetitorRow({
  competitor,
  severity,
  rightLabel,
  onUpdate,
  onDelete,
}: CompetitorRowProps): React.ReactElement {
  const accent = findingSeverityColor(severity);
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit(field: EditableField): void {
    setEditingField(field);
    setDraft((competitor[field] as string) || '');
    setError(null);
  }

  async function commit(): Promise<void> {
    if (!editingField) return;
    const value = draft.trim();
    if (editingField === 'name' && !value) {
      setError('Name cannot be empty');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onUpdate(competitor.id, { [editingField]: value || null } as Partial<DiscoveryCompetitor>);
      setEditingField(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!confirm(`Delete competitor "${competitor.name}"? This can't be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      await onDelete(competitor.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="flex items-stretch gap-4 py-3 border-b group"
      style={{ borderColor: 'var(--border)' }}
    >
      <span
        className="w-1 self-stretch rounded-full shrink-0"
        style={{ background: accent }}
        aria-hidden
      />

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <EditableText
            value={competitor.name}
            isEditing={editingField === 'name'}
            draft={draft}
            onDraftChange={setDraft}
            onStartEdit={() => startEdit('name')}
            onCancel={() => setEditingField(null)}
            onCommit={commit}
            busy={busy}
            placeholder="Competitor name"
            className="font-medium text-base"
            primary
          />
          <SourceTag source={competitor.source} />
        </div>

        <div className="flex items-baseline gap-3 text-sm flex-wrap">
          <EditableText
            value={competitor.domain}
            isEditing={editingField === 'domain'}
            draft={draft}
            onDraftChange={setDraft}
            onStartEdit={() => startEdit('domain')}
            onCancel={() => setEditingField(null)}
            onCommit={commit}
            busy={busy}
            placeholder="domain.com"
            className=""
          />
          <EditableText
            value={competitor.location}
            isEditing={editingField === 'location'}
            draft={draft}
            onDraftChange={setDraft}
            onStartEdit={() => startEdit('location')}
            onCancel={() => setEditingField(null)}
            onCommit={commit}
            busy={busy}
            placeholder="Location"
            className=""
          />
          <EditableText
            value={competitor.category}
            isEditing={editingField === 'category'}
            draft={draft}
            onDraftChange={setDraft}
            onStartEdit={() => startEdit('category')}
            onCancel={() => setEditingField(null)}
            onCommit={commit}
            busy={busy}
            placeholder="Category"
            className=""
          />
        </div>

        {error && (
          <p className="text-xs mt-1" style={{ color: '#EF4444' }}>{error}</p>
        )}
      </div>

      {rightLabel && (
        <div
          className="text-xs shrink-0 self-center text-right"
          style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}
        >
          {rightLabel}
        </div>
      )}

      <button
        type="button"
        onClick={handleDelete}
        disabled={busy}
        className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition shrink-0 self-center p-1.5 rounded hover:bg-black/5"
        aria-label={`Delete ${competitor.name}`}
        title="Delete"
      >
        <Trash2 className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
      </button>
    </div>
  );
}

function SourceTag({ source }: { source: DiscoveryCompetitor['source'] }): React.ReactElement {
  const label =
    source === 'manual' ? 'Manual' : source === 'inferred' ? 'Inferred' : 'Auto-detected';
  return (
    <span
      className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-medium"
      style={{ background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)' }}
      title={`Source: ${label}`}
    >
      {label}
    </span>
  );
}

interface EditableTextProps {
  value: string | null;
  isEditing: boolean;
  draft: string;
  onDraftChange: (v: string) => void;
  onStartEdit: () => void;
  onCancel: () => void;
  onCommit: () => void;
  busy: boolean;
  placeholder: string;
  className: string;
  primary?: boolean;
}

function EditableText({
  value,
  isEditing,
  draft,
  onDraftChange,
  onStartEdit,
  onCancel,
  onCommit,
  busy,
  placeholder,
  className,
  primary,
}: EditableTextProps): React.ReactElement {
  const displayColor = primary ? 'var(--text-primary)' : 'var(--text-secondary)';

  if (isEditing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          type="text"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommit();
            if (e.key === 'Escape') onCancel();
          }}
          autoFocus
          disabled={busy}
          placeholder={placeholder}
          className={`${className} px-1.5 py-0.5 rounded border outline-none`}
          style={{
            background: 'var(--background)',
            borderColor: 'var(--accent)',
            color: 'var(--text-primary)',
            minWidth: '120px',
          }}
        />
        <button
          type="button"
          onClick={onCommit}
          disabled={busy}
          aria-label="Save"
          className="p-1 rounded hover:bg-black/5"
        >
          <Check className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          aria-label="Cancel"
          className="p-1 rounded hover:bg-black/5"
        >
          <X className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onStartEdit}
      className={`${className} text-left inline-flex items-center gap-1 group/edit hover:underline decoration-dotted underline-offset-2`}
      style={{ color: value ? displayColor : 'var(--text-tertiary)' }}
      title="Click to edit"
    >
      {value || <span className="italic">{placeholder}</span>}
      <Pencil className="w-3 h-3 opacity-0 group-hover/edit:opacity-50 transition" />
    </button>
  );
}
