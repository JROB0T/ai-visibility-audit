'use client';

const SEVERITY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  high: { bg: 'rgba(239,68,68,0.1)', text: '#EF4444', border: 'rgba(239,68,68,0.2)' },
  medium: { bg: 'rgba(245,158,11,0.1)', text: '#F59E0B', border: 'rgba(245,158,11,0.2)' },
  low: { bg: 'rgba(99,102,241,0.1)', text: '#6366F1', border: 'rgba(99,102,241,0.2)' },
};

const EFFORT_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  easy: { bg: 'rgba(16,185,129,0.1)', text: '#10B981', border: 'rgba(16,185,129,0.2)', label: 'Quick fix' },
  medium: { bg: 'rgba(245,158,11,0.1)', text: '#F59E0B', border: 'rgba(245,158,11,0.2)', label: 'Moderate' },
  harder: { bg: 'rgba(239,68,68,0.1)', text: '#EF4444', border: 'rgba(239,68,68,0.2)', label: 'Larger effort' },
};

export default function SeverityBadge({ severity }: { severity: string }) {
  const s = SEVERITY_STYLES[severity] || SEVERITY_STYLES.low;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold capitalize" style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}>
      {severity}
    </span>
  );
}

export function EffortBadge({ effort }: { effort: string }) {
  const e = EFFORT_STYLES[effort] || EFFORT_STYLES.medium;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium" style={{ background: e.bg, color: e.text, border: `1px solid ${e.border}` }}>
      {e.label}
    </span>
  );
}
