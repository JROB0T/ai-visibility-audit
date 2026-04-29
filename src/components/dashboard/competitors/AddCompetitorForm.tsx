'use client';

import { useState } from 'react';

interface AddCompetitorFormProps {
  onSubmit: (input: {
    name: string;
    domain: string;
    location: string;
    category: string;
  }) => Promise<void>;
  onCancel: () => void;
}

export default function AddCompetitorForm({
  onSubmit,
  onCancel,
}: AddCompetitorFormProps): React.ReactElement {
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(): Promise<void> {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        domain: domain.trim(),
        location: location.trim(),
        category: category.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Add failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="rounded-lg border p-4 mb-4"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
    >
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
        Add a competitor
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Name *" value={name} onChange={setName} placeholder="ABC Plumbing" />
        <Field label="Domain" value={domain} onChange={setDomain} placeholder="abcplumbing.com" />
        <Field label="Location" value={location} onChange={setLocation} placeholder="Tinton Falls, NJ" />
        <Field label="Category" value={category} onChange={setCategory} placeholder="Plumbing" />
      </div>

      {error && (
        <p className="text-xs mt-3" style={{ color: '#EF4444' }}>{error}</p>
      )}

      <div className="flex items-center gap-2 mt-4">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy || !name.trim()}
          className="text-sm px-3 py-1.5 rounded-md font-medium transition disabled:opacity-50"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          {busy ? 'Adding…' : 'Add competitor'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="text-sm px-3 py-1.5 rounded-md transition disabled:opacity-50"
          style={{ color: 'var(--text-secondary)' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}): React.ReactElement {
  return (
    <label className="block">
      <span
        className="text-xs uppercase tracking-wider font-medium block mb-1"
        style={{ color: 'var(--text-tertiary)' }}
      >
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-md border text-sm outline-none"
        style={{
          background: 'var(--background)',
          borderColor: 'var(--border)',
          color: 'var(--text-primary)',
        }}
      />
    </label>
  );
}
