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

// Title has no "— Aivascan": the root layout's `%s · Aivascan`
// template supplies the brand suffix. Description avoids a dollar
// amount so env-driven price changes can't make it stale.
export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Start with a free 2-page sample report. Upgrade to the full strategic report with competitor analysis and a 30/60/90 fix plan, refreshed monthly. Cancel anytime.',
  alternates: { canonical: '/pricing' },
  openGraph: {
    title: 'Pricing · Aivascan',
    description:
      'Free sample report, or a full strategic report with competitor analysis and a 30/60/90 fix plan, refreshed monthly. Cancel anytime.',
    type: 'website',
    siteName: 'Aivascan',
    url: '/pricing',
  },
  twitter: {
    card: 'summary',
    title: 'Pricing · Aivascan',
    description:
      'Free sample report, or a full strategic report with competitor analysis and a 30/60/90 fix plan, refreshed monthly. Cancel anytime.',
  },
};

// Prices are read from env at request time so they stay current
// without a redeploy. Force dynamic rendering.
export const dynamic = 'force-dynamic';

export default function PricingPage(): React.ReactElement {
  const pricing = getDisplayPricing();

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 sm:py-20">
      {/* ===== Hero ===== */}
      <header className="text-center mb-12 sm:mb-16">
        <h1 className="text-3xl sm:text-4xl font-bold mb-4 tracking-tight" style={{ color: 'var(--text-primary)' }}>
          See how AI describes your business — and what to do about it.
        </h1>
        <p className="text-base max-w-2xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
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
            className="block w-full py-2.5 rounded-lg text-sm font-medium text-center transition"
            style={{
              background: 'transparent',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
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
          <p className="mt-3 text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
            By subscribing you authorize Aivascan to charge your card{' '}
            {formatDollars(pricing.tier_1.monthly)}/month automatically until
            you cancel. Cancel anytime from your Account page.
          </p>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
            Agency or multi-site? Email{' '}
            <a href="mailto:team@aivascan.com" className="underline">team@aivascan.com</a>
            {' '}— multi-site plans available.
          </p>
        </PlanCard>
      </div>

      {/* ===== Footnotes ===== */}
      <div className="text-center mt-12 text-xs" style={{ color: 'var(--text-tertiary)' }}>
        <p className="mb-2">
          All payments run through Stripe. Reports run on Claude AI with live web search.
        </p>
        <p>Questions? Reply to your free-sample email or write to us directly.</p>
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
  // Highlighted card uses the indigo brand accent as a glow + border
  // tint; the body itself stays on `--surface` so it reads correctly
  // in both light and dark mode. (Previously this card forced white
  // background which inverted in dark mode and clashed in light mode.)
  return (
    <div
      className="card p-6 sm:p-7 flex flex-col"
      style={
        props.highlight
          ? {
              borderColor: 'var(--accent)',
              boxShadow: '0 0 0 1px var(--accent-glow), 0 8px 32px var(--accent-glow)',
            }
          : undefined
      }
    >
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{props.name}</h2>
        {props.badge && (
          <span
            className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold"
            style={{
              background: props.highlight ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: props.highlight ? '#fff' : 'var(--text-secondary)',
            }}
          >
            {props.badge}
          </span>
        )}
      </div>

      <div className="mt-4 mb-1">
        <span className="text-3xl sm:text-4xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          {props.priceLine}
        </span>
      </div>
      <p className="text-xs mb-6" style={{ color: 'var(--text-tertiary)' }}>
        {props.priceSub}
      </p>

      <ul className="space-y-2 mb-6 flex-1">
        {props.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm">
            <CheckCircle2
              className="w-4 h-4 mt-0.5 shrink-0"
              style={{ color: props.highlight ? 'var(--accent)' : '#10B981' }}
            />
            <span style={{ color: 'var(--text-secondary)' }}>{f}</span>
          </li>
        ))}
      </ul>

      <div>{props.children}</div>
    </div>
  );
}
