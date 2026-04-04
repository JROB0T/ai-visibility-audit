'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, CheckCircle, ArrowRight, Shield, FileText, Sparkles, Eye, BarChart3, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function HomePage() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        router.push('/dashboard');
      } else {
        setIsLoggedIn(false);
      }
    });
  }, [router]);

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

  // Show nothing while checking auth (prevents flash)
  if (isLoggedIn === null) {
    return <div className="min-h-screen" style={{ background: 'var(--bg)' }} />;
  }

  return (
    <div>
      {/* ===== HERO ===== */}
      <section className="hero-dark relative">
        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
            <div className="flex-1 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full mb-6 border" style={{ color: '#818CF8', borderColor: 'rgba(99,102,241,0.2)', background: 'rgba(99,102,241,0.08)' }}>
                <Sparkles className="w-3 h-3" />
                AI Visibility Audit
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-[1.1] tracking-tight">
                See how AI finds{' '}
                <span className="text-gradient">your business</span>
              </h1>
              <p className="mt-5 text-base sm:text-lg max-w-lg leading-relaxed" style={{ color: '#94A3B8' }}>
                AI systems like ChatGPT, Perplexity, and Claude are how customers discover products now. Find out if they can find yours.
              </p>
              <div className="mt-8 max-w-md mx-auto lg:mx-0 flex flex-col sm:flex-row gap-3">
                <a href="/auth/signup" className="px-6 py-3.5 btn-primary flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium">
                  Start Your Free Scan <ArrowRight className="w-4 h-4" />
                </a>
                <a href="/auth/login" className="px-6 py-3.5 rounded-xl border text-sm font-medium flex items-center justify-center gap-2 whitespace-nowrap transition-colors" style={{ color: '#94A3B8', borderColor: 'rgba(148,163,184,0.2)' }}>
                  Sign In
                </a>
              </div>
            </div>

            {/* Demo score card */}
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
                    { label: 'Findability', score: 92, color: '#10B981' },
                    { label: 'Explainability', score: 68, color: '#F59E0B' },
                    { label: 'Buyability', score: 45, color: '#EF4444' },
                    { label: 'Trust', score: 78, color: '#10B981' },
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
              { num: '02', icon: <BarChart3 className="w-5 h-5" style={{ color: '#6366F1' }} />, title: 'We scan how AI sees you', desc: 'We check if AI crawlers can access your site, understand your content, and recommend your business.' },
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
              { icon: <Eye className="w-5 h-5" />, color: '#6366F1', bg: '#E0E7FF', title: 'AI Perception Check', desc: 'Can AI accurately answer questions about your business? We test exactly what ChatGPT, Claude, and Perplexity would say about you.' },
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
          <div className="grid sm:grid-cols-3 gap-5">
            {/* Free Scan */}
            <div className="card-glow p-6 flex flex-col">
              <div className="mb-4">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-tertiary)' }}>Free Scan</p>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold" style={{ color: 'var(--text-primary)' }}>$0</span>
                </div>
              </div>
              <ul className="space-y-3 mb-6 flex-1">
                {['AI Visibility Score', 'Top 5 issues identified', '4 category grades', 'Key pages check', 'AI bot access status'].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#10B981' }} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <a href="/auth/signup" className="w-full py-2.5 rounded-lg border text-sm font-medium text-center transition-colors" style={{ color: '#6366F1', borderColor: 'rgba(99,102,241,0.3)' }}>
                Start Free
              </a>
            </div>

            {/* Full Audit */}
            <div className="card-glow p-6 flex flex-col relative" style={{ borderColor: 'rgba(99,102,241,0.3)', boxShadow: '0 0 30px -10px rgba(99,102,241,0.2)' }}>
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ color: 'white', background: '#6366F1' }}>Most Popular</span>
              </div>
              <div className="mb-4">
                <p className="text-sm font-semibold" style={{ color: '#6366F1' }}>Full Audit</p>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold" style={{ color: 'var(--text-primary)' }}>$50</span>
                  <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>one-time</span>
                </div>
              </div>
              <ul className="space-y-3 mb-6 flex-1">
                {['Everything in Free, plus:', 'All findings with code fixes', 'AI Perception Check', 'Growth Strategy & benchmarks', 'Detailed page analysis', 'Exportable report'].map((item, i) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm" style={{ color: i === 0 ? 'var(--text-tertiary)' : 'var(--text-secondary)' }}>
                    <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#6366F1' }} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <a href="/auth/signup" className="w-full py-2.5 btn-primary rounded-lg text-sm font-medium text-center">
                Get Your Audit
              </a>
            </div>

            {/* Monthly Monitoring */}
            <div className="card-glow p-6 flex flex-col">
              <div className="mb-4">
                <p className="text-sm font-semibold" style={{ color: '#10B981' }}>Monthly Monitoring</p>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold" style={{ color: 'var(--text-primary)' }}>$25</span>
                  <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>/month</span>
                </div>
              </div>
              <ul className="space-y-3 mb-6 flex-1">
                {['Everything in Full Audit, plus:', 'Automatic monthly rescans', 'Score trend tracking', 'Change detection & alerts', 'Monthly action plans', 'New vs resolved issues'].map((item, i) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm" style={{ color: i === 0 ? 'var(--text-tertiary)' : 'var(--text-secondary)' }}>
                    <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#10B981' }} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <a href="/auth/signup" className="w-full py-2.5 rounded-lg border text-sm font-medium text-center transition-colors" style={{ color: '#10B981', borderColor: 'rgba(16,185,129,0.3)' }}>
                Start Monitoring
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

      {/* ===== BOTTOM CTA ===== */}
      <section className="py-20 sm:py-28 border-t" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
        <div className="max-w-lg mx-auto px-4 sm:px-6 text-center">
          <div className="card-glow p-8 sm:p-10" style={{ boxShadow: '0 0 40px -10px rgba(99,102,241,0.1)' }}>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Ready to see how AI finds your business?</h2>
            <p className="mt-3" style={{ color: 'var(--text-secondary)' }}>Get your AI Visibility Score in about 30 seconds. Free to start.</p>
            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
              <a href="/auth/signup" className="px-6 py-3.5 btn-primary flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium">
                Start Your Free Scan <ArrowRight className="w-4 h-4" />
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
