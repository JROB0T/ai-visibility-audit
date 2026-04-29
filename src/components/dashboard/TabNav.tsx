'use client';

export type DashboardTabId =
  | 'overview'
  | 'findings'
  | 'priorities'
  | 'competitors'
  | 'trends'
  | 'readiness';

interface TabDef {
  id: DashboardTabId;
  label: string;
}

const TABS: TabDef[] = [
  { id: 'overview',    label: 'Overview' },
  { id: 'findings',    label: 'Findings' },
  { id: 'priorities',  label: 'Priorities' },
  { id: 'competitors', label: 'Competitors' },
  { id: 'trends',      label: 'Trends' },
  { id: 'readiness',   label: 'Site Readiness' },
];

interface TabNavProps {
  active: DashboardTabId;
  onChange: (id: DashboardTabId) => void;
}

export default function TabNav({ active, onChange }: TabNavProps): React.ReactElement {
  return (
    <nav className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Dashboard sections">
      {TABS.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            className="px-3 py-2.5 text-sm font-medium whitespace-nowrap relative transition"
            style={{
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            {t.label}
            {isActive && (
              <span
                className="absolute left-0 right-0 -bottom-px h-0.5 rounded-t"
                style={{ background: 'var(--accent)' }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
