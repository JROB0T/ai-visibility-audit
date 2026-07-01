// ============================================================
// /ai-visibility-vs-seo — public educational/positioning page.
//
// Purpose: make the explicit case that AI visibility (AEO/GEO)
// is a discipline businesses should manage *alongside* SEO, and
// that Aivascan is the tool for the AI side. Server component —
// fully static, crawlable, with Article JSON-LD. Linked from the
// homepage positioning section, sitemap, and llms.txt.
// ============================================================

import type { Metadata } from 'next';
import { ArrowRight, Search, Sparkles, CheckCircle } from 'lucide-react';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://aivascan.com';

export const metadata: Metadata = {
  title: 'AI Visibility vs SEO — Why You Need Both',
  description:
    'SEO determines where you rank in search results. AI visibility determines whether ChatGPT, Claude, Perplexity, and Gemini recommend you at all. Here\u2019s how the two differ, where they overlap, and how to manage both.',
  alternates: { canonical: '/ai-visibility-vs-seo' },
  openGraph: {
    title: 'AI Visibility vs SEO — Why You Need Both',
    description:
      'Ranking #1 doesn\u2019t guarantee AI mentions you. How AI-assistant visibility differs from search rankings, and what to do about it.',
    type: 'article',
    siteName: 'Aivascan',
    url: '/ai-visibility-vs-seo',
  },
  twitter: {
    card: 'summary',
    title: 'AI Visibility vs SEO — Why You Need Both',
    description:
      'Ranking #1 doesn\u2019t guarantee AI mentions you. How AI-assistant visibility differs from search rankings, and what to do about it.',
  },
};

const ARTICLE_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'AI Visibility vs SEO: what\u2019s the difference, and why you need both',
  description:
    'How visibility in AI assistants (ChatGPT, Claude, Perplexity, Gemini) differs from traditional search engine rankings, and how businesses should manage both.',
  author: { '@type': 'Organization', name: 'Aivascan' },
  publisher: { '@type': 'Organization', name: 'Aivascan', url: BASE_URL },
  mainEntityOfPage: `${BASE_URL}/ai-visibility-vs-seo`,
};

// Row data for the comparison table — single source for markup.
const COMPARISON: Array<{ dim: string; seo: string; ai: string }> = [
  {
    dim: 'What the customer sees',
    seo: 'A ranked list of links they choose from',
    ai: 'A direct answer naming two or three businesses',
  },
  {
    dim: 'What you optimize for',
    seo: 'Position on the results page',
    ai: 'Being named — and described accurately — in the answer',
  },
  {
    dim: 'Who reads your site',
    seo: 'Googlebot and Bingbot',
    ai: 'GPTBot, ClaudeBot, PerplexityBot, Google-Extended, and others',
  },
  {
    dim: 'What "losing" looks like',
    seo: 'You\u2019re on page two; some clicks still leak through',
    ai: 'You\u2019re simply absent. The buyer never learns you exist',
  },
  {
    dim: 'How you measure it',
    seo: 'Rank trackers, Search Console, traffic analytics',
    ai: 'Asking AI assistants real buyer questions and scoring the answers',
  },
  {
    dim: 'Key technical signals',
    seo: 'Backlinks, page speed, keywords, crawlability',
    ai: 'AI-crawler access, structured data, llms.txt, clear factual content',
  },
];

export default function AiVisibilityVsSeoPage() {
  return (
    <div style={{ background: 'var(--bg)' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ARTICLE_JSONLD) }}
      />

      {/* Header */}
      <section className="hero-dark relative">
        <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
          <div className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full mb-6 border" style={{ color: '#818CF8', borderColor: 'rgba(99,102,241,0.2)', background: 'rgba(99,102,241,0.08)' }}>
            <Sparkles className="w-3 h-3" />
            Guide
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold text-white leading-[1.15] tracking-tight">
            AI visibility vs SEO:{' '}
            <span className="text-gradient">why you need both</span>
          </h1>
          <p className="mt-5 text-base sm:text-lg leading-relaxed max-w-2xl mx-auto" style={{ color: '#94A3B8' }}>
            For twenty years, being found online meant ranking in search results. Now a growing share of buying research happens inside AI assistants that don&apos;t show results at all — they give answers. Those are two different games, played by different rules.
          </p>
        </div>
      </section>

      {/* Body */}
      <section className="py-16 sm:py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 space-y-12">

          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4" style={{ color: 'var(--text-primary)' }}>The shift, in one sentence</h2>
            <p className="text-[15px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Search engines hand your customer a list and let them pick; AI assistants pick <em>for</em> them. When someone asks ChatGPT &ldquo;who&apos;s the best accountant for a small construction business in Jersey City,&rdquo; the answer names a handful of firms and moves on. There is no page two. If you&apos;re not in the answer, you were never in the running — and unlike a search ranking, you can&apos;t see that it happened.
            </p>
          </div>

          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-6" style={{ color: 'var(--text-primary)' }}>Side by side</h2>
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              <table className="w-full text-sm" style={{ minWidth: '560px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)' }}>
                    <th className="text-left p-4 font-semibold" style={{ color: 'var(--text-tertiary)' }}></th>
                    <th className="text-left p-4 font-semibold" style={{ color: 'var(--text-primary)' }}>
                      <span className="inline-flex items-center gap-2"><Search className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} /> Traditional SEO</span>
                    </th>
                    <th className="text-left p-4 font-semibold" style={{ color: 'var(--text-primary)' }}>
                      <span className="inline-flex items-center gap-2"><Sparkles className="w-4 h-4" style={{ color: '#6366F1' }} /> AI visibility</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.map((row, i) => (
                    <tr key={row.dim} style={{ borderTop: '1px solid var(--border)', background: i % 2 ? 'var(--bg-secondary)' : 'transparent' }}>
                      <td className="p-4 font-medium align-top" style={{ color: 'var(--text-primary)' }}>{row.dim}</td>
                      <td className="p-4 align-top" style={{ color: 'var(--text-secondary)' }}>{row.seo}</td>
                      <td className="p-4 align-top" style={{ color: 'var(--text-secondary)' }}>{row.ai}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4" style={{ color: 'var(--text-primary)' }}>Doesn&apos;t good SEO take care of this?</h2>
            <p className="text-[15px] leading-relaxed mb-4" style={{ color: 'var(--text-secondary)' }}>
              Partly — and that&apos;s the trap. AI systems do learn from the open web, so a well-structured, crawlable site helps both. But the overlap is incomplete in both directions:
            </p>
            <ul className="space-y-3">
              {[
                'Ranking #1 doesn\u2019t guarantee a mention. AI assistants synthesize from many sources — reviews, directories, comparisons, community discussion — not just whoever tops the results page.',
                'A business on page three can be the AI\u2019s first recommendation if third-party sources describe it clearly and consistently.',
                'Some sites unknowingly block AI crawlers in robots.txt while welcoming Googlebot — invisible to assistants, fine in search.',
                'AI answers can be wrong about you: stale hours, old pricing, a discontinued service. SEO tooling will never surface that; only asking the AI does.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-[15px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  <CheckCircle className="w-4 h-4 mt-1 shrink-0" style={{ color: '#6366F1' }} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4" style={{ color: 'var(--text-primary)' }}>How to manage both</h2>
            <p className="text-[15px] leading-relaxed mb-4" style={{ color: 'var(--text-secondary)' }}>
              Treat AI visibility the way you already treat SEO: measure it, fix what&apos;s broken, and re-measure on a schedule. The discipline is sometimes called answer engine optimization (AEO) or generative engine optimization (GEO), and the working loop looks like this:
            </p>
            <ol className="space-y-3 list-none">
              {[
                ['Baseline', 'Ask AI assistants the buying questions your customers ask, and record whether — and how — you appear.'],
                ['Fix the technical floor', 'Allow AI crawlers in robots.txt, add structured data, publish an llms.txt, and make core facts (services, location, pricing) unambiguous on-page.'],
                ['Strengthen the evidence', 'AI recommendations lean on third-party signals: reviews, directories, comparison content, and consistent business information across the web.'],
                ['Re-measure monthly', 'AI answers shift as models and sources update. Track your score over time the way you track rankings.'],
              ].map(([title, body], i) => (
                <li key={title} className="flex items-start gap-4">
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 mt-0.5" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366F1' }}>{i + 1}</span>
                  <p className="text-[15px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{title}. </span>{body}
                  </p>
                </li>
              ))}
            </ol>
          </div>

          {/* CTA */}
          <div className="card-glow p-8 text-center" style={{ boxShadow: '0 0 40px -10px rgba(99,102,241,0.1)' }}>
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Start with your baseline</h2>
            <p className="mt-3 text-sm leading-relaxed max-w-md mx-auto" style={{ color: 'var(--text-secondary)' }}>
              Aivascan runs the measurement step for you: real buyer-intent prompts against AI assistants, scored, with a prioritized fix plan. The sample is free — no account, no card.
            </p>
            <a href="/free-scan" className="mt-6 inline-flex px-6 py-3.5 btn-primary items-center justify-center gap-2 text-sm font-medium">
              Get my free scan <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
