'use client';

// ============================================================
// SidePanel — slide-over drilldown primitive.
//
// Used everywhere a user wants to drill into details from the
// dashboard without losing context. Slides in from the right,
// dims the background lightly (so the dashboard is still
// readable behind), closes on Escape, click-outside, or X.
//
// Mobile: the panel takes full viewport width below 640px.
//
// Why hand-rolled instead of a library: the codebase has no
// existing dialog/sheet primitive (there's a one-off rescan
// modal in /site/[id]/page.tsx, that's it). Adding Radix or
// Headless UI for one component isn't worth the bundle weight.
// This is ~100 lines of TSX with no deps.
// ============================================================

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface SidePanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  // Optional width override. Default: max-w-2xl on desktop.
  widthClass?: string;
}

export default function SidePanel({
  open,
  onClose,
  title,
  subtitle,
  children,
  widthClass = 'sm:max-w-2xl',
}: SidePanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Lock body scroll while open. Saves the previous overflow value
  // so we don't clobber it if some parent already set one.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  // Focus the panel on open for keyboard users
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sidepanel-title"
    >
      {/* Scrim — light dim so the dashboard stays partly visible */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(0, 0, 0, 0.35)' }}
        onClick={onClose}
      />
      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`absolute right-0 top-0 h-full w-full ${widthClass} flex flex-col shadow-2xl outline-none animate-slidein`}
        style={{
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between gap-4 px-6 py-4 border-b shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="min-w-0 flex-1">
            <h2
              id="sidepanel-title"
              className="text-lg font-semibold truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              {title}
            </h2>
            {subtitle && (
              <p
                className="text-sm mt-0.5 truncate"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-black/5 transition-colors shrink-0"
            style={{ color: 'var(--text-secondary)' }}
            aria-label="Close panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>

      {/* Inline keyframes — keeps this self-contained, avoids
          polluting global CSS. */}
      <style jsx>{`
        @keyframes slidein {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
        .animate-slidein {
          animation: slidein 200ms cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </div>
  );
}
