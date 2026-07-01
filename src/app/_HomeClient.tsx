'use client';

// ============================================================
// Homepage (client half) — positioning: AI visibility as the
// counterpart to SEO ("SEO gets you ranked. Aivascan gets you
// recommended."). Rendered by the thin server component in
// page.tsx, which owns the page metadata (canonical, OG, etc.)
// since a 'use client' file can't export `metadata`.
//
// Funnel note: the primary CTA goes to /free-scan (email-only,
// no account, no card) — NOT /auth/signup. The free sample is
// the top of the funnel; account creation happens after Stripe
// checkout. The hero domain input pre-fills /free-scan?url=...
//
// Market stats in the stat band are sourced (attribution in the
// fine print under the band). Revisit quarterly — these date.
// ============================================================

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, CheckCircle, ArrowRight, Shield, FileText, Sparkles, Eye, BarChart3, RefreshCw, TrendingDown, MessageSquare, MousePointerClick } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import RevenueAtRiskCalculator from '@/components/RevenueAtRiskCalculator';
import { SCAN_PROMPT_COUNT, FREE_SCAN_PROMPT_COUNT } from '@/lib/productConstants';

// FAQ content lives in one place so the visible section and the
// FAQPage JSON-LD can never drift apart.
const FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'What is AI visibility?',
    a: 'AI visibility is how often — and how favorably — AI assistants like ChatGPT, Claude, Perplexity, and Gemini mention or recommend your business when people ask buying questions. More buyers now start research in an AI chat instead of a search engine, so being invisible to AI means being invisible to those buyers.',
  },
  {
    q: 'Is this the same as SEO?',
    a: 'No — it\u2019s the counterpart to it. SEO optimizes your position in a list of links on a search results page. AI assistants don\u2019t show a list; they give an answer and name a few businesses. Aivascan measures whether you\u2019re one of the names, and what to change so you are. Strong SEO helps but doesn\u2019t guarantee AI visibility — the two should be managed side by side.',
  },
  {
    q: 'How does Aivascan measure my AI visibility?',
    a: 'We run real buyer-intent prompts (the questions your customers actually ask) through our AI engine — powered by Claude with live web search — and score how your business appears in the answers. You get an AI Visibility Score for how you show up in answers, plus a Site Readiness Score for whether your website is technically legible to AI crawlers — robots.txt access, structured data, llms.txt, and content clarity.',
  },
  {
    q: 'What do I get in a report?',
    a: 'Both scores, the actual AI answers we recorded, a competitor comparison showing who gets recommended in your place, and a prioritized 30/60/90-day fix plan with copy-paste code snippets. Paid plans refresh monthly so you can track movement.',
  },
  {
    q: 'Is the free scan really free?',
    a: `Yes. The free sample runs a ${FREE_SCAN_PROMPT_COUNT}-prompt scan and produces a 2-page summary report. It needs only your email — no account, no credit card. One free sample per email and per website.`,
  },
  {
    q: 'Who is Aivascan for?',
    a: 'Small and medium businesses, marketing leads, and agencies — anyone whose customers might ask an AI assistant "who should I use for X near me" or "what\u2019s the best tool for Y." If buyers research your category, AI is already answering for you or against you.',
  },
];

const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
};

export default function HomeClient() {
  const router = useRouter();

  // Logged-in users get bounced to their dashboard. We deliberately do
  // NOT gate the marketing content behind an auth-loading state: an early
  // return would leave the hero/value-prop out of the server-rendered HTML
  // (bad for crawlers/SEO). Instead the full page renders immediately and
  // an authenticated visitor is redirected client-side a moment later.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        router.push('/dashboard');
      }
    });
  }, [router]);

  // Hero domain input → /free-scan with the URL pre-filled.
  const [heroDomain, setHeroDomain] = useState('');
  function goToFreeScan(e: React.FormEvent) {
    e.preventDefault();
    const d = heroDomain.trim();
    router.push(d ? `/free-scan?url=${encodeURIComponent(d)}` : '/free-scan');
  }

  // Animated demo score
  const [demoScore, setDemoScore] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      let current = 0;
      const interval = setInterval(() => {
        current += 1;
        if (current > 72) { clearInterval(interval); return; }
        setDemoScore(current);
      }, 18);
      return () => clearInterval(interval);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  const scoreColor = demoScore >= 70 ? '#10B981' : demoScore >= 50 ? '#F59E0B' : '#EF4444';

  return (
    <div>
      {/* FAQPage structured data — mirrors the FAQ section below. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }}
      />

      {/* ===== HERO ===== */}
      <section className="hero-dark relative">
        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
            <div className="flex-1 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full mb-6 border" style={{ color: '#818CF8', borderColor: 'rgba(99,102,241,0.2)', background: 'rgba(99,102,241,0.08)' }}>
                <Sparkles className="w-3 h-3" />
                Aivascan · AI Visibility Audit
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-[1.1] tracking-tight">
                When buyers ask AI,{' '}
                <span className="text-gradient">does it say your name?</span>
              </h1>
              <p className="mt-5 text-base sm:text-lg max-w-lg leading-relaxed" style={{ color: '#94A3B8' }}>
                More buying research now starts in ChatGPT, Perplexity, and Claude than ever lands on page two of Google. Aivascan shows you exactly what AI says about your business — and what to fix so it recommends you.
              </p>
              <form onSubmit={goToFreeScan} className="mt-8 max-w-md mx-auto lg:mx-0 flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={heroDomain}
                  onChange={(e) => setHeroDomain(e.target.value)}
                  placeholder="yourwebsite.com"
                  aria-label="Your website"
                  className="flex-1 px-4 py-3.5 rounded-xl border text-sm outline-none"
                  style={{ background: 'rgba(15,23,42,0.6)', borderColor: 'rgba(148,163,184,0.25)', color: 'white' }}
                />
                <button type="submit" className="px-6 py-3.5 btn-primary flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium">
                  Get my free scan <ArrowRight className="w-4 h-4" />
                </button>
              </form>
              <p className="mt-3 text-xs" style={{ color: '#64748B' }}>
                Free {FREE_SCAN_PROMPT_COUNT}-prompt sample · No account · No credit card · ~60 seconds
              </p>
            </div>

            {/* Demo score card — mirrors the real paid report (WO2 Task 6):
                "AI Positioning Score" dial with letter grade, and cluster
                bars using the report's own cluster labels (Core / Problem /
                Comparison / Long-tail). Every label a prospect sees here
                appears verbatim in the deliverable. */}
            <div className="flex-shrink-0 hidden lg:block anim-float">
              <div className="card-dark p-8 w-[300px]" style={{ boxShadow: '0 0 60px -10px rgba(99,102,241,0.15)' }}>
                <div className="flex items-center justify-between mb-6">
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748B' }}>AI Positioning Score</p>
                  <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ color: '#818CF8', background: 'rgba(99,102,241,0.1)' }}>Live</span>
                </div>
                <div className="flex justify-center mb-2">
                  <svg width="140" height="140" viewBox="0 0 140 140">
                    <circle cx="70" cy="70" r="58" fill="none" stroke="#1E293B" strokeWidth="8"/>
                    <circle cx="70" cy="70" r="58" fill="none" stroke={scoreColor} strokeWidth="8" strokeLinecap="round"
                      strokeDasharray="364.4" strokeDashoffset={364.4 - (demoScore / 100) * 364.4}
                      transform="rotate(-90 70 70)"
                      style={{ transition: 'stroke-dashoffset 0.3s ease', filter: `drop-shadow(0 0 8px ${scoreColor}40)` }}
                    />
                    <text x="70" y="62" textAnchor="middle" fontSize="38" fontWeight="800" fill="white" fontFamily="var(--font-sans)">{demoScore}</text>
                    <text x="70" y="82" textAnchor="middle" fontSize="12" fill="#64748B" fontFamily="var(--font-sans)">/ 100</text>
                  </svg>
                </div>
                <p className="text-center text-xs font-mono mb-5" style={{ color: '#64748B' }}>
                  Grade C- · {SCAN_PROMPT_COUNT} prompts tested
                </p>
                <div className="space-y-3">
                  {[
                    { label: 'Core', score: 84, color: '#10B981' },
                    { label: 'Problem', score: 71, color: '#10B981' },
                    { label: 'Comparison', score: 48, color: '#EF4444' },
                    { label: 'Long-tail', score: 66, color: '#F59E0B' },
                  ].map((cat) => (
                    <div key={cat.label} className="flex items-center gap-3">
                      <span className="text-xs w-24" style={{ color: '#64748B', fontFamily: 'var(--font-sans)' }}>{cat.label}</span>
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#1E293B' }}>
                        <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${cat.score}%`, backgroundColor: cat.color, boxShadow: `0 0 6px ${cat.color}40` }} />
                      </div>
                      <span className="text-xs font-mono font-medium w-7 text-right" style={{ color: cat.color }}>{cat.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== WHY NOW — stat band ===== */}
      <section className="py-16 sm:py-20 border-b" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#6366F1' }}>Why Now</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Search is splitting in two</h2>
            <p className="mt-4 max-w-2xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
              Your customers haven&apos;t stopped searching — they&apos;ve started asking. And when AI answers, it names two or three businesses, not ten blue links.
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-5">
            {[
              { icon: <MessageSquare className="w-5 h-5" />, stat: '37%', desc: 'of consumers now start searches with an AI tool instead of a search engine' },
              { icon: <TrendingDown className="w-5 h-5" />, stat: '−25%', desc: 'projected decline in traditional search engine volume by 2026, per Gartner' },
              { icon: <MousePointerClick className="w-5 h-5" />, stat: '−58%', desc: 'drop in organic clicks for top-ranked pages when AI answers appear above them' },
            ].map((item, i) => (
              <div key={i} className="card-glow p-6 text-center">
                <div className="w-10 h-10 rounded-xl mx-auto flex items-center justify-center mb-4" style={{ background: 'rgba(99,102,241,0.08)', color: '#6366F1' }}>{item.icon}</div>
                <p className="text-4xl font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>{item.stat}</p>
                <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{item.desc}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Sources: Eight Oh Two consumer search survey (2026) · Gartner search volume forecast · Ahrefs 300,000-keyword study of AI Overviews and organic CTR (updated Dec 2025)
          </p>
          <div className="mt-12 max-w-4xl mx-auto">
            <RevenueAtRiskCalculator />
          </div>
        </div>
      </section>

      {/* ===== SEO vs Aivascan — positioning ===== */}
      <section className="py-20 sm:py-28" style={{ background: 'var(--bg)' }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#6366F1' }}>Alongside Your SEO</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              SEO gets you ranked.<br className="sm:hidden" /> Aivascan gets you recommended.
            </h2>
            <p className="mt-4 max-w-2xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
              They answer different questions about the same customer. You already manage one — Aivascan is how you manage the other.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-5 max-w-3xl mx-auto">
            <div className="card-glow p-6">
              <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--text-tertiary)' }}>Traditional SEO asks</p>
              <ul className="space-y-3.5">
                {[
                  'Where do I rank on the results page?',
                  'Which keywords drive my traffic?',
                  'How many people click through to my site?',
                  'Is Googlebot crawling me correctly?',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <Search className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card-glow p-6" style={{ borderColor: 'rgba(99,102,241,0.3)' }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: '#6366F1' }}>Aivascan asks</p>
              <ul className="space-y-3.5">
                {[
                  'When a buyer asks AI, am I in the answer?',
                  'What does AI actually say about me?',
                  'Which competitors get recommended instead?',
                  'Can AI crawlers read and understand my site?',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <Sparkles className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#6366F1' }} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
            Ranking #1 doesn&apos;t guarantee AI mentions you — and an AI can recommend a business that ranks on page three.{' '}
            <a href="/ai-visibility-vs-seo" className="font-medium underline underline-offset-2" style={{ color: '#6366F1' }}>
              How AI visibility differs from SEO →
            </a>
          </p>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className="py-20 sm:py-28 border-y" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#6366F1' }}>How It Works</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Three steps to clarity</h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-10">
            {[
              { num: '01', icon: <Search className="w-5 h-5" style={{ color: '#6366F1' }} />, title: 'Enter your site', desc: 'Type your domain. We automatically discover your key pages from your homepage and sitemap.' },
              { num: '02', icon: <BarChart3 className="w-5 h-5" style={{ color: '#6366F1' }} />, title: 'We scan how AI sees you', desc: 'We ask AI assistants real buyer-intent questions about your category and record exactly how they answer.' },
              { num: '03', icon: <Sparkles className="w-5 h-5" style={{ color: '#6366F1' }} />, title: 'Get your visibility report', desc: 'See your AI Visibility Score with plain-English explanations and a prioritized fix plan.' },
            ].map((item, i) => (
              <div key={i} className="text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.08)' }}>{item.icon}</div>
                  <span className="text-xs font-mono font-bold" style={{ color: 'var(--text-tertiary)' }}>{item.num}</span>
                </div>
                <h3 className="font-semibold text-[15px]" style={{ color: 'var(--text-primary)' }}>{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== WHAT YOU GET ===== */}
      <section className="py-20 sm:py-28" style={{ background: 'var(--bg)' }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#6366F1' }}>What You Get</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Everything you need to get found by AI</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            {[
              { icon: <Eye className="w-5 h-5" />, color: '#6366F1', bg: '#E0E7FF', title: 'AI Perception Check', desc: 'Can AI accurately answer questions about your business? We run real buyer-intent prompts through an AI engine with live web search and record exactly how it answers — the same way assistants like ChatGPT, Claude, and Perplexity build their responses.' },
              { icon: <Shield className="w-5 h-5" />, color: '#10B981', bg: '#ECFDF5', title: 'Competitive Benchmark', desc: 'See how your AI visibility compares to your competitors. Know where you stand and where to focus.' },
              { icon: <FileText className="w-5 h-5" />, color: '#F59E0B', bg: '#FEF3C7', title: 'Fix Plans with Code', desc: 'Get copy-paste code snippets and content recommendations. No guesswork — just implement the fixes.' },
              { icon: <RefreshCw className="w-5 h-5" />, color: '#EC4899', bg: '#FCE7F3', title: 'Monthly Monitoring', desc: 'Track your progress over time. Get monthly rescans with change detection and new action items.' },
            ].map((item, i) => (
              <div key={i} className="card-glow p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: item.bg, color: item.color }}>{item.icon}</div>
                  <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{item.title}</h3>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PRICING ===== */}
      <section className="py-20 sm:py-28 border-y" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#6366F1' }}>Pricing</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Simple, transparent pricing</h2>
            <p className="mt-4 max-w-xl mx-auto" style={{ color: 'var(--text-secondary)' }}>Start free. Upgrade when you&apos;re ready to get the full picture.</p>
          </div>
          {/* Two tiers post-launch: Free Sample (email-gated) and Monthly
              ($29.99/mo). One-time tier retired 2026-05-21. Prices here
              are hardcoded — the /pricing page reads the same values
              from env vars at request time; if those env vars change,
              update these two numbers too. */}
          <div className="grid sm:grid-cols-2 gap-5 max-w-3xl mx-auto">
            {/* Free Sample */}
            <div className="card-glow p-6 flex flex-col">
              <div className="mb-4">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-tertiary)' }}>Free Sample</p>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold" style={{ color: 'var(--text-primary)' }}>$0</span>
                </div>
              </div>
              <ul className="space-y-3 mb-6 flex-1">
                {[`${FREE_SCAN_PROMPT_COUNT}-prompt AI visibility scan`, '2-page summary report', 'Cluster heatmap', 'One example weak prompt', 'One free per email + site'].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#10B981' }} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <a href="/free-scan" className="w-full py-2.5 rounded-lg border text-sm font-medium text-center transition-colors" style={{ color: '#6366F1', borderColor: 'rgba(99,102,241,0.3)' }}>
                Get free sample
              </a>
            </div>

            {/* Monthly */}
            <div className="card-glow p-6 flex flex-col relative" style={{ borderColor: 'rgba(99,102,241,0.3)', boxShadow: '0 0 30px -10px rgba(99,102,241,0.2)' }}>
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ color: 'white', background: '#6366F1' }}>Most Popular</span>
              </div>
              <div className="mb-4">
                <p className="text-sm font-semibold" style={{ color: '#6366F1' }}>Monthly</p>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold" style={{ color: 'var(--text-primary)' }}>$29.99</span>
                  <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>/month</span>
                </div>
              </div>
              <ul className="space-y-3 mb-6 flex-1">
                {[`${SCAN_PROMPT_COUNT}-prompt AI visibility scan`, 'Full strategic report', 'Competitor analysis', '30/60/90 plan', 'Refreshed monthly', 'Cancel anytime'].map((item, i) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm" style={{ color: i === 0 ? 'var(--text-tertiary)' : 'var(--text-secondary)' }}>
                    <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#6366F1' }} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <a href="/pricing" className="w-full py-2.5 btn-primary rounded-lg text-sm font-medium text-center">
                Subscribe
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ===== WHO ITS FOR ===== */}
      <section className="py-20 sm:py-28" style={{ background: 'var(--bg)' }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#6366F1' }}>Who It&apos;s For</span>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Built for businesses that want to be found</h2>
          <p className="mt-4 text-lg max-w-2xl mx-auto leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Business owners, marketing leads, and growth teams who want their site discoverable by AI-powered search and assistants.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-2.5">
            {['Local Services', 'Professional Services', 'SaaS', 'E-commerce', 'Healthcare', 'Law Firms', 'Agencies', 'Consulting'].map((tag) => (
              <span key={tag} className="px-4 py-2 text-sm rounded-full border font-medium" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)', background: 'var(--surface)' }}>{tag}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section className="py-20 sm:py-28 border-t" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#6366F1' }}>FAQ</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Common questions</h2>
          </div>
          <div className="space-y-3">
            {FAQS.map((f) => (
              <details key={f.q} className="card-glow p-5 group">
                <summary className="cursor-pointer list-none flex items-center justify-between gap-4 font-semibold text-[15px]" style={{ color: 'var(--text-primary)' }}>
                  {f.q}
                  <span className="text-lg leading-none transition-transform group-open:rotate-45" style={{ color: '#6366F1' }}>+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ===== BOTTOM CTA ===== */}
      <section className="py-20 sm:py-28 border-t" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
        <div className="max-w-lg mx-auto px-4 sm:px-6 text-center">
          <div className="card-glow p-8 sm:p-10" style={{ boxShadow: '0 0 40px -10px rgba(99,102,241,0.1)' }}>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Ready to see what AI says about your business?</h2>
            <p className="mt-3" style={{ color: 'var(--text-secondary)' }}>Get your free sample report in about a minute. No account, no card.</p>
            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
              <a href="/free-scan" className="px-6 py-3.5 btn-primary flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium">
                Get my free scan <ArrowRight className="w-4 h-4" />
              </a>
              <a href="/auth/login" className="px-6 py-3.5 rounded-xl border text-sm font-medium flex items-center justify-center gap-2 whitespace-nowrap transition-colors" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}>
                Sign In
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
