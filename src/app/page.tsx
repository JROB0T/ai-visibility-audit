'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, CheckCircle, AlertTriangle, ArrowRight, Shield, FileText, Globe, Zap, Sparkles, Eye, BarChart3, Target } from 'lucide-react';

const SCAN_STEPS = [
  { label: 'Checking robots.txt', icon: '🤖' },
  { label: 'Parsing sitemap', icon: '🗺️' },
  { label: 'Discovering key pages', icon: '🔍' },
  { label: 'Analyzing page structure', icon: '📄' },
  { label: 'Checking structured data', icon: '🏗️' },
  { label: 'Evaluating commercial clarity', icon: '💼' },
  { label: 'Calculating your score', icon: '📊' },
];

export default function HomePage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scanStep, setScanStep] = useState(0);
  const router = useRouter();

  // Animate through scan steps while loading
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

  // Animated demo score for hero
  const [demoScore, setDemoScore] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      let current = 0;
      const interval = setInterval(() => {
        current += 2;
        if (current > 72) { clearInterval(interval); return; }
        setDemoScore(current);
      }, 20);
      return () => clearInterval(interval);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div>
      {/* Hero */}
      <section className="hero-gradient border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
            {/* Left: Copy */}
            <div className="flex-1 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-xs font-semibold px-3.5 py-1.5 rounded-full mb-6 border border-blue-100">
                <Sparkles className="w-3.5 h-3.5" />
                AI Visibility Audit for SaaS
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-[52px] font-bold text-gray-900 leading-[1.15] tracking-tight" style={{ fontFamily: 'var(--font-heading)' }}>
                Can AI systems find{' '}
                <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  your key pages?
                </span>
              </h1>
              <p className="mt-5 text-lg text-gray-500 max-w-lg leading-relaxed">
                AI search and assistants are reshaping how buyers discover software.
                Find out if your site is ready — and get a prioritized fix list.
              </p>

              {/* Audit form */}
              <form onSubmit={handleAudit} className="mt-8 max-w-md mx-auto lg:mx-0">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="yoursite.com"
                      className="w-full pl-10 pr-4 py-3.5 input-premium text-[15px]"
                      disabled={loading}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading || !url.trim()}
                    className="px-6 py-3.5 btn-primary flex items-center gap-2 whitespace-nowrap text-[15px]"
                  >
                    {loading ? (
                      <>
                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Scanning…
                      </>
                    ) : (
                      <>Run Audit <ArrowRight className="w-4 h-4" /></>
                    )}
                  </button>
                </div>
                {error && (
                  <p className="mt-3 text-sm text-red-600 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {error}
                  </p>
                )}
                {/* Scanning progress */}
                {loading && (
                  <div className="mt-4 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                    <div className="space-y-2">
                      {SCAN_STEPS.map((step, i) => (
                        <div key={i} className={`flex items-center gap-2.5 text-sm transition-all duration-300 ${
                          i < scanStep ? 'text-green-600' :
                          i === scanStep ? 'text-blue-700 font-medium' :
                          'text-gray-300'
                        }`}>
                          {i < scanStep ? (
                            <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                          ) : i === scanStep ? (
                            <svg className="animate-spin w-4 h-4 text-blue-600 shrink-0" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          ) : (
                            <div className="w-4 h-4 rounded-full border border-gray-200 shrink-0" />
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
            <div className="flex-shrink-0 hidden lg:block">
              <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-lg shadow-gray-200/50 w-[280px]">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Sample Score</p>
                <div className="flex justify-center mb-5">
                  <svg width="140" height="140" viewBox="0 0 140 140">
                    <circle cx="70" cy="70" r="58" fill="none" stroke="#F1F5F9" strokeWidth="10"/>
                    <circle cx="70" cy="70" r="58" fill="none" stroke="#34D399" strokeWidth="10" strokeLinecap="round"
                      strokeDasharray="364.4" strokeDashoffset={364.4 - (demoScore / 100) * 364.4}
                      transform="rotate(-90 70 70)"
                      style={{ transition: 'stroke-dashoffset 0.3s ease' }}
                    />
                    <text x="70" y="64" textAnchor="middle" fontSize="36" fontWeight="700" fill="#0F172A" fontFamily="var(--font-heading)">{demoScore}</text>
                    <text x="70" y="84" textAnchor="middle" fontSize="13" fill="#94A3B8" fontFamily="var(--font-body)">/ 100</text>
                  </svg>
                </div>
                <div className="space-y-2.5">
                  {[
                    { label: 'Crawlability', score: 85, color: '#10B981' },
                    { label: 'Readability', score: 68, color: '#34D399' },
                    { label: 'Commercial', score: 75, color: '#34D399' },
                    { label: 'Trust', score: 55, color: '#F59E0B' },
                  ].map((cat) => (
                    <div key={cat.label} className="flex items-center gap-2.5">
                      <span className="text-xs text-gray-500 w-20">{cat.label}</span>
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${cat.score}%`, backgroundColor: cat.color }} />
                      </div>
                      <span className="text-xs font-semibold w-6 text-right" style={{ color: cat.color }}>{cat.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="py-20 sm:py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-3">The Problem</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight" style={{ fontFamily: 'var(--font-heading)' }}>
              AI is changing how buyers find software
            </h2>
            <p className="mt-4 text-gray-500 max-w-2xl mx-auto text-lg leading-relaxed">
              If your site isn&apos;t structured for AI crawlers and AI-powered search, you&apos;re invisible to a growing share of your market.
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-5">
            {[
              {
                icon: <Eye className="w-5 h-5" />,
                color: 'text-red-500 bg-red-50',
                title: 'AI can\'t find key pages',
                desc: 'Missing sitemaps, blocked crawlers, or poor structure means AI never indexes your pricing, product, or demo pages.',
              },
              {
                icon: <FileText className="w-5 h-5" />,
                color: 'text-amber-600 bg-amber-50',
                title: 'Content isn\'t machine-readable',
                desc: 'Without structured data, metadata, and semantic HTML, AI struggles to understand what your pages offer.',
              },
              {
                icon: <Target className="w-5 h-5" />,
                color: 'text-indigo-500 bg-indigo-50',
                title: 'Competitors get recommended',
                desc: 'When AI can\'t confidently reference you, it recommends whoever has better-structured content.',
              },
            ].map((item, i) => (
              <div key={i} className={`card-elevated p-6 animate-fade-in animate-delay-${i + 1}`}>
                <div className={`w-10 h-10 rounded-xl ${item.color} flex items-center justify-center mb-4`}>
                  {item.icon}
                </div>
                <h3 className="font-semibold text-gray-900 text-[15px]">{item.title}</h3>
                <p className="mt-2 text-sm text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 sm:py-24 bg-white border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-3">How It Works</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight" style={{ fontFamily: 'var(--font-heading)' }}>
              Three steps to clarity
            </h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-10">
            {[
              {
                step: '01',
                title: 'Enter your URL',
                desc: 'Paste your website URL. We discover your key pages automatically from your homepage and sitemap.',
                icon: <Search className="w-5 h-5 text-blue-600" />,
              },
              {
                step: '02',
                title: 'We scan up to 50 pages',
                desc: 'We check robots.txt, sitemaps, metadata, structured data, page structure, and commercial clarity.',
                icon: <BarChart3 className="w-5 h-5 text-blue-600" />,
              },
              {
                step: '03',
                title: 'Get your full report',
                desc: 'See your AI Visibility Score with category breakdowns and prioritized, actionable recommendations.',
                icon: <Sparkles className="w-5 h-5 text-blue-600" />,
              },
            ].map((item, i) => (
              <div key={i} className="text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                    {item.icon}
                  </div>
                  <span className="text-xs font-bold text-gray-300 tracking-wider">{item.step}</span>
                </div>
                <h3 className="font-semibold text-gray-900 text-[15px]">{item.title}</h3>
                <p className="mt-2 text-sm text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What the audit checks */}
      <section className="py-20 sm:py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-3">What We Check</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight" style={{ fontFamily: 'var(--font-heading)' }}>
              Four pillars of AI visibility
            </h2>
            <p className="mt-4 text-gray-500 max-w-2xl mx-auto">
              Each pillar is scored independently so you know exactly where to focus.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            {[
              {
                icon: <Shield className="w-5 h-5 text-emerald-600" />,
                color: 'bg-emerald-50',
                title: 'Crawlability',
                items: ['robots.txt configuration', 'XML sitemap presence & coverage', 'AI crawler access (GPTBot, ClaudeBot, etc.)', 'Page accessibility & response codes'],
              },
              {
                icon: <FileText className="w-5 h-5 text-blue-600" />,
                color: 'bg-blue-50',
                title: 'Machine Readability',
                items: ['Title and meta description quality', 'Structured data (JSON-LD)', 'Canonical tag consistency', 'Heading hierarchy & content depth'],
              },
              {
                icon: <Zap className="w-5 h-5 text-amber-600" />,
                color: 'bg-amber-50',
                title: 'Commercial Page Clarity',
                items: ['Pricing page discoverability', 'Product/solution page structure', 'Contact & demo conversion paths', 'Navigation clarity & internal linking'],
              },
              {
                icon: <Globe className="w-5 h-5 text-indigo-600" />,
                color: 'bg-indigo-50',
                title: 'Trust & Source Clarity',
                items: ['Organization schema markup', 'Content authority & depth signals', 'Resource/blog/docs presence', 'Page load performance'],
              },
            ].map((cat, i) => (
              <div key={i} className="card-elevated p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-10 h-10 rounded-xl ${cat.color} flex items-center justify-center`}>
                    {cat.icon}
                  </div>
                  <h3 className="font-semibold text-gray-900">{cat.title}</h3>
                </div>
                <ul className="space-y-2.5">
                  {cat.items.map((item, j) => (
                    <li key={j} className="flex items-start gap-2.5 text-sm text-gray-500">
                      <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section className="py-20 sm:py-24 bg-white border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-3">Who It&apos;s For</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight" style={{ fontFamily: 'var(--font-heading)' }}>
            Built for B2B SaaS teams
          </h2>
          <p className="mt-4 text-gray-500 max-w-2xl mx-auto text-lg leading-relaxed">
            Marketing leads, founders, and growth teams who need their site discoverable by
            the next generation of AI-powered search and assistants.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-2.5">
            {['Cybersecurity', 'Dev Tools', 'Martech', 'HR & Recruiting', 'Fintech', 'Analytics', 'Data Platforms', 'Infrastructure'].map((tag) => (
              <span key={tag} className="px-4 py-2 bg-gray-50 text-gray-600 text-sm rounded-full border border-gray-150 font-medium">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-20 sm:py-24">
        <div className="max-w-xl mx-auto px-4 sm:px-6 text-center">
          <div className="bg-white rounded-2xl border border-gray-200 p-8 sm:p-10 shadow-lg shadow-gray-200/50">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight" style={{ fontFamily: 'var(--font-heading)' }}>
              Get your AI Visibility Score
            </h2>
            <p className="mt-3 text-gray-500">
              See how AI systems perceive your site. Takes about 30 seconds.
            </p>
            <form onSubmit={handleAudit} className="mt-6">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="yoursite.com"
                  className="flex-1 px-4 py-3.5 input-premium text-[15px]"
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading || !url.trim()}
                  className="px-6 py-3.5 btn-primary flex items-center gap-2 whitespace-nowrap text-[15px]"
                >
                  {loading ? 'Scanning…' : 'Run Audit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
