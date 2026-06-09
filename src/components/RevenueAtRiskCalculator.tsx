'use client';

// ============================================================
// RevenueAtRiskCalculator — interactive homepage widget.
//
// Makes AI invisibility concrete: the visitor enters their own
// average sale and monthly customer volume, and we show how much
// revenue flows through AI-assisted buying decisions at the
// current ~37% AI-first research rate (same sourced figure as the
// stat band above it; the share is user-adjustable).
//
// Honesty guardrails: the math is shown, every input is the
// user's own, the AI-share slider is editable, and the output is
// labeled an estimate of revenue *influenced* by AI answers — we
// do not claim they're losing this money today.
// ============================================================

import { useMemo, useState } from 'react';
import { ArrowRight, Calculator } from 'lucide-react';

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `$${Math.round(n / 1000)}K`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

export default function RevenueAtRiskCalculator(): React.ReactElement {
  const [avgSale, setAvgSale] = useState(450);
  const [monthlyCustomers, setMonthlyCustomers] = useState(25);
  const [aiShare, setAiShare] = useState(37);

  const { monthly, yearly } = useMemo(() => {
    const m = avgSale * monthlyCustomers * (aiShare / 100);
    return { monthly: m, yearly: m * 12 };
  }, [avgSale, monthlyCustomers, aiShare]);

  return (
    <div className="card-glow p-6 sm:p-8" style={{ boxShadow: '0 0 40px -10px rgba(99,102,241,0.12)' }}>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366F1' }}>
          <Calculator className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>What does invisibility cost you?</h3>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Use your own numbers — takes ten seconds</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-8 items-center">
        {/* Inputs */}
        <div className="space-y-5">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Average sale / customer value</label>
              <span className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>${avgSale.toLocaleString()}</span>
            </div>
            <input
              type="range" min={50} max={10000} step={50} value={avgSale}
              onChange={(e) => setAvgSale(Number(e.target.value))}
              className="w-full accent-indigo-500"
              aria-label="Average sale value in dollars"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>New customers per month</label>
              <span className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{monthlyCustomers}</span>
            </div>
            <input
              type="range" min={1} max={500} step={1} value={monthlyCustomers}
              onChange={(e) => setMonthlyCustomers(Number(e.target.value))}
              className="w-full accent-indigo-500"
              aria-label="New customers per month"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Buyers researching with AI</label>
              <span className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{aiShare}%</span>
            </div>
            <input
              type="range" min={5} max={80} step={1} value={aiShare}
              onChange={(e) => setAiShare(Number(e.target.value))}
              className="w-full accent-indigo-500"
              aria-label="Percent of buyers researching with AI"
            />
            <p className="mt-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
              37% of consumers now start searches with an AI tool — adjust for your market.
            </p>
          </div>
        </div>

        {/* Output */}
        <div className="text-center sm:text-left rounded-xl p-6" style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#6366F1' }}>Revenue influenced by AI answers</p>
          <p className="mt-3 text-4xl sm:text-5xl font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            {formatMoney(monthly)}<span className="text-lg font-semibold" style={{ color: 'var(--text-tertiary)' }}>/mo</span>
          </p>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            ≈ {formatMoney(yearly)} a year decided where AI does the recommending
          </p>
          <p className="mt-3 text-[11px] leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
            Estimate: {monthlyCustomers} customers × ${avgSale.toLocaleString()} × {aiShare}%. If AI doesn&apos;t recommend you, this is the slice your competitors are pitching for.
          </p>
          <a href="/free-scan" className="mt-5 inline-flex px-5 py-3 btn-primary items-center justify-center gap-2 text-sm font-medium">
            Find out if AI recommends you <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
