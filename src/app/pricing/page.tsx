// ============================================================
// /pricing — public pricing page
//
// Renders Free + Tier 1 Monthly. Tier 1 one-time was retired
// 2026-05-21; SKU stays valid for existing customers but is hidden
// from the UI. Tier 2 is intentionally hidden until spec 2 ships.
//
// Server component: prices come from env vars at request time. To
// change a price, update the PRICE_TIER_*_DOLLARS env var in Vercel
// AND the matching Stripe product. No code change required.
// ============================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { getDisplayPricing, formatDollars } from '@/lib/pricing';
import BuyButton from './_BuyButton';

export const metadata: Metadata = {
  title: 'Pricing — Aivascan',
  description:
    'Simple pricing for AI-visibility audits. Start with a free sample report, or get the full strategic report with a monthly plan that re-scans automatically.',
  openGraph: {
    title: 'Aivascan Pricing — AI Visibility Audits',
    description:
      'Free sample report, or a full strategic report refreshed monthly. See how AI assistants describe your business.',
    type: 'website',
    siteName: 'Aivascan',
  },
};

// Prices are read from env at request time so they stay current
// without a redeploy. Force dynamic rendering.
export const dynamic = 'force-dynamic';

export default function PricingPage(): React.ReactElement {
  const pricing = getDisplayPricing();

  return (
    <div
      className="min-h-screen px-4 py-12 sm:py-20"
      style={{ background: 'var(--background, #0a0a0a)', color: 'var(--text-primary, #fff)' }}
    >
      <div className="max-w-5xl mx-auto">
        {/* ===== Hero ===== */}
        <header className="text-center mb-12 sm:mb-16">
          <h1
            className="text-3xl sm:text-4xl font-semibold mb-4"
            style={{ fontFamily: 'Georgia, serif', fontWeight: 400 }}
          >
            See how AI describes your business — and what to do about it.
          </h1>
          <p className="text-base max-w-2xl mx-auto" style={{ color: 'var(--text-secondary, #aaa)' }}>
            Start with a free 2-page sample. Upgrade for the full strategic report and a 30/60/90 plan.
          </p>
        </header>

        {/* ===== Cards ===== */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl mx-auto">
          {/* Free */}
          <PlanCard
            name="Free Sample"
            priceLine="$0"
            priceSub="One free per email + per site"
            features={[
              '6-prompt AI visibility scan',
              '2-page summary report',
              'Cluster heatmap',
              'One example weak prompt',
            ]}
          >
            <Link
              href="/free-scan"
              className="block w-full py-2.5 rounded-md text-sm font-medium text-center transition"
              style={{
                background: 'transparent',
                color: 'var(--text-primary, #fff)',
                border: '1px solid var(--border, #2a2a2a)',
              }}
            >
              Get free sample
            </Link>
          </PlanCard>

          {/* Tier 1 monthly — highlighted as recommended */}
          <PlanCard
            name="Monthly"
            badge="Most popular"
            highlight
            priceLine={formatDollars(pricing.tier_1.monthly)}
            priceSub="per month"
            features={[
              '18-prompt AI visibility scan',
              'Full strategic report',
              'Competitor analysis',
              '30/60/90 plan',
              'Refreshed monthly',
              'Cancel anytime',
            ]}
          >
            <BuyButton sku="tier_1_monthly" label="Subscribe" variant="primary" />
            {/* Auto-renewal disclosure — must be visible at the point of
                subscribe (auto-renewal laws), not only in Terms. Price comes
                from the env-driven pricing source, never a literal. */}
            <p className="mt-3 text-xs leading-relaxed" style={{ color: 'var(--text-tertiary, #888)' }}>
              By subscribing you authorize Aivascan to charge your card{' '}
              {formatDollars(pricing.tier_1.monthly)}/month automatically until
              you cancel. Cancel anytime from your Account page.
            </p>
          </PlanCard>

          {/* The one-time tier was retired on 2026-05-21. Stripe products
              for `tier_1_one_time` still exist in env so existing
              one-time customers continue to webhook through cleanly,
              and the SKU stays valid in /api/checkout/tier — but the
              UI no longer offers it for new purchase. */}
        </div>

        {/* ===== Footnotes ===== */}
        <div className="text-center mt-12 text-xs" style={{ color: 'var(--text-tertiary, #888)' }}>
          <p className="mb-2">
            All payments run through Stripe. Reports run on Claude AI with live web search.
          </p>
          <p>Questions? Reply to your free-sample email or write to us directly.</p>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// PlanCard — local presentational helper. Children slot is the CTA.
// ------------------------------------------------------------

interface PlanCardProps {
  name: string;
  badge?: string;
  highlight?: boolean;
  priceLine: string;
  priceSub: string;
  features: string[];
  children: React.ReactNode;
}

function PlanCard(props: PlanCardProps): React.ReactElement {
  return (
    <div
      className="rounded-xl p-6 sm:p-7 flex flex-col"
      style={{
        background: props.highlight ? '#ffffff' : 'var(--bg-secondary, #111)',
        color: props.highlight ? '#0a0a0a' : 'inherit',
        border: '1px solid',
        borderColor: props.highlight ? '#ffffff' : 'var(--border, #2a2a2a)',
        boxShadow: props.highlight ? '0 8px 32px rgba(255,255,255,0.08)' : 'none',
      }}
    >
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold">{props.name}</h2>
        {props.badge && (
          <span
            className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full"
            style={{
              background: props.highlight ? '#0a0a0a' : 'rgba(255,255,255,0.08)',
              color: props.highlight ? '#fff' : 'var(--text-secondary, #aaa)',
            }}
          >
            {props.badge}
          </span>
        )}
      </div>

      <div className="mt-4 mb-1">
        <span
          className="text-3xl sm:text-4xl font-semibold"
          style={{ fontFamily: 'Georgia, serif', fontWeight: 500 }}
        >
          {props.priceLine}
        </span>
      </div>
      <p
        className="text-xs mb-6"
        style={{ color: props.highlight ? '#555' : 'var(--text-tertiary, #888)' }}
      >
        {props.priceSub}
      </p>

      <ul className="space-y-2 mb-6 flex-1">
        {props.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm">
            <CheckCircle2
              className="w-4 h-4 mt-0.5 shrink-0"
              style={{ color: props.highlight ? '#0a0a0a' : '#10b981' }}
            />
            <span style={{ color: props.highlight ? '#1a1a1a' : 'var(--text-secondary, #ccc)' }}>{f}</span>
          </li>
        ))}
      </ul>

      <div>{props.children}</div>
    </div>
  );
}
