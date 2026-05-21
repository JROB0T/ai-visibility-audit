// ============================================================
// /dashboard/api-keys
//
// User-facing UI for managing programmatic API keys. List existing
// keys, mint new ones, revoke. Newly minted keys are displayed ONCE
// (server returns the raw key in the create response, never again).
//
// Auth: relies on the page-level Supabase session check. The
// underlying /api/keys routes also require a session — defense in
// depth.
// ============================================================

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Copy, Key, Plus, Trash2 } from 'lucide-react';

interface StoredKey {
  id: string;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

interface NewlyMintedKey {
  id: string;
  name: string;
  prefix: string;
  raw_key: string;
  created_at: string;
}

export default function ApiKeysPage(): React.ReactElement {
  const [keys, setKeys] = useState<StoredKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newKeyName, setNewKeyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [justMinted, setJustMinted] = useState<NewlyMintedKey | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/keys');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 401) {
          setError('Please sign in to manage API keys.');
        } else {
          setError(body.error || 'Could not load API keys.');
        }
        return;
      }
      const data = await res.json();
      setKeys((data.keys || []) as StoredKey[]);
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (creating || !newKeyName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not create API key.');
        setCreating(false);
        return;
      }
      setJustMinted({
        id: data.id,
        name: data.name,
        prefix: data.prefix,
        raw_key: data.raw_key,
        created_at: data.created_at,
      });
      setNewKeyName('');
      await refresh();
    } catch {
      setError('Network error.');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(keyId: string): Promise<void> {
    if (!confirm('Revoke this key? Any tools using it will lose access immediately. This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/keys/${encodeURIComponent(keyId)}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Could not revoke key.');
        return;
      }
      await refresh();
    } catch {
      setError('Network error.');
    }
  }

  async function handleCopy(): Promise<void> {
    if (!justMinted) return;
    try {
      await navigator.clipboard.writeText(justMinted.raw_key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback: just keep the visible text, user can manually copy.
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-xs mb-4"
        style={{ color: 'var(--text-tertiary)' }}
      >
        <ArrowLeft className="w-3 h-3" /> Dashboard
      </Link>

      <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
        API keys
      </h1>
      <p className="text-sm mb-8" style={{ color: 'var(--text-tertiary)' }}>
        Generate keys for programmatic access — batch audit submission, CSV export, and integrations.
      </p>

      {justMinted && (
        <div
          className="card p-5 mb-6"
          style={{
            background: 'rgba(16,185,129,0.05)',
            border: '1px solid rgba(16,185,129,0.3)',
          }}
        >
          <div className="flex items-start gap-3">
            <Key className="w-5 h-5 mt-0.5" style={{ color: '#10b981' }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Your new key is ready.
              </p>
              <p className="text-xs mt-1 mb-3" style={{ color: 'var(--text-secondary)' }}>
                Copy it now — you won&rsquo;t be able to see it again. If you lose it, revoke and generate a new one.
              </p>
              <div className="flex items-center gap-2">
                <code
                  className="flex-1 text-xs px-3 py-2 rounded-md font-mono overflow-x-auto"
                  style={{
                    background: 'var(--bg-tertiary, #0a0a0a)',
                    color: 'var(--text-primary, #fff)',
                    border: '1px solid var(--border, #2a2a2a)',
                  }}
                >
                  {justMinted.raw_key}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="text-xs px-3 py-2 rounded-md inline-flex items-center gap-1.5 transition"
                  style={{ background: '#1a1a1a', color: '#fff' }}
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setJustMinted(null)}
                className="text-xs mt-3 underline"
                style={{ color: 'var(--text-tertiary)' }}
              >
                I&rsquo;ve saved it — dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleCreate} className="card p-5 mb-6">
        <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
          Name your new key
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="e.g. Clay outreach pipeline"
            maxLength={80}
            className="flex-1 px-3 py-2 rounded-md text-sm"
            style={{
              background: 'var(--surface)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
            }}
          />
          <button
            type="submit"
            disabled={creating || !newKeyName.trim()}
            className="btn-primary px-4 py-2 text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            {creating ? 'Creating…' : 'Create key'}
          </button>
        </div>
      </form>

      {error && (
        <div
          className="mb-6 p-3 rounded-md text-sm"
          style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            color: '#f87171',
          }}
        >
          {error}
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
          Your keys
        </h2>
        {loading ? (
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading…</p>
        ) : keys.length === 0 ? (
          <div className="card p-6 text-center">
            <Key className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-tertiary)' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              You don&rsquo;t have any API keys yet. Create one above.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {keys.map(k => (
              <li
                key={k.id}
                className="card p-4 flex items-center gap-3"
                style={{ opacity: k.revoked_at ? 0.55 : 1 }}
              >
                <Key className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {k.name}
                    </p>
                    {k.revoked_at && (
                      <span
                        className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}
                      >
                        Revoked
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--text-tertiary)' }}>
                    {k.key_prefix}…
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                    Created {new Date(k.created_at).toLocaleDateString()}
                    {k.last_used_at
                      ? ` · Last used ${new Date(k.last_used_at).toLocaleDateString()}`
                      : ' · Never used'}
                    {k.revoked_at
                      ? ` · Revoked ${new Date(k.revoked_at).toLocaleDateString()}`
                      : ''}
                  </p>
                </div>
                {!k.revoked_at && (
                  <button
                    type="button"
                    onClick={() => handleRevoke(k.id)}
                    className="text-xs px-2 py-1 rounded inline-flex items-center gap-1.5 transition"
                    style={{ color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
                  >
                    <Trash2 className="w-3 h-3" />
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-10 text-xs" style={{ color: 'var(--text-tertiary)' }}>
        <p className="mb-2 font-medium" style={{ color: 'var(--text-secondary)' }}>
          Using your key
        </p>
        <p className="mb-2">Pass the key as a Bearer token in the Authorization header:</p>
        <pre
          className="px-3 py-2 rounded-md overflow-x-auto"
          style={{
            background: 'var(--bg-tertiary, #0a0a0a)',
            color: 'var(--text-primary, #ccc)',
            border: '1px solid var(--border, #2a2a2a)',
          }}
        >
{`curl https://aivascan.com/api/audits/export?format=csv \\
  -H "Authorization: Bearer avak_live_…"`}
        </pre>
      </div>
    </div>
  );
}
