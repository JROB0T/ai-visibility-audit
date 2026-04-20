'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit2, X } from 'lucide-react';
import { clusterLabel } from '@/lib/discovery';
import type {
  DiscoveryCluster,
  DiscoveryCompetitor,
  DiscoveryOwnerType,
  DiscoveryPriority,
  DiscoveryRecommendation,
  DiscoveryTier,
} from '@/lib/types';

const CATEGORY_LABELS: Record<string, string> = {
  website_structure: 'Website Structure',
  service_page_creation: 'Service Page Creation',
  location_page_improvement: 'Location Page Improvement',
  faq_qa: 'FAQ / Q&A',
  comparison_content: 'Comparison Content',
  schema_structured_data: 'Schema & Structured Data',
  reviews_testimonials: 'Reviews & Testimonials',
  authority_trust: 'Authority & Trust',
  product_service_descriptions: 'Product / Service Descriptions',
  internal_linking: 'Internal Linking',
  ai_readable_content: 'AI-Readable Content',
  brand_association: 'Brand Association',
};

const OWNER_LABELS: Record<DiscoveryOwnerType, string> = {
  developer: 'Developer',
  marketer: 'Marketer',
  business_owner: 'Business Owner',
};

const PRIORITIES: DiscoveryPriority[] = ['high', 'medium', 'low'];
const IMPACT_LEVELS: DiscoveryPriority[] = ['high', 'medium', 'low'];
const OWNER_TYPES: DiscoveryOwnerType[] = ['developer', 'marketer', 'business_owner'];

function priorityColor(p: DiscoveryPriority | null | undefined): string {
  if (p === 'high') return '#EF4444';
  if (p === 'medium') return '#F59E0B';
  if (p === 'low') return '#10B981';
  return '#94A3B8';
}

interface RecommendationsProps {
  siteId: string;
  latestRunId: string | null;
  tier: DiscoveryTier | null;
  isPaid: boolean;
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
}

interface EditDraft {
  title: string;
  description: string;
  why_it_matters: string;
  priority: DiscoveryPriority;
  owner_type: DiscoveryOwnerType;
  impact_estimate: DiscoveryPriority;
  difficulty_estimate: DiscoveryPriority;
  suggested_timeline: string;
}

export default function DiscoveryRecommendations(props: RecommendationsProps): React.ReactElement {
  const { siteId, latestRunId, isPaid, isAdmin, onRefresh } = props;

  const [recommendations, setRecommendations] = useState<DiscoveryRecommendation[]>([]);
  const [competitors, setCompetitors] = useState<DiscoveryCompetitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [recsRes, compRes] = await Promise.all([
        fetch(
          latestRunId
            ? `/api/discovery/recommendations?siteId=${encodeURIComponent(siteId)}&runId=${encodeURIComponent(latestRunId)}`
            : `/api/discovery/recommendations?siteId=${encodeURIComponent(siteId)}`,
        ),
        fetch(`/api/discovery/competitors?siteId=${encodeURIComponent(siteId)}`),
      ]);
      if (!recsRes.ok) {
        setError('Could not load recommendations');
        return;
      }
      const recsData = await recsRes.json();
      setRecommendations((recsData.recommendations || []) as DiscoveryRecommendation[]);
      if (compRes.ok) {
        const compData = await compRes.json();
        setCompetitors((compData.competitors || []) as DiscoveryCompetitor[]);
      }
    } catch (err) {
      console.error('[DiscoveryRecommendations] load failed:', err);
      setError('Could not load recommendations');
    } finally {
      setLoading(false);
    }
  }, [siteId, latestRunId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const compById = useMemo(() => {
    const m = new Map<string, DiscoveryCompetitor>();
    for (const c of competitors) m.set(c.id, c);
    return m;
  }, [competitors]);

  const grouped = useMemo(() => {
    const buckets: Record<DiscoveryPriority, DiscoveryRecommendation[]> = { high: [], medium: [], low: [] };
    for (const r of recommendations) {
      const p = (r.priority as DiscoveryPriority) || 'medium';
      buckets[p].push(r);
    }
    return buckets;
  }, [recommendations]);

  async function saveEdit(id: string): Promise<void> {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await fetch('/api/discovery/recommendations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...draft }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Save failed' }));
        setError(data.error || 'Save failed');
        return;
      }
      setEditingId(null);
      setDraft(null);
      await loadAll();
      await onRefresh();
    } catch (err) {
      console.error('[DiscoveryRecommendations] save failed:', err);
      setError('Save failed');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(rec: DiscoveryRecommendation): void {
    setEditingId(rec.id);
    setDraft({
      title: rec.title,
      description: rec.description || '',
      why_it_matters: rec.why_it_matters || '',
      priority: (rec.priority as DiscoveryPriority) || 'medium',
      owner_type: (rec.owner_type as DiscoveryOwnerType) || 'marketer',
      impact_estimate: (rec.impact_estimate as DiscoveryPriority) || 'medium',
      difficulty_estimate: (rec.difficulty_estimate as DiscoveryPriority) || 'medium',
      suggested_timeline: rec.suggested_timeline || '',
    });
  }

  const allowFull = isPaid || isAdmin;

  // ============================================================
  // TEASER GATE
  // ============================================================
  if (!allowFull) {
    const single = recommendations[0];
    return (
      <div>
        <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Recommendations</h3>
        {single ? (
          <div
            className="mt-3 rounded-xl border p-4"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <PriorityPill priority={(single.priority as DiscoveryPriority) || 'medium'} />
              <CategoryPill category={single.category} />
            </div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{single.title}</p>
            {single.description && (
              <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>{single.description}</p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Run a discovery test from the Overview tab to generate your first fix.
          </p>
        )}
        <div
          className="mt-4 rounded-xl border p-6 text-center"
          style={{
            background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(16,185,129,0.06))',
            borderColor: 'var(--border)',
          }}
        >
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>See your full fix plan</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Up to 12 recommendations prioritized by impact, with owner assignments and timelines.
          </p>
          <a href="/pricing" className="mt-4 btn-primary px-4 py-2 text-sm font-medium inline-flex items-center gap-2">
            Upgrade
          </a>
        </div>
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
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading recommendations…</p>
      </div>
    );
  }

  if (recommendations.length === 0) {
    return (
      <div
        className="rounded-xl border p-10 text-center"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>No recommendations yet</h3>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Run a discovery test from the Overview tab to generate your first fix plan.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Prioritized recommendations</h3>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {recommendations.length} action{recommendations.length === 1 ? '' : 's'} to improve your AI discoverability.
        </p>
      </div>

      {error && (
        <div
          className="mb-3 p-3 rounded-md border text-sm"
          style={{ borderColor: 'rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)', color: '#F87171' }}
        >
          {error}
        </div>
      )}

      {PRIORITIES.map(p => {
        const items = grouped[p];
        if (items.length === 0) return null;
        return (
          <section key={p} className="mb-6">
            <h4 className="flex items-center gap-2 text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ background: priorityColor(p) }}
              />
              {p === 'high' ? 'High priority' : p === 'medium' ? 'Medium priority' : 'Low priority'}
              <span className="text-xs font-normal" style={{ color: 'var(--text-tertiary)' }}>({items.length})</span>
            </h4>
            <div className="space-y-3">
              {items.map(rec => {
                const compNames = (rec.linked_competitor_ids || [])
                  .map(id => compById.get(id)?.name)
                  .filter((n): n is string => typeof n === 'string');
                const isEditing = editingId === rec.id;
                return (
                  <div
                    key={rec.id}
                    className="rounded-xl border p-4"
                    style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                  >
                    {!isEditing && (
                      <>
                        <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <PriorityPill priority={(rec.priority as DiscoveryPriority) || 'medium'} />
                            <CategoryPill category={rec.category} />
                            {rec.edited_by_admin && (
                              <span
                                className="inline-flex px-2 py-0.5 text-[11px] font-medium rounded-full"
                                style={{ background: 'rgba(99,102,241,0.15)', color: '#6366F1' }}
                              >
                                Edited
                              </span>
                            )}
                          </div>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => startEdit(rec)}
                              className="inline-flex items-center gap-1 text-xs"
                              style={{ color: 'var(--text-tertiary)' }}
                              aria-label="Edit recommendation"
                            >
                              <Edit2 className="w-3.5 h-3.5" /> Edit
                            </button>
                          )}
                        </div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{rec.title}</p>
                        {rec.description && (
                          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>{rec.description}</p>
                        )}
                        {rec.why_it_matters && (
                          <div
                            className="mt-3 rounded-md p-3 text-sm"
                            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                          >
                            <p className="text-[11px] font-medium uppercase tracking-wide mb-1" style={{ color: 'var(--text-tertiary)' }}>Why this matters</p>
                            {rec.why_it_matters}
                          </div>
                        )}
                        <div className="mt-3 flex flex-wrap gap-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          <Stat label="Owner" value={rec.owner_type ? OWNER_LABELS[rec.owner_type as DiscoveryOwnerType] : '—'} />
                          <Stat label="Impact" value={rec.impact_estimate || '—'} />
                          <Stat label="Difficulty" value={rec.difficulty_estimate || '—'} />
                          <Stat label="Timeline" value={rec.suggested_timeline || '—'} />
                        </div>
                        {(rec.linked_prompt_clusters && rec.linked_prompt_clusters.length > 0) && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {(rec.linked_prompt_clusters as DiscoveryCluster[]).map(cl => (
                              <span
                                key={cl}
                                className="inline-flex px-2 py-0.5 text-[11px] font-medium rounded-full"
                                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                              >
                                {clusterLabel(cl)}
                              </span>
                            ))}
                          </div>
                        )}
                        {compNames.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {compNames.map(n => (
                              <span
                                key={n}
                                className="inline-flex px-2 py-0.5 text-[11px] font-medium rounded-full"
                                style={{ background: 'rgba(249,115,22,0.12)', color: '#F97316' }}
                              >
                                {n}
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    )}

                    {isEditing && draft && (
                      <EditForm
                        draft={draft}
                        setDraft={setDraft}
                        saving={saving}
                        onSave={() => saveEdit(rec.id)}
                        onCancel={() => { setEditingId(null); setDraft(null); }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================
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

function CategoryPill({ category }: { category: string | null }): React.ReactElement {
  const label = category ? (CATEGORY_LABELS[category] || category.replace(/_/g, ' ')) : '—';
  return (
    <span
      className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full"
      style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
    >
      {label}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
      <p className="text-xs" style={{ color: 'var(--text-primary)' }}>{value}</p>
    </div>
  );
}

function EditForm({
  draft, setDraft, saving, onSave, onCancel,
}: {
  draft: EditDraft;
  setDraft: (d: EditDraft) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}): React.ReactElement {
  return (
    <div>
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Edit recommendation</p>
        <button type="button" onClick={onCancel} aria-label="Cancel edit">
          <X className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
        </button>
      </div>
      <div className="space-y-3">
        <TextField label="Title" value={draft.title} onChange={v => setDraft({ ...draft, title: v })} />
        <TextArea label="Description" value={draft.description} onChange={v => setDraft({ ...draft, description: v })} />
        <TextArea label="Why this matters" value={draft.why_it_matters} onChange={v => setDraft({ ...draft, why_it_matters: v })} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SelectField
            label="Priority"
            value={draft.priority}
            options={PRIORITIES}
            onChange={v => setDraft({ ...draft, priority: v as DiscoveryPriority })}
          />
          <SelectField
            label="Owner"
            value={draft.owner_type}
            options={OWNER_TYPES}
            onChange={v => setDraft({ ...draft, owner_type: v as DiscoveryOwnerType })}
          />
          <SelectField
            label="Impact"
            value={draft.impact_estimate}
            options={IMPACT_LEVELS}
            onChange={v => setDraft({ ...draft, impact_estimate: v as DiscoveryPriority })}
          />
          <SelectField
            label="Difficulty"
            value={draft.difficulty_estimate}
            options={IMPACT_LEVELS}
            onChange={v => setDraft({ ...draft, difficulty_estimate: v as DiscoveryPriority })}
          />
        </div>
        <TextField label="Suggested timeline" value={draft.suggested_timeline} onChange={v => setDraft({ ...draft, suggested_timeline: v })} />
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="btn-primary px-3 py-1.5 text-sm font-medium"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="btn-secondary px-3 py-1.5 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }): React.ReactElement {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full text-sm rounded-md border px-2 py-1.5"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
      />
    </div>
  );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }): React.ReactElement {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={3}
        className="w-full text-sm rounded-md border px-2 py-1.5"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
      />
    </div>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }): React.ReactElement {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full text-sm rounded-md border px-2 py-1.5"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
      >
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
