'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, CheckCircle, ArrowRight, Shield, FileText, Globe, Zap, AlertTriangle, Sparkles, Eye, Target, BarChart3 } from 'lucide-react';

const SCAN_STEPS = [
  { label: 'Checking robots.txt & crawler access' },
  { label: 'Parsing sitemap for key pages' },
  { label: 'Discovering product & pricing pages' },
  { label: 'Analyzing structured data & metadata' },
  { label: 'Evaluating commercial page clarity' },
  { label: 'Scoring trust & authority signals' },
  { label: 'Calculating your AI Visibility Score' },
];

export default function HomePage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scanStep, setScanStep] = useState(0);
  const router = useRouter();

  useEffect(() => {
    if (!loading) { setScanStep(0); return; }
    const interval = setInterval(() => {
      setScanStep((prev) => (prev < SCAN_STEPS.length - 1 ? prev + 1 : prev));
    }, 3500);
    return () => clearInterval(interval);
  }, [loading]);

  async function handleAudit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError('');
    setScanStep(0);
    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong.'); return; }
      router.push(`/audit/${data.auditId}`);
    } catch {
      setError('Could not connect. Please check the URL and try again.');
    } finally {
      setLoading(false);
    }
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
      {/* ===== DARK HERO ===== */}
      <section className="hero-dark relative">
        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
            {/* Left copy */}
            <div className="flex-1 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full mb-6 border" style={{ color: '#818CF8', borderColor: 'rgba(99,102,241,0.2)', background: 'rgba(99,102,241,0.08)' }}>
                <Sparkles className="w-3 h-3" />
                AI Visibility Audit for SaaS
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-[1.1] tracking-tight">
                Can AI find{' '}
                <span className="text-gradient">your site?</span>
              </h1>
              <p className="mt-5 text-base sm:text-lg max-w-lg leading-relaxed" style={{ color: '#94A3B8' }}>
                AI-powered search and assistants are reshaping discovery.
                Find out if your key pages are visible — and get a prioritized fix list.
              </p>

              {/* Audit form */}
              <form onSubmit={handleAudit} className="mt-8 max-w-md mx-auto lg:mx-0">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#64748B' }} />
                    <input
                      type="text"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="yoursite.com"
                      className="w-full pl-10 pr-4 py-3.5 input-field"
                      disabled={loading}
                    />
                  </div>
                  <button type="submit" disabled={loading || !url.trim()} className="px-6 py-3.5 btn-primary flex items-center gap-2 whitespace-nowrap">
                    {loading ? (
                      <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Scanning…</>
                    ) : (
                      <>Audit <ArrowRight className="w-4 h-4" /></>
                    )}
                  </button>
                </div>
                {error && (
                  <p className="mt-3 text-sm text-red-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0" />{error}
                  </p>
                )}
                {loading && (
                  <div className="mt-4 card-dark p-4">
                    <div className="space-y-2">
                      {SCAN_STEPS.map((step, i) => (
                        <div key={i} className={`flex items-center gap-2.5 text-sm transition-all duration-300 ${i < scanStep ? 'text-emerald-400' : i === scanStep ? 'text-indigo-300 font-medium' : 'text-slate-600'}`}>
                          {i < scanStep ? (
                            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : i === scanStep ? (
                            <svg className="animate-spin w-4 h-4 text-indigo-400 shrink-0" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                          ) : (
                            <div className="w-4 h-4 rounded-full border shrink-0" style={{ borderColor: '#1E293B' }} />
                          )}
                          <span>{step.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </form>
            </div>

            {/* Right: Demo score card */}
            <div className="flex-shrink-0 hidden lg:block anim-float">
              <div className="card-dark p-8 w-[300px]" style={{ boxShadow: '0 0 60px -10px rgba(99,102,241,0.15)' }}>
                <div className="flex items-center justify-between mb-6">
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748B' }}>Sample Report</p>
                  <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ color: '#818CF8', background: 'rgba(99,102,241,0.1)' }}>Live</span>
                </div>
                <div className="flex justify-center mb-6">
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
                <div className="space-y-3">
                  {[
                    { label: 'Crawlability', score: 92, color: '#10B981' },
                    { label: 'Readability', score: 68, color: '#F59E0B' },
                    { label: 'Commercial', score: 45, color: '#EF4444' },
                    { label: 'Trust', score: 78, color: '#10B981' },
                  ].map((cat) => (
                    <div key={cat.label} className="flex items-center gap-3">
                      <span className="text-xs w-20" style={{ color: '#64748B', fontFamily: 'var(--font-sans)' }}>{cat.label}</span>
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

      {/* ===== PROBLEM SECTION ===== */}
      <section className="py-20 sm:py-28" style={{ background: 'var(--bg)' }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#6366F1' }}>The Problem</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              AI is the new front door for buyers
            </h2>
            <p className="mt-4 text-lg max-w-2xl mx-auto leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              If your site isn&apos;t structured for AI crawlers and AI-powered search, you&apos;re invisible to a growing share of your market.
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-5">
            {[
              { icon: <Eye className="w-5 h-5" />, iconBg: '#FEE2E2', iconColor: '#EF4444', title: "AI can't find key pages", desc: 'Missing sitemaps, blocked crawlers, or poor structure means AI never indexes your pricing, product, or demo pages.' },
              { icon: <FileText className="w-5 h-5" />, iconBg: '#FEF3C7', iconColor: '#F59E0B', title: "Content isn't machine-readable", desc: 'Without structured data and semantic HTML, AI struggles to understand what your pages actually offer.' },
              { icon: <Target className="w-5 h-5" />, iconBg: '#E0E7FF', iconColor: '#6366F1', title: 'Competitors get recommended', desc: "When AI can't confidently reference your product, it recommends whoever has better-structured content." },
            ].map((item, i) => (
              <div key={i} className="card-glow p-6 anim-in" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ background: item.iconBg, color: item.iconColor }}>{item.icon}</div>
                <h3 className="font-semibold text-[15px]" style={{ color: 'var(--text-primary)' }}>{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{item.desc}</p>
              </div>
            ))}
          </div>
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
              { num: '01', icon: <Search className="w-5 h-5" style={{ color: '#6366F1' }} />, title: 'Enter your URL', desc: 'Paste your website URL. We discover key pages automatically from your homepage and sitemap.' },
              { num: '02', icon: <BarChart3 className="w-5 h-5" style={{ color: '#6366F1' }} />, title: 'We scan up to 50 pages', desc: 'We check robots.txt, sitemaps, metadata, structured data, page structure, and commercial clarity.' },
              { num: '03', icon: <Sparkles className="w-5 h-5" style={{ color: '#6366F1' }} />, title: 'Get your full report', desc: 'See your AI Visibility Score with category breakdowns and actionable, prioritized recommendations.' },
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

      {/* ===== WHAT WE CHECK ===== */}
      <section className="py-20 sm:py-28" style={{ background: 'var(--bg)' }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#6366F1' }}>What We Check</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Four pillars of AI visibility</h2>
            <p className="mt-4 max-w-2xl mx-auto" style={{ color: 'var(--text-secondary)' }}>Each pillar is scored independently so you know exactly where to focus.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            {[
              { icon: <Shield className="w-5 h-5" />, color: '#10B981', bg: '#ECFDF5', title: 'Crawlability', items: ['robots.txt configuration', 'XML sitemap coverage', 'AI crawler access (GPTBot, ClaudeBot)', 'Response codes & redirects'] },
              { icon: <FileText className="w-5 h-5" />, color: '#6366F1', bg: '#E0E7FF', title: 'Machine Readability', items: ['Title & meta description quality', 'JSON-LD structured data', 'Canonical tag consistency', 'Heading hierarchy & content depth'] },
              { icon: <Zap className="w-5 h-5" />, color: '#F59E0B', bg: '#FEF3C7', title: 'Commercial Clarity', items: ['Pricing page discoverability', 'Product page structure', 'Contact & demo conversion paths', 'Internal linking & navigation'] },
              { icon: <Globe className="w-5 h-5" />, color: '#EC4899', bg: '#FCE7F3', title: 'Trust & Authority', items: ['Organization schema markup', 'Content depth & authority', 'Resource/blog/docs presence', 'Page load performance'] },
            ].map((cat, i) => (
              <div key={i} className="card-glow p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: cat.bg, color: cat.color }}>{cat.icon}</div>
                  <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{cat.title}</h3>
                </div>
                <ul className="space-y-2.5">
                  {cat.items.map((item, j) => (
                    <li key={j} className="flex items-start gap-2.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: cat.color }} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== WHO ITS FOR ===== */}
      <section className="py-20 sm:py-28 border-y" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#6366F1' }}>Who It&apos;s For</span>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Built for B2B SaaS teams</h2>
          <p className="mt-4 text-lg max-w-2xl mx-auto leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Marketing leads, founders, and growth teams who need their site discoverable by AI-powered search and assistants.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-2.5">
            {['Cybersecurity', 'Dev Tools', 'Martech', 'HR Tech', 'Fintech', 'Analytics', 'Data Platforms', 'Infrastructure'].map((tag) => (
              <span key={tag} className="px-4 py-2 text-sm rounded-full border font-medium" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)', background: 'var(--surface)' }}>{tag}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ===== BOTTOM CTA ===== */}
      <section className="py-20 sm:py-28" style={{ background: 'var(--bg)' }}>
        <div className="max-w-lg mx-auto px-4 sm:px-6 text-center">
          <div className="card-glow p-8 sm:p-10" style={{ boxShadow: '0 0 40px -10px rgba(99,102,241,0.1)' }}>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Get your AI Visibility Score</h2>
            <p className="mt-3" style={{ color: 'var(--text-secondary)' }}>See how AI systems perceive your site. Takes about 30 seconds.</p>
            <form onSubmit={handleAudit} className="mt-6">
              <div className="flex gap-2">
                <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="yoursite.com" className="flex-1 px-4 py-3.5 input-light" disabled={loading} />
                <button type="submit" disabled={loading || !url.trim()} className="px-6 py-3.5 btn-primary flex items-center gap-2 whitespace-nowrap">
                  {loading ? 'Scanning…' : 'Audit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
