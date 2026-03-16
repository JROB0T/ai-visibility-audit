'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, CheckCircle, AlertTriangle, ArrowRight, Shield, FileText, Globe, Zap } from 'lucide-react';

export default function HomePage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleAudit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }

      router.push(`/audit/${data.auditId}`);
    } catch {
      setError('Could not connect. Please check the URL and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* Hero */}
      <section className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
          <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-sm font-medium px-3 py-1 rounded-full mb-6">
            <Globe className="w-4 h-4" />
            Free AI Visibility Check
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold text-gray-900 leading-tight tracking-tight">
            Can AI systems find
            <br />
            <span className="text-blue-600">your key pages?</span>
          </h1>
          <p className="mt-5 text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
            AI search, AI assistants, and AI crawlers are changing how people discover software.
            Find out if your site is ready — and what to fix first.
          </p>

          {/* Audit form */}
          <form onSubmit={handleAudit} className="mt-10 max-w-xl mx-auto">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Enter your website URL"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={loading}
                />
              </div>
              <button
                type="submit"
                disabled={loading || !url.trim()}
                className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap transition-colors"
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
                  <>
                    Run Audit
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
            {error && (
              <p className="mt-3 text-sm text-red-600 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" />
                {error}
              </p>
            )}
            {loading && (
              <p className="mt-3 text-sm text-gray-500">
                This usually takes 15–30 seconds. We&apos;re scanning your key pages now.
              </p>
            )}
          </form>
        </div>
      </section>

      {/* Problem */}
      <section className="py-16 sm:py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-900">
            The problem
          </h2>
          <p className="mt-4 text-center text-gray-600 max-w-2xl mx-auto text-lg">
            AI-powered search and assistants are reshaping how buyers discover SaaS tools.
            If your site isn&apos;t optimized for machine readability, AI systems may overlook you entirely — or misrepresent what you do.
          </p>
          <div className="mt-12 grid sm:grid-cols-3 gap-6">
            {[
              {
                icon: <AlertTriangle className="w-6 h-6 text-amber-500" />,
                title: 'AI can\'t find key pages',
                desc: 'Missing sitemaps, blocked crawlers, or poor page structure means AI systems never index your pricing, product, or demo pages.',
              },
              {
                icon: <FileText className="w-6 h-6 text-amber-500" />,
                title: 'Content isn\'t machine-readable',
                desc: 'Without structured data, clear metadata, and semantic HTML, AI systems struggle to understand what your pages actually offer.',
              },
              {
                icon: <Globe className="w-6 h-6 text-amber-500" />,
                title: 'Competitors get recommended',
                desc: 'When AI assistants can\'t confidently reference your product, they recommend whoever has better-structured content.',
              },
            ].map((item, i) => (
              <div key={i} className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="mb-3">{item.icon}</div>
                <h3 className="font-semibold text-gray-900">{item.title}</h3>
                <p className="mt-2 text-sm text-gray-600 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 sm:py-20 bg-white border-y border-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-900">
            How it works
          </h2>
          <div className="mt-12 grid sm:grid-cols-3 gap-8">
            {[
              {
                step: '1',
                title: 'Enter your URL',
                desc: 'Paste your website URL. We start from your homepage and discover key pages automatically.',
              },
              {
                step: '2',
                title: 'We scan your site',
                desc: 'We check robots.txt, sitemaps, metadata, structured data, page structure, and commercial page clarity.',
              },
              {
                step: '3',
                title: 'Get your report',
                desc: 'See your AI Visibility Score, category breakdowns, and prioritized recommendations you can act on today.',
              },
            ].map((item, i) => (
              <div key={i} className="text-center">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center mx-auto text-lg">
                  {item.step}
                </div>
                <h3 className="mt-4 font-semibold text-gray-900">{item.title}</h3>
                <p className="mt-2 text-sm text-gray-600 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What the audit checks */}
      <section className="py-16 sm:py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-900">
            What the audit covers
          </h2>
          <p className="mt-4 text-center text-gray-600 max-w-2xl mx-auto">
            Four categories that determine whether AI systems can find, understand, and reference your site.
          </p>
          <div className="mt-12 grid sm:grid-cols-2 gap-6">
            {[
              {
                icon: <Shield className="w-5 h-5 text-blue-600" />,
                title: 'Crawlability',
                items: ['robots.txt configuration', 'XML sitemap presence', 'AI crawler access', 'Page accessibility'],
              },
              {
                icon: <FileText className="w-5 h-5 text-blue-600" />,
                title: 'Machine Readability',
                items: ['Title and meta tags', 'Structured data (JSON-LD)', 'Canonical tags', 'Heading structure and content depth'],
              },
              {
                icon: <Zap className="w-5 h-5 text-blue-600" />,
                title: 'Commercial Page Clarity',
                items: ['Pricing page discoverability', 'Product/solution page structure', 'Contact/demo paths', 'Navigation clarity'],
              },
              {
                icon: <Globe className="w-5 h-5 text-blue-600" />,
                title: 'Trust & Source Clarity',
                items: ['Organization schema', 'Content authority signals', 'Resource/blog presence', 'Page performance'],
              },
            ].map((cat, i) => (
              <div key={i} className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center gap-2 mb-3">
                  {cat.icon}
                  <h3 className="font-semibold text-gray-900">{cat.title}</h3>
                </div>
                <ul className="space-y-2">
                  {cat.items.map((item, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm text-gray-600">
                      <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section className="py-16 sm:py-20 bg-white border-y border-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Built for B2B SaaS teams
          </h2>
          <p className="mt-4 text-gray-600 max-w-2xl mx-auto">
            Marketing leads, founders, and growth teams at SaaS companies who want to make sure
            their site is discoverable by the next generation of AI-powered search and assistants.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {['Cybersecurity', 'Dev Tools', 'Martech', 'HR & Recruiting', 'Fintech', 'Analytics', 'Data Platforms'].map((tag) => (
              <span key={tag} className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-full">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-16 sm:py-20">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Get your AI Visibility Score
          </h2>
          <p className="mt-4 text-gray-600">
            Free scan. Instant results. No commitment required.
          </p>
          <form onSubmit={handleAudit} className="mt-8 max-w-xl mx-auto">
            <div className="flex gap-2">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Enter your website URL"
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !url.trim()}
                className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Scanning…' : 'Run Audit'}
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
