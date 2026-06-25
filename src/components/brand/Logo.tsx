// ============================================================
// <Logo /> — AIVA brand mark, in code.
//
// Single source of truth for the icon. Inline SVG (no HTTP
// request, scales perfectly, themeable). The geometry matches
// /public/brand/aiva-logo-primary.svg exactly — any change here
// must be mirrored there (and in the favicon files in src/app/).
//
// Variants:
//   "squircle"  → indigo gradient background, white mark (default)
//   "flat"      → transparent background, indigo mark (for white surfaces)
//   "white"     → transparent background, white mark (for dark surfaces)
//   "black"     → transparent background, near-black mark (for print/light)
//
// Sizes are pixels; the SVG keeps its viewBox so quality holds at
// any size. The component is presentational only — wrap in <a> or
// <Link> at the call site if it should navigate.
// ============================================================

import React from 'react';

type LogoVariant = 'squircle' | 'flat' | 'white' | 'black';

interface LogoProps {
  size?: number;
  variant?: LogoVariant;
  className?: string;
  title?: string;
}

export default function Logo({
  size = 32,
  variant = 'squircle',
  className,
  title = 'AIVA',
}: LogoProps): React.ReactElement {
  // Per-instance gradient id so multiple Logos on one page don't collide.
  const gradId = React.useId();

  const isSquircle = variant === 'squircle';
  const stroke =
    variant === 'flat' ? '#6366F1'
    : variant === 'black' ? '#0F172A'
    : '#FFFFFF';
  // Arc opacity matches the master SVG.
  const arcOpacity = isSquircle ? 0.62 : 0.55;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={title}
    >
      {isSquircle && (
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#818CF8" />
            <stop offset="100%" stopColor="#4F46E5" />
          </linearGradient>
        </defs>
      )}
      {isSquircle && (
        <rect width="512" height="512" rx="115" ry="115" fill={`url(#${gradId})`} />
      )}
      {/* Score arc — 76% of circle, gap at top.
          Numbers below match the master SVG exactly. */}
      <circle
        cx="256" cy="264" r="188"
        fill="none" stroke={stroke} strokeWidth="18" strokeLinecap="round"
        opacity={arcOpacity}
        strokeDasharray="897.7 285.7"
        transform="rotate(-90 256 264)"
      />
      {/* A — two legs meeting at the apex */}
      <path
        d="M 178 372 L 256 152 L 334 372"
        fill="none" stroke={stroke} strokeWidth="38"
        strokeLinecap="round" strokeLinejoin="round"
      />
      {/* Crossbar — inset from the legs */}
      <path
        d="M 219.6 304 L 292.4 304"
        fill="none" stroke={stroke} strokeWidth="38"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Lockup: mark + the visible brand string "Aivascan", horizontal.
// Use in headers and email signatures where both should appear together.
export function LogoLockup({
  size = 28,
  variant = 'squircle',
  brandColor,
}: {
  size?: number;
  variant?: LogoVariant;
  brandColor?: string;
}): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Logo size={size} variant={variant} />
      <span
        className="font-semibold tracking-tight"
        style={{
          fontSize: Math.round(size * 0.5),
          color: brandColor ?? 'var(--text-primary)',
        }}
      >
        Aivascan
      </span>
    </span>
  );
}
