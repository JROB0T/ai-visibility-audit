'use client';

import { useState } from 'react';
import { Check, X, ChevronDown, ChevronUp, Code as CodeIcon } from 'lucide-react';
import { findingSeverityColor } from '@/lib/dashboardColors';
import type {
  UnifiedFixItem,
  FixListStatus,
} from '@/app/api/audit/[id]/fix-list/route';

interface FixListItemProps {
  item: UnifiedFixItem;
  onUpdateStatus: (
    id: string,
    source: 'audit' | 'discovery',
    status: FixListStatus,
  ) => Promise<void>;
  onUpdateNotes: (
    id: string,
    source: 'audit' | 'discovery',
    notes: string,
  ) => Promise<void>;
}

export default function FixListItem({
  item,
  onUpdateStatus,
  onUpdateNotes,
}: FixListItemProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [noteDraft, setNoteDraft] = useState(item.notes || '');
  const [editingNote, setEditingNote] = useState(false);

  const accent = findingSeverityColor(item.priority);
  const isDone = item.status === 'done';
  const isSkipped = item.status === 'skipped';

  async function setStatus(s: FixListStatus): Promise<void> {
    setBusy(true);
    try {
      await onUpdateStatus(item.id, item.source, s);
    } finally {
      setBusy(false);
    }
  }

  async function commitNote(): Promise<void> {
    setBusy(true);
    try {
      await onUpdateNotes(item.id, item.source, noteDraft);
      setEditingNote(false);
    } finally {
      setBusy(false);
    }
  }

  const rowOpacity = isDone || isSkipped ? 0.5 : 1;
  const titleStyle: React.CSSProperties = {
    color: 'var(--text-primary)',
    textDecoration: isDone ? 'line-through' : 'none',
    fontStyle: isSkipped ? 'italic' : 'normal',
  };

  return (
    <div
      className="flex flex-col py-3 border-b transition-opacity"
      style={{ borderColor: 'var(--border)', opacity: rowOpacity }}
    >
      <div className="flex items-start gap-3">
        <span
          className="w-1 self-stretch rounded-full shrink-0"
          style={{ background: accent }}
          aria-hidden
        />

        <StatusCheckbox status={item.status} onChange={setStatus} disabled={busy} />

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-left font-medium hover:underline decoration-dotted underline-offset-4"
              style={titleStyle}
            >
              {item.title}
            </button>
            <SourceBadge source={item.source} />
            {item.code_snippet && (
              <CodeIcon
                className="w-3 h-3"
                style={{ color: 'var(--text-tertiary)' }}
                aria-label="Has code snippet"
              />
            )}
          </div>

          <div
            className="flex items-center gap-3 text-xs mt-1 flex-wrap"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <span>{cap(item.priority)} priority</span>
            {item.effort && <span>· {cap(item.effort)} effort</span>}
            <span>· {ownerLabel(item.owner_type)}</span>
            {item.affected_urls.length > 0 && (
              <span>
                · {item.affected_urls.length} page{item.affected_urls.length === 1 ? '' : 's'}
              </span>
            )}
          </div>

          {expanded && (
            <div className="mt-3 space-y-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
              {item.why_it_matters && (
                <div>
                  <div
                    className="text-xs uppercase tracking-wider font-medium mb-1"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    Why it matters
                  </div>
                  <p>{item.why_it_matters}</p>
                </div>
              )}
              {item.description && (
                <div>
                  <div
                    className="text-xs uppercase tracking-wider font-medium mb-1"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    What to do
                  </div>
                  <p className="whitespace-pre-wrap">{item.description}</p>
                </div>
              )}
              {item.affected_urls.length > 0 && (
                <div>
                  <div
                    className="text-xs uppercase tracking-wider font-medium mb-1"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    Affected pages
                  </div>
                  <ul
                    className="text-xs space-y-0.5"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {item.affected_urls.slice(0, 10).map((u) => (
                      <li key={u} className="break-all">
                        {u}
                      </li>
                    ))}
                    {item.affected_urls.length > 10 && (
                      <li>… and {item.affected_urls.length - 10} more</li>
                    )}
                  </ul>
                </div>
              )}
              {item.code_snippet && (
                <div>
                  <div
                    className="text-xs uppercase tracking-wider font-medium mb-1"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    Code
                  </div>
                  <pre
                    className="text-xs p-3 rounded overflow-x-auto"
                    style={{
                      background: 'var(--bg-tertiary)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <code>{item.code_snippet}</code>
                  </pre>
                </div>
              )}

              <div>
                <div
                  className="text-xs uppercase tracking-wider font-medium mb-1"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  Your notes
                </div>
                {editingNote ? (
                  <div className="flex flex-col gap-2">
                    <textarea
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      rows={3}
                      className="w-full px-2 py-1 rounded border text-sm"
                      style={{
                        background: 'var(--background)',
                        borderColor: 'var(--border)',
                        color: 'var(--text-primary)',
                      }}
                      placeholder="Note for your team, status reminder, etc…"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={commitNote}
                        disabled={busy}
                        className="text-xs px-3 py-1 rounded font-medium"
                        style={{ background: 'var(--accent)', color: '#fff' }}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNoteDraft(item.notes || '');
                          setEditingNote(false);
                        }}
                        disabled={busy}
                        className="text-xs px-3 py-1 rounded"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingNote(true)}
                    className="text-sm text-left italic"
                    style={{
                      color: item.notes ? 'var(--text-primary)' : 'var(--text-tertiary)',
                    }}
                  >
                    {item.notes || 'Click to add note…'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="p-1.5 rounded hover:bg-black/5 self-start"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? (
            <ChevronUp className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
          ) : (
            <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
          )}
        </button>
      </div>
    </div>
  );
}

function StatusCheckbox({
  status,
  onChange,
  disabled,
}: {
  status: FixListStatus;
  onChange: (s: FixListStatus) => Promise<void>;
  disabled: boolean;
}): React.ReactElement {
  const isDone = status === 'done';
  const isSkipped = status === 'skipped';
  const next: FixListStatus = isDone ? 'skipped' : isSkipped ? 'open' : 'done';
  const Icon = isDone ? Check : isSkipped ? X : null;
  const bg = isDone ? '#10B981' : isSkipped ? '#6B7280' : 'transparent';
  const border = isDone ? '#10B981' : isSkipped ? '#6B7280' : 'var(--border)';

  return (
    <button
      type="button"
      onClick={() => onChange(next)}
      disabled={disabled}
      className="w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5 transition"
      style={{ background: bg, borderColor: border, borderWidth: 1.5, borderStyle: 'solid' }}
      aria-label={`Status: ${status}. Click to change.`}
      title={`${status} — click to change`}
    >
      {Icon && <Icon className="w-3 h-3" style={{ color: '#fff' }} />}
    </button>
  );
}

function SourceBadge({ source }: { source: 'audit' | 'discovery' }): React.ReactElement {
  return (
    <span
      className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-medium"
      style={{ background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)' }}
      title={
        source === 'audit'
          ? 'Technical fix from site audit'
          : 'Strategic move from AI discovery'
      }
    >
      {source === 'audit' ? 'Technical' : 'Strategic'}
    </span>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ownerLabel(o: string): string {
  if (o === 'developer') return 'Developer';
  if (o === 'marketer') return 'Marketer';
  return 'Business Owner';
}
