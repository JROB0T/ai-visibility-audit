// ============================================================
// /dashboard/batch-upload
//
// CSV upload UI on top of the batch API (Feature 6 / Phase 10).
// Pipeline: parse CSV → preview + validate → auto-split into
// chunks of <=50 → POST each chunk to /api/audits/batch → poll
// /api/audits/batch/[id] for all batch ids → unified download
// via /api/audits/export?audit_ids=... when complete.
//
// Auth: page-level session check (Supabase). The batch endpoints
// also require a session or API key — defense in depth.
// ============================================================

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Upload, AlertTriangle, CheckCircle2, Download, ExternalLink, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Tier = 'free' | 'tier_1' | 'tier_2';
type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

interface ParsedRow {
  name: string;
  website: string;
  location: string;
  industry: string;
  email: string;
}

interface InvalidRow {
  rowNumber: number;  // 1-based, matches user's CSV viewer
  reason: string;
  raw: string;
}

interface BatchJob {
  job_id: string;
  business_name: string;
  website: string;
  tier: Tier;
  status: JobStatus;
  audit_id: string | null;
  error: string | null;
  overall_score: number | null;
  grade: string;
  share_url: string | null;
  report_url: string | null;
}

interface Counts {
  total: number;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
}

const CHUNK_SIZE = 50;
const POLL_INTERVAL_MS = 3000;

// Column-name aliases. Header row is matched case-insensitively against
// these — the canonical key is the value the API expects.
const COLUMN_ALIASES: Record<keyof ParsedRow, string[]> = {
  name: ['name', 'business', 'business_name', 'business name', 'company'],
  website: ['website', 'url', 'domain', 'site'],
  location: ['location', 'city', 'address'],
  industry: ['industry', 'vertical', 'category'],
  email: ['email', 'contact_email', 'contact email', 'e-mail'],
};

// Minimal CSV parser. Handles quoted fields, escaped quotes (""),
// commas inside quotes, and \r\n / \n line endings. Doesn't support
// fancy stuff like multi-char delimiters — keep it small.
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.some(c => c.trim().length > 0)) rows.push(row);
        row = [];
      } else field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some(c => c.trim().length > 0)) rows.push(row);
  }
  return rows;
}

// Map header row → column indexes for each canonical field.
function detectColumns(header: string[]): Partial<Record<keyof ParsedRow, number>> {
  const lower = header.map(h => h.trim().toLowerCase());
  const out: Partial<Record<keyof ParsedRow, number>> = {};
  for (const key of Object.keys(COLUMN_ALIASES) as Array<keyof ParsedRow>) {
    for (const alias of COLUMN_ALIASES[key]) {
      const idx = lower.indexOf(alias);
      if (idx !== -1) { out[key] = idx; break; }
    }
  }
  return out;
}

function looksLikeUrl(s: string): boolean {
  const v = s.trim();
  if (!v) return false;
  // Permissive — server does the authoritative isValidDomain check.
  // Just guard against obvious headers ("Business Name") and empty lines.
  if (/\s/.test(v) && !/^https?:\/\//i.test(v)) return false;
  return /\./.test(v);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function gradeColor(s: number | null): string {
  if (s === null) return 'var(--text-tertiary)';
  if (s >= 70) return '#10B981';
  if (s >= 50) return '#F59E0B';
  return '#EF4444';
}

export default function BatchUploadPage(): React.ReactElement {
  const router = useRouter();

  // ----- Auth gate -----
  const [authChecked, setAuthChecked] = useState(false);
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push('/auth/login?redirect=/dashboard/batch-upload');
      else setAuthChecked(true);
    });
  }, [router]);

  // ----- Top-level state machine -----
  // We keep this as discrete fields rather than a tagged union because
  // the running/done states share most state and only differ on the
  // "are we still polling" boolean — flat is easier to read.
  const [parsed, setParsed] = useState<{ rows: ParsedRow[]; invalid: InvalidRow[] } | null>(null);
  const [tier, setTier] = useState<Tier>('free');
  const [parseError, setParseError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState<{ done: number; total: number } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [batchIds, setBatchIds] = useState<string[] | null>(null);
  const [items, setItems] = useState<BatchJob[]>([]);
  const [counts, setCounts] = useState<Counts>({ total: 0, queued: 0, processing: 0, completed: 0, failed: 0 });
  const [polling, setPolling] = useState(false);

  const [downloading, setDownloading] = useState(false);

  // ----- CSV parsing -----
  const handleFile = useCallback(async (file: File): Promise<void> => {
    setParseError(null);
    setParsed(null);
    try {
      const text = await file.text();
      const grid = parseCSV(text);
      if (grid.length === 0) { setParseError('CSV is empty.'); return; }

      // Detect a header row by looking for known column names. If the
      // first row matches >=1 alias, treat it as a header; otherwise
      // assume positional columns: name, website, location, industry.
      const headerCandidates = detectColumns(grid[0]);
      const hasHeader = Object.keys(headerCandidates).length > 0;
      let columns: Partial<Record<keyof ParsedRow, number>>;
      let dataStart: number;
      if (hasHeader) {
        columns = headerCandidates;
        dataStart = 1;
      } else {
        columns = { name: 0, website: 1, location: 2, industry: 3, email: 4 };
        dataStart = 0;
      }

      if (columns.website === undefined) {
        setParseError('Could not find a website column. Expected one of: website, url, domain, site.');
        return;
      }

      const rows: ParsedRow[] = [];
      const invalid: InvalidRow[] = [];
      for (let i = dataStart; i < grid.length; i++) {
        const r = grid[i];
        const get = (k: keyof ParsedRow): string => {
          const idx = columns[k];
          if (idx === undefined) return '';
          return (r[idx] ?? '').trim();
        };
        const website = get('website');
        const raw = r.join(', ');
        if (!website) {
          invalid.push({ rowNumber: i + 1, reason: 'missing website', raw });
          continue;
        }
        if (!looksLikeUrl(website)) {
          invalid.push({ rowNumber: i + 1, reason: `not a domain: "${website}"`, raw });
          continue;
        }
        rows.push({
          name: get('name'),
          website,
          location: get('location'),
          industry: get('industry'),
          email: get('email'),
        });
      }

      if (rows.length === 0) {
        setParseError('No valid rows found. Make sure your CSV has a website column with one domain per row.');
        return;
      }
      setParsed({ rows, invalid });
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Could not read file.');
    }
  }, []);

  // ----- Submit (with auto-split) -----
  const handleSubmit = useCallback(async (): Promise<void> => {
    if (!parsed) return;
    setSubmitError(null);
    const chunks = chunk(parsed.rows, CHUNK_SIZE);
    setSubmitting({ done: 0, total: chunks.length });

    const allBatchIds: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const body = {
        businesses: c.map(r => ({
          name: r.name || undefined,
          website: r.website,
          location: r.location || undefined,
          industry: r.industry || undefined,
          email: r.email || undefined,
          tier,
        })),
      };
      try {
        const res = await fetch('/api/audits/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setSubmitError(
            `Chunk ${i + 1} of ${chunks.length} failed: ${data.error || res.statusText}. ${allBatchIds.length} chunk(s) succeeded — they're still running.`
          );
          break;
        }
        allBatchIds.push(data.batch_id);
        setSubmitting({ done: i + 1, total: chunks.length });
      } catch {
        setSubmitError(`Chunk ${i + 1} of ${chunks.length} failed: network error.`);
        break;
      }
    }

    setSubmitting(null);
    if (allBatchIds.length > 0) {
      setBatchIds(allBatchIds);
      setPolling(true);
    }
  }, [parsed, tier]);

  // ----- Poll batch status -----
  // setTimeout chain rather than setInterval so a slow response can't
  // cause overlapping requests. Stops when no queued/processing left.
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);
  useEffect(() => {
    if (!polling || !batchIds || batchIds.length === 0) return;
    cancelledRef.current = false;

    const tick = async (): Promise<void> => {
      const results = await Promise.all(
        batchIds.map(id =>
          fetch(`/api/audits/batch/${encodeURIComponent(id)}`)
            .then(r => r.ok ? r.json() : null)
            .catch(() => null),
        ),
      );
      if (cancelledRef.current) return;

      const merged: BatchJob[] = [];
      const agg: Counts = { total: 0, queued: 0, processing: 0, completed: 0, failed: 0 };
      for (const r of results) {
        if (!r) continue;
        agg.total += r.counts.total;
        agg.queued += r.counts.queued;
        agg.processing += r.counts.processing;
        agg.completed += r.counts.completed;
        agg.failed += r.counts.failed;
        for (const a of (r.audits || [])) merged.push(a as BatchJob);
      }
      setCounts(agg);
      setItems(merged);

      const done = agg.queued === 0 && agg.processing === 0 && agg.total > 0;
      if (done) {
        setPolling(false);
        return;
      }
      pollTimerRef.current = setTimeout(() => { void tick(); }, POLL_INTERVAL_MS);
    };

    void tick();
    return () => {
      cancelledRef.current = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [polling, batchIds]);

  // ----- Download unified CSV -----
  const handleDownload = useCallback(async (): Promise<void> => {
    const completedIds = items.filter(i => i.status === 'completed' && i.audit_id).map(i => i.audit_id!);
    if (completedIds.length === 0) return;
    setDownloading(true);
    try {
      const url = `/api/audits/export?format=csv&audit_ids=${encodeURIComponent(completedIds.join(','))}`;
      const res = await fetch(url);
      if (!res.ok) {
        setSubmitError('Download failed. Try again or use the API directly.');
        return;
      }
      const blob = await res.blob();
      const dl = document.createElement('a');
      dl.href = URL.createObjectURL(blob);
      dl.download = `batch-upload-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(dl);
      dl.click();
      document.body.removeChild(dl);
      URL.revokeObjectURL(dl.href);
    } finally {
      setDownloading(false);
    }
  }, [items]);

  // ----- Reset to upload another -----
  const handleReset = useCallback((): void => {
    cancelledRef.current = true;
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    setParsed(null);
    setParseError(null);
    setSubmitting(null);
    setSubmitError(null);
    setBatchIds(null);
    setItems([]);
    setCounts({ total: 0, queued: 0, processing: 0, completed: 0, failed: 0 });
    setPolling(false);
  }, []);

  if (!authChecked) return <div className="min-h-screen" />;

  // ====== RENDER ======
  const allDone = batchIds !== null && counts.total > 0 && counts.queued === 0 && counts.processing === 0;
  const numChunks = parsed ? Math.ceil(parsed.rows.length / CHUNK_SIZE) : 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-xs mb-4"
        style={{ color: 'var(--text-tertiary)' }}
      >
        <ArrowLeft className="w-3 h-3" /> Dashboard
      </Link>

      <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
        Batch upload
      </h1>
      <p className="text-sm mb-8" style={{ color: 'var(--text-tertiary)' }}>
        Upload a CSV of businesses, audits run in the background, then download a combined report.
      </p>

      {/* ---------- STEP 1: file picker (only when nothing parsed yet) ---------- */}
      {!parsed && !batchIds && (
        <div className="card p-6">
          <label
            className="block border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition"
            style={{ borderColor: 'var(--border)' }}
          >
            <Upload className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--text-tertiary)' }} />
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
              Choose a CSV file
            </p>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Columns: <code>name, website, location, industry, email</code> — only website is required.
              <br />
              <span style={{ color: 'var(--text-tertiary)' }}>
                Email is passed through to the export CSV for cold-outreach tools.
              </span>
            </p>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
          </label>
          {parseError && (
            <div className="mt-4 p-3 rounded-md text-sm flex items-start gap-2" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}
        </div>
      )}

      {/* ---------- STEP 2: preview + confirm ---------- */}
      {parsed && !batchIds && (
        <div>
          <div className="card p-5 mb-5">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {parsed.rows.length} valid {parsed.rows.length === 1 ? 'row' : 'rows'}
                  {parsed.invalid.length > 0 && (
                    <span style={{ color: '#F59E0B' }}> · {parsed.invalid.length} skipped</span>
                  )}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                  {numChunks === 1
                    ? 'Will submit as 1 batch.'
                    : `Will auto-split into ${numChunks} batches of ≤${CHUNK_SIZE}.`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>Tier:</label>
                <select
                  value={tier}
                  onChange={(e) => setTier(e.target.value as Tier)}
                  disabled={submitting !== null}
                  className="text-xs px-2 py-1.5 rounded-md"
                  style={{ background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                >
                  <option value="free">Free (sample)</option>
                  <option value="tier_1">Tier 1</option>
                  <option value="tier_2">Tier 2</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto border rounded-md" style={{ borderColor: 'var(--border)' }}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'var(--surface)' }}>
                    <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>Name</th>
                    <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>Website</th>
                    <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>Email</th>
                    <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>Location</th>
                    <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>Industry</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 10).map((r, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                      <td className="px-3 py-2" style={{ color: 'var(--text-primary)' }}>{r.name || <span style={{ color: 'var(--text-tertiary)' }}>—</span>}</td>
                      <td className="px-3 py-2 font-mono" style={{ color: 'var(--text-secondary)' }}>{r.website}</td>
                      <td className="px-3 py-2 font-mono" style={{ color: 'var(--text-secondary)' }}>{r.email || <span style={{ color: 'var(--text-tertiary)' }}>—</span>}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{r.location || <span style={{ color: 'var(--text-tertiary)' }}>—</span>}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{r.industry || <span style={{ color: 'var(--text-tertiary)' }}>—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsed.rows.length > 10 && (
              <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
                Showing first 10 of {parsed.rows.length} rows.
              </p>
            )}
          </div>

          {parsed.invalid.length > 0 && (
            <details className="card p-4 mb-5">
              <summary className="text-xs cursor-pointer" style={{ color: '#F59E0B' }}>
                <AlertTriangle className="w-3 h-3 inline mr-1" />
                {parsed.invalid.length} row{parsed.invalid.length === 1 ? '' : 's'} skipped — click to inspect
              </summary>
              <div className="mt-3 max-h-48 overflow-y-auto text-xs space-y-1.5">
                {parsed.invalid.slice(0, 50).map((iv, i) => (
                  <div key={i} style={{ color: 'var(--text-tertiary)' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Row {iv.rowNumber}:</span> {iv.reason}
                  </div>
                ))}
                {parsed.invalid.length > 50 && (
                  <p style={{ color: 'var(--text-tertiary)' }}>…and {parsed.invalid.length - 50} more.</p>
                )}
              </div>
            </details>
          )}

          {submitError && (
            <div className="mb-5 p-3 rounded-md text-sm flex items-start gap-2" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting !== null}
              className="btn-primary px-5 py-2.5 text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting !== null ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Submitting batch {submitting.done + 1} of {submitting.total}…
                </>
              ) : (
                <>Submit {parsed.rows.length} audit{parsed.rows.length === 1 ? '' : 's'}</>
              )}
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={submitting !== null}
              className="text-xs px-3 py-2 rounded-md transition"
              style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ---------- STEP 3: running / done ---------- */}
      {batchIds && (
        <div>
          {/* Aggregate status row */}
          <div className="card p-5 mb-5">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {allDone ? 'All done.' : 'Running…'}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                  {counts.completed} done · {counts.processing} processing · {counts.queued} queued
                  {counts.failed > 0 && <span style={{ color: '#EF4444' }}> · {counts.failed} failed</span>}
                  {' · '}across {batchIds.length} batch{batchIds.length === 1 ? '' : 'es'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {allDone && counts.completed > 0 && (
                  <button
                    type="button"
                    onClick={() => void handleDownload()}
                    disabled={downloading}
                    className="btn-primary px-4 py-2 text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
                  >
                    {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    Download CSV
                  </button>
                )}
                {allDone && (
                  <button
                    type="button"
                    onClick={handleReset}
                    className="text-xs px-3 py-2 rounded-md"
                    style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                  >
                    Upload another
                  </button>
                )}
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface)' }}>
              <div
                className="h-full transition-all"
                style={{
                  width: counts.total > 0 ? `${((counts.completed + counts.failed) / counts.total) * 100}%` : '0%',
                  background: counts.failed > 0 ? '#F59E0B' : '#10B981',
                }}
              />
            </div>
          </div>

          {/* Per-row table */}
          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'var(--surface)' }}>
                    <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>Business</th>
                    <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>Status</th>
                    <th className="text-right px-3 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>Score</th>
                    <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(j => (
                    <tr key={j.job_id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td className="px-3 py-2">
                        <div style={{ color: 'var(--text-primary)' }}>{j.business_name}</div>
                        <div className="font-mono text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{j.website}</div>
                      </td>
                      <td className="px-3 py-2">
                        <StatusPill status={j.status} error={j.error} />
                      </td>
                      <td className="px-3 py-2 text-right font-mono" style={{ color: gradeColor(j.overall_score) }}>
                        {j.overall_score !== null ? `${j.overall_score} ${j.grade ? `· ${j.grade}` : ''}` : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {j.share_url ? (
                          <a
                            href={j.share_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs"
                            style={{ color: '#6366F1' }}
                          >
                            Open <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        Loading status…
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {allDone && counts.completed > 0 && (
            <div className="mt-5 p-4 rounded-md flex items-start gap-2" style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.3)' }}>
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#10B981' }} />
              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                The CSV download includes <strong>email</strong>, <strong>outreach_subject</strong>, and <strong>outreach_body</strong> columns — pre-written cold-email copy per row, ready to paste into Instantly, Smartlead, or your sender of choice.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusPill({ status, error }: { status: JobStatus; error: string | null }): React.ReactElement {
  const map: Record<JobStatus, { bg: string; fg: string; label: string }> = {
    queued: { bg: 'rgba(148,163,184,0.15)', fg: '#94A3B8', label: 'Queued' },
    processing: { bg: 'rgba(99,102,241,0.15)', fg: '#818CF8', label: 'Processing' },
    completed: { bg: 'rgba(16,185,129,0.15)', fg: '#10B981', label: 'Done' },
    failed: { bg: 'rgba(239,68,68,0.15)', fg: '#F87171', label: 'Failed' },
  };
  const m = map[status];
  return (
    <span
      title={status === 'failed' && error ? error : undefined}
      className="inline-flex items-center text-[10px] px-2 py-0.5 rounded font-medium uppercase tracking-wider"
      style={{ background: m.bg, color: m.fg }}
    >
      {status === 'processing' && <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />}
      {m.label}
    </span>
  );
}
