'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import ScoreRing, { ScoreBar, scoreToGrade, getScoreColor } from '@/components/ScoreRing';
import SeverityBadge, { EffortBadge } from '@/components/SeverityBadge';
import { Lock, ArrowRight, ArrowLeft, CheckCircle, XCircle, ExternalLink, FileText, AlertTriangle, RefreshCw, ChevronDown, ChevronRight, Filter, Shield, Code, Eye, Bot, Copy, Check, Globe, Minus, LayoutGrid, Wrench, Zap, MonitorSmartphone, X, Download, Target, Users, CalendarCheck } from 'lucide-react';
import { compareAudits, classifyFinding, generateMonthlyActions } from '@/lib/deltas';
import { getExpectedPages, getVerticalConfig } from '@/lib/verticals';

// ============================================================
// Types
// ============================================================
interface CrawlerStatus {
  name: string; displayName: string; operator: string;
  status: 'allowed' | 'blocked' | 'no_rule';
  statusBasis: string; statusDetail: string;
  visibilityValue: string; visibilityLabel: string;
  description: string; readinessScore: number;
  barriers: string[]; recommendations: string[];
  confidenceLevel: string;
}
interface KeyPageStatus { type: string; label: string; found: boolean; url: string | null; }
interface PagePreview { url: string; title: string; metaDescription: string; h1: string; schemaTypes: string[]; wordCount: number | null; hasSchema: boolean; }

interface AuditData {
  audit: {
    id: string; site_id: string; status: string; overall_score: number | null;
    crawlability_score: number | null; machine_readability_score: number | null;
    commercial_clarity_score: number | null; trust_clarity_score: number | null;
    pages_scanned: number; summary: string | null; created_at: string;
    completed_at: string | null; site: { id?: string; domain: string; url: string; vertical?: string | null };
    generated_fixes?: Array<{ key: string; implementation: string; explanation: string }> | null;
  };
  pages: Array<{
    id: string; url: string; page_type: string; title: string | null;
    has_schema: boolean; schema_types: string[]; meta_description: string | null;
    canonical_url: string | null; h1_text: string | null; word_count: number | null;
    load_time_ms: number | null; status_code: number | null; issues: string[];
  }>;
  findings: Array<{
    id: string; category: string; severity: string; title: string;
    description: string; affected_urls: string[];
  }>;
  recommendations: Array<{
    id: string; category: string; severity: string; effort: string;
    title: string; why_it_matters: string; recommended_fix: string;
    code_snippet?: string | null; priority_order: number;
  }>;
  crawlerStatuses: CrawlerStatus[];
  keyPagesStatus: KeyPageStatus[];
  pagePreviews: PagePreview[];
  previousAudit: {
    id: string;
    overall_score: number | null;
    crawlability_score: number | null;
    machine_readability_score: number | null;
    commercial_clarity_score: number | null;
    trust_clarity_score: number | null;
    findings: Array<{ id: string; category: string; severity: string; title: string; description: string; affected_urls: string[] }>;
    pages: Array<{ url: string }>;
  } | null;
  hasEntitlement?: boolean;
  hasMonitoring?: boolean;
  totalRecommendationCount?: number;
  generatedFixes?: Array<{ key: string; implementation: string; explanation: string }> | null;
}

type ViewMode = 'priority' | 'page' | 'category';
type SeverityFilter = 'all' | 'high' | 'medium' | 'low';
type ReportTab = 'overview' | 'fix-plan' | 'ai-perception' | 'pages';

// FREE_RECOMMENDATION_LIMIT removed — gating now handled at tab level

const CATEGORY_LABELS: Record<string, string> = {
  crawlability: 'Findability', machine_readability: 'Explainability',
  commercial_clarity: 'Buyability', trust_clarity: 'Trustworthiness',
};
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  crawlability: 'Can AI find your site and access your pages?',
  machine_readability: 'Can AI explain what your business does?',
  commercial_clarity: 'Can AI help someone buy from you?',
  trust_clarity: 'Can AI trust and recommend your business?',
};

function getIssueDetail(issue: string): { why: string; fix: string; category: string } {
  const map: Record<string, { why: string; fix: string; category: string }> = {
    'Missing page title': { why: 'Title tags are the primary way AI systems identify what a page is about.', fix: 'Add a unique, descriptive <title> tag (50-60 characters).', category: 'machine_readability' },
    'Page title is very short': { why: 'Short titles give AI very little context about the page.', fix: 'Expand the title to 50-60 characters with your brand name.', category: 'machine_readability' },
    'Page title is very long (may truncate)': { why: 'Long titles get cut off and may confuse AI about the primary topic.', fix: 'Shorten to under 60 characters. Put keywords first.', category: 'machine_readability' },
    'Missing meta description': { why: 'Meta descriptions are used as summaries when AI references your content.', fix: 'Add a meta description (120-155 characters) describing the page.', category: 'machine_readability' },
    'Meta description is very short': { why: 'Short meta descriptions miss the chance to tell AI what the page offers.', fix: 'Expand to 120-155 characters with a clear value proposition.', category: 'machine_readability' },
    'Meta description is very long': { why: 'Long meta descriptions get truncated by AI systems.', fix: 'Trim to under 155 characters. Lead with key info.', category: 'machine_readability' },
    'Missing canonical tag': { why: 'Without a canonical tag, AI may index duplicate versions of this page.', fix: 'Add <link rel="canonical" href="..."> pointing to the preferred URL.', category: 'machine_readability' },
    'No structured data (JSON-LD) found': { why: 'Structured data tells AI exactly what this page represents.', fix: 'Add JSON-LD: Organization on homepage, Product on product pages, Article on blog posts.', category: 'machine_readability' },
    'Missing H1 heading': { why: 'The H1 is a strong signal for page topic.', fix: 'Add a single, clear H1 describing the main topic.', category: 'machine_readability' },
    'Very thin content (under 100 words)': { why: 'Pages with very little text are unlikely to be referenced by AI.', fix: 'Add meaningful content (at least 200-300 words).', category: 'machine_readability' },
    'Page may rely heavily on JavaScript for content rendering': { why: 'AI crawlers often cannot execute JavaScript — they may see a blank page.', fix: 'Ensure critical content is in the initial HTML.', category: 'crawlability' },
  };
  return map[issue] || { why: 'This issue may reduce AI visibility.', fix: 'Review and address to improve AI visibility.', category: 'machine_readability' };
}

// Generate code snippets client-side based on recommendation title and domain
function generateCodeSnippet(title: string, domain: string): string | null {
  const siteUrl = `https://${domain}`;
  const name = domain.replace(/\.(com|io|co|org|net)$/, '').replace(/^www\./, '');
  const capName = name.charAt(0).toUpperCase() + name.slice(1);

  // --- CRAWLABILITY ---
  if (title.includes('robots.txt') && title.includes('Add')) return `# robots.txt — place at ${siteUrl}/robots.txt\nUser-agent: *\nAllow: /\n\n# AI Crawlers\nUser-agent: GPTBot\nAllow: /\n\nUser-agent: ChatGPT-User\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /\n\nUser-agent: Anthropic\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /\n\nUser-agent: Google-Extended\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml`;

  if (title.includes('blocked') || title.includes('Blocked')) return `# Updated robots.txt — remove Disallow rules for AI crawlers\n# Replace your current blocked entries with:\n\nUser-agent: GPTBot\nAllow: /\n\nUser-agent: ChatGPT-User\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /\n\nUser-agent: Anthropic\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /\n\nUser-agent: Google-Extended\nAllow: /`;

  if (title.includes('XML sitemap') || (title.includes('sitemap') && title.includes('Add'))) return `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Place at ${siteUrl}/sitemap.xml -->\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${siteUrl}/</loc>\n    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>\n    <priority>1.0</priority>\n  </url>\n  <url>\n    <loc>${siteUrl}/pricing</loc>\n    <priority>0.9</priority>\n  </url>\n  <url>\n    <loc>${siteUrl}/product</loc>\n    <priority>0.9</priority>\n  </url>\n  <url>\n    <loc>${siteUrl}/contact</loc>\n    <priority>0.8</priority>\n  </url>\n  <url>\n    <loc>${siteUrl}/blog</loc>\n    <priority>0.7</priority>\n  </url>\n</urlset>`;

  if (title.includes('Sitemap has very few')) return `<!-- Add these pages to your sitemap.xml -->\n<url>\n  <loc>${siteUrl}/pricing</loc>\n  <priority>0.9</priority>\n</url>\n<url>\n  <loc>${siteUrl}/features</loc>\n  <priority>0.9</priority>\n</url>\n<url>\n  <loc>${siteUrl}/contact</loc>\n  <priority>0.8</priority>\n</url>\n<url>\n  <loc>${siteUrl}/about</loc>\n  <priority>0.7</priority>\n</url>\n<url>\n  <loc>${siteUrl}/blog</loc>\n  <priority>0.7</priority>\n</url>`;

  // --- MACHINE READABILITY ---
  if (title.includes('Organization structured data') || title.includes('Organization schema')) return `<!-- Add to your homepage <head> -->\n<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "Organization",\n  "name": "${capName}",\n  "url": "${siteUrl}",\n  "logo": "${siteUrl}/logo.png",\n  "description": "Brief description of what ${capName} does",\n  "sameAs": [\n    "https://twitter.com/${name}",\n    "https://linkedin.com/company/${name}",\n    "https://github.com/${name}"\n  ],\n  "contactPoint": {\n    "@type": "ContactPoint",\n    "contactType": "sales",\n    "url": "${siteUrl}/contact"\n  }\n}\n</script>`;

  if (title.includes('structured data') || title.includes('JSON-LD')) return `<!-- FOR PRODUCT PAGES — add to <head> -->\n<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "SoftwareApplication",\n  "name": "${capName}",\n  "applicationCategory": "BusinessApplication",\n  "operatingSystem": "Web",\n  "description": "Your product description here",\n  "offers": {\n    "@type": "Offer",\n    "price": "0",\n    "priceCurrency": "USD"\n  }\n}\n</script>\n\n<!-- FOR BLOG POSTS — add to <head> -->\n<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "Article",\n  "headline": "Your Article Title",\n  "author": {\n    "@type": "Organization",\n    "name": "${capName}"\n  },\n  "publisher": {\n    "@type": "Organization",\n    "name": "${capName}",\n    "logo": { "@type": "ImageObject", "url": "${siteUrl}/logo.png" }\n  },\n  "datePublished": "${new Date().toISOString().split('T')[0]}"\n}\n</script>\n\n<!-- FOR FAQ PAGES — add to <head> -->\n<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "FAQPage",\n  "mainEntity": [\n    {\n      "@type": "Question",\n      "name": "What does ${capName} do?",\n      "acceptedAnswer": {\n        "@type": "Answer",\n        "text": "Your answer here"\n      }\n    }\n  ]\n}\n</script>`;

  if (title.includes('meta description')) return `<!-- Add to <head> of each page -->\n<!-- Homepage -->\n<meta name="description" content="${capName} — [what you do] for [who you serve]. [Key benefit]. Start free today.">\n\n<!-- Pricing page -->\n<meta name="description" content="${capName} pricing: plans start at $X/mo. Compare features across Free, Pro, and Enterprise tiers.">\n\n<!-- Product page -->\n<meta name="description" content="${capName} helps [audience] [solve problem]. Features include [feature 1], [feature 2], and [feature 3].">`;

  if (title.includes('canonical')) return `<!-- Add to <head> of every page -->\n<!-- This tells AI crawlers which URL is the "real" version -->\n<link rel="canonical" href="${siteUrl}/your-page-path">\n\n<!-- Example for homepage -->\n<link rel="canonical" href="${siteUrl}/">\n\n<!-- Example for pricing -->\n<link rel="canonical" href="${siteUrl}/pricing">`;

  if (title.includes('Missing page title') || (title.includes('title') && title.includes('short'))) return `<!-- Homepage -->\n<title>${capName} — [What You Do] for [Who You Serve]</title>\n\n<!-- Pricing -->\n<title>Pricing — ${capName} | Plans Starting at $X/mo</title>\n\n<!-- Product -->\n<title>${capName} Features — [Key Benefit] for [Audience]</title>\n\n<!-- Blog post -->\n<title>[Post Title] — ${capName} Blog</title>`;

  if (title.includes('H1') || title.includes('heading')) return `<!-- Homepage -->\n<h1>${capName}: [Primary value proposition in one line]</h1>\n\n<!-- Pricing -->\n<h1>Simple, transparent pricing</h1>\n\n<!-- Product -->\n<h1>[Product name]: [What it does for the user]</h1>`;

  if (title.includes('thin content') || title.includes('Very thin')) return `<!-- Minimum recommended content structure for any page -->\n<!-- Aim for 300+ words of meaningful content -->\n\n<h1>[Clear page heading]</h1>\n\n<p>[2-3 sentences explaining what this page/product does \nand who it's for. Be specific.]</p>\n\n<h2>[Key benefit or feature #1]</h2>\n<p>[Explanation of how it works and why it matters]</p>\n\n<h2>[Key benefit or feature #2]</h2>\n<p>[Explanation with specific details]</p>\n\n<h2>[Key benefit or feature #3]</h2>\n<p>[Explanation with specific details]</p>\n\n<h2>Getting started</h2>\n<p>[Clear CTA and next steps]</p>`;

  if (title.includes('JavaScript') || title.includes('JS')) return `<!-- Ensure critical content is in the initial HTML -->\n<!-- Don't rely on JavaScript to render: -->\n<!--   - Page title and headings -->\n<!--   - Product descriptions -->\n<!--   - Pricing information -->\n<!--   - Navigation links -->\n\n<!-- Use server-side rendering (SSR) or static generation -->\n<!-- In Next.js: -->\nexport async function getServerSideProps() {\n  // Fetch data server-side so it's in the HTML\n  return { props: { data } };\n}\n\n<!-- Or use <noscript> fallback: -->\n<noscript>\n  <p>${capName} — [your product description here]</p>\n</noscript>`;

  // --- COMMERCIAL CLARITY ---
  if (title.includes('pricing page') || title.includes('No pricing')) return `<!-- Create ${siteUrl}/pricing with this structure -->\n<!DOCTYPE html>\n<html>\n<head>\n  <title>Pricing — ${capName} | Plans & Pricing</title>\n  <meta name="description" content="${capName} pricing plans. Compare Free, Pro, and Enterprise features. Start free today.">\n  <link rel="canonical" href="${siteUrl}/pricing">\n  <script type="application/ld+json">\n  {\n    "@context": "https://schema.org",\n    "@type": "WebPage",\n    "name": "${capName} Pricing",\n    "description": "Pricing plans for ${capName}",\n    "url": "${siteUrl}/pricing"\n  }\n  </script>\n</head>\n<body>\n  <h1>${capName} Pricing</h1>\n  <p>Choose the plan that fits your needs.</p>\n  \n  <!-- Plan cards with clear pricing -->\n  <div>\n    <h2>Free</h2>\n    <p>$0/month</p>\n    <ul>\n      <li>Feature 1</li>\n      <li>Feature 2</li>\n    </ul>\n    <a href="/signup">Get Started Free</a>\n  </div>\n  \n  <div>\n    <h2>Pro</h2>\n    <p>$X/month</p>\n    <ul>\n      <li>Everything in Free</li>\n      <li>Feature 3</li>\n      <li>Feature 4</li>\n    </ul>\n    <a href="/signup?plan=pro">Start Pro Trial</a>\n  </div>\n</body>\n</html>`;

  if (title.includes('contact') || title.includes('demo page') || title.includes('No contact')) return `<!-- Create ${siteUrl}/contact with this structure -->\n<!DOCTYPE html>\n<html>\n<head>\n  <title>Contact Us — ${capName}</title>\n  <meta name="description" content="Get in touch with ${capName}. Request a demo, ask a question, or talk to our team.">\n  <link rel="canonical" href="${siteUrl}/contact">\n</head>\n<body>\n  <h1>Contact ${capName}</h1>\n  <p>Have questions? We'd love to help.</p>\n  \n  <form action="/api/contact" method="POST">\n    <label>Name <input type="text" name="name" required></label>\n    <label>Email <input type="email" name="email" required></label>\n    <label>Company <input type="text" name="company"></label>\n    <label>Message <textarea name="message" required></textarea></label>\n    <button type="submit">Send Message</button>\n  </form>\n  \n  <!-- Or for demo requests: -->\n  <h2>Book a Demo</h2>\n  <p>See ${capName} in action. Schedule a 15-minute walkthrough.</p>\n  <a href="/demo">Schedule Demo</a>\n</body>\n</html>`;

  if (title.includes('product') || title.includes('solution page') || title.includes('No dedicated product')) return `<!-- Create ${siteUrl}/product with this structure -->\n<!DOCTYPE html>\n<html>\n<head>\n  <title>${capName} — [Primary Feature] for [Audience]</title>\n  <meta name="description" content="${capName} helps [audience] [achieve goal]. Key features: [feature 1], [feature 2], [feature 3].">\n  <link rel="canonical" href="${siteUrl}/product">\n  <script type="application/ld+json">\n  {\n    "@context": "https://schema.org",\n    "@type": "SoftwareApplication",\n    "name": "${capName}",\n    "applicationCategory": "BusinessApplication",\n    "description": "What ${capName} does in one sentence",\n    "offers": {\n      "@type": "Offer",\n      "price": "0",\n      "priceCurrency": "USD"\n    }\n  }\n  </script>\n</head>\n<body>\n  <h1>${capName}: [What it does]</h1>\n  <p>[2-3 sentence value proposition]</p>\n  \n  <h2>Key Features</h2>\n  <h3>Feature 1</h3>\n  <p>[How it works and why it matters]</p>\n  \n  <h3>Feature 2</h3>\n  <p>[How it works and why it matters]</p>\n  \n  <h2>How It Works</h2>\n  <p>[Step-by-step or overview]</p>\n  \n  <h2>Get Started</h2>\n  <a href="/signup">Try ${capName} Free</a>\n  <a href="/pricing">View Pricing</a>\n</body>\n</html>`;

  // --- TRUST & AUTHORITY ---
  if (title.includes('content') && (title.includes('resource') || title.includes('blog') || title.includes('No content'))) return `<!-- Create ${siteUrl}/blog with this structure -->\n<!DOCTYPE html>\n<html>\n<head>\n  <title>${capName} Blog — Insights on [Your Industry]</title>\n  <meta name="description" content="Expert insights on [topic] from the ${capName} team. Guides, tutorials, and industry analysis.">\n  <link rel="canonical" href="${siteUrl}/blog">\n</head>\n<body>\n  <h1>${capName} Blog</h1>\n  <p>Insights and guides from our team.</p>\n  \n  <!-- Recommended first 5 articles to write: -->\n  <!-- 1. "What is [your product category]? A Complete Guide" -->\n  <!-- 2. "How to [solve the problem your product solves]" -->\n  <!-- 3. "[Your product] vs [Top Competitor]: Comparison" -->\n  <!-- 4. "[Number] Best [Your Category] Tools in 2025" -->\n  <!-- 5. "Getting Started with ${capName}: A Step-by-Step Guide" -->\n  \n  <!-- Each blog post should have: -->\n  <!-- - 800+ words of original content -->\n  <!-- - Proper heading hierarchy (H1, H2, H3) -->\n  <!-- - Article schema markup -->\n  <!-- - Internal links to your product/pricing pages -->\n</body>\n</html>`;

  if (title.includes('slow') || title.includes('load time') || title.includes('performance')) return `<!-- Performance optimization checklist -->\n\n<!-- 1. Compress images -->\n<img src="image.webp" width="800" height="600" loading="lazy" alt="Descriptive alt text">\n\n<!-- 2. Preload critical resources -->\n<link rel="preload" href="/fonts/main.woff2" as="font" type="font/woff2" crossorigin>\n\n<!-- 3. Minimize render-blocking CSS -->\n<link rel="stylesheet" href="/critical.css">\n<link rel="preload" href="/full.css" as="style" onload="this.onload=null;this.rel='stylesheet'">\n\n<!-- 4. Defer non-critical JavaScript -->\n<script src="/analytics.js" defer></script>\n\n<!-- 5. Add caching headers (in your server config) -->\n<!-- Cache-Control: public, max-age=31536000, immutable -->`;

  if (title.includes('about') || title.includes('company page')) return `<!-- Create ${siteUrl}/about -->\n<head>\n  <title>About ${capName} — Our Mission & Team</title>\n  <meta name="description" content="Learn about ${capName}, our mission, and the team building [what you build].">\n</head>\n<body>\n  <h1>About ${capName}</h1>\n  <p>[Your company story and mission]</p>\n  <h2>What We Do</h2>\n  <p>[Clear explanation of your product]</p>\n  <h2>Our Team</h2>\n  <p>[Team info builds trust with AI systems]</p>\n</body>`;

  return null;
}

// Generate AI visibility summary from scan data (no API needed)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function generateAiSummary(audit: AuditData['audit'], crawlerStatuses: CrawlerStatus[], keyPagesStatus: KeyPageStatus[], findingsCount: number, highCount: number): string {
  const domain = audit.site?.domain || 'this site';
  const score = audit.overall_score ?? 0;
  const parts: string[] = [];

  // Overall assessment
  if (score >= 80) parts.push(`${domain} has strong AI visibility with a score of ${score}/100. AI systems can find your site, explain what you do, and recommend you to potential customers.`);
  else if (score >= 60) parts.push(`${domain} has moderate AI visibility with a score of ${score}/100. AI systems can find your site, but there are gaps in how well they can explain and recommend your business.`);
  else if (score >= 40) parts.push(`${domain} has limited AI visibility with a score of ${score}/100. AI systems may struggle to accurately describe your business or recommend you to potential customers.`);
  else parts.push(`${domain} has poor AI visibility with a score of ${score}/100. AI systems likely cannot find or accurately describe your business. Immediate action is needed.`);

  // Category breakdown in friendly language
  const crawl = audit.crawlability_score ?? 0;
  const read = audit.machine_readability_score ?? 0;
  const comm = audit.commercial_clarity_score ?? 0;
  const trust = audit.trust_clarity_score ?? 0;

  const weakest = Math.min(crawl, read, comm, trust);
  if (weakest === crawl && crawl < 60) parts.push(`Findability is your biggest gap — AI crawlers are having trouble accessing or navigating your site.`);
  else if (weakest === read && read < 60) parts.push(`Explainability is your biggest gap — even when AI finds your site, it struggles to understand what you offer.`);
  else if (weakest === comm && comm < 60) parts.push(`Buyability is your biggest gap — AI can find you, but can't easily help someone purchase from you or take the next step.`);
  else if (weakest === trust && trust < 60) parts.push(`Trustworthiness is your biggest gap — AI doesn't see enough signals to confidently recommend your business.`);

  // Crawler access
  const blocked = crawlerStatuses?.filter(c => c.status === 'blocked') || [];
  const allowed = crawlerStatuses?.filter(c => c.status === 'allowed') || [];
  if (blocked.length > 0) parts.push(`${blocked.length} AI system(s) are blocked from accessing your site, including ${blocked.slice(0, 3).map(b => b.displayName).join(', ')}.`);
  else if (allowed.length > 0) parts.push(`AI systems can access your site, which is a good start.`);

  // Missing pages
  const missing = keyPagesStatus?.filter(kp => !kp.found) || [];
  if (missing.length > 0) parts.push(`Key pages missing: ${missing.map(m => m.label).join(', ')}. Without these, AI can't answer common questions about your business.`);

  // Issues
  if (highCount > 0) parts.push(`We found ${findingsCount} issues total, ${highCount} of which are high-priority fixes that would significantly improve how AI systems find and recommend ${domain}.`);

  // Next steps
  const steps: string[] = [];
  if (highCount > 0) steps.push('Start with the Top 5 Fixes above — they have the biggest impact');
  if (missing.length > 0) steps.push('Click any missing page to see what to create');
  steps.push('Use the Findings & Fixes tab for the full list of improvements');
  steps.push('Export this report to share with your team');
  parts.push('Next steps: ' + steps.join('. ') + '.');

  return parts.join('\n\n');
}

// ============================================================
// Helper: get owner label for a recommendation
// ============================================================
function getFixOwner(title: string, category: string): { label: string; color: string } {
  const t = title.toLowerCase();
  if (t.includes('robots.txt') || t.includes('sitemap') || t.includes('schema') || t.includes('json-ld') || t.includes('canonical') || t.includes('structured data') || t.includes('heading') || t.includes('meta') || t.includes('noindex') || t.includes('lang') || category === 'crawlability') {
    return { label: 'Developer', color: '#6366F1' };
  }
  if (t.includes('content') || t.includes('copy') || t.includes('page') || t.includes('pricing') || t.includes('comparison') || t.includes('blog') || t.includes('description') || t.includes('title') || category === 'commercial_clarity') {
    return { label: 'Marketing', color: '#F59E0B' };
  }
  if (t.includes('review') || t.includes('trust') || t.includes('social') || t.includes('customer') || t.includes('testimonial') || t.includes('logo') || category === 'trust_clarity') {
    return { label: 'Business Owner', color: '#10B981' };
  }
  return { label: 'Team', color: '#64748B' };
}

// ============================================================
// Helper: interpret a category score as plain English
// ============================================================
function getCategoryInterpretation(score: number, category: 'findability' | 'explainability' | 'buyability' | 'trustworthiness'): string {
  const good: Record<string, string> = {
    findability: 'AI systems can find your site easily.',
    explainability: 'AI can clearly explain what you do.',
    buyability: 'AI can help someone buy from you.',
    trustworthiness: 'AI sees strong trust signals.',
  };
  const partial: Record<string, string> = {
    findability: 'Some AI systems have trouble finding your site.',
    explainability: 'AI only partially understands what you offer.',
    buyability: 'AI struggles to guide buyers to your business.',
    trustworthiness: 'Trust signals are present but incomplete.',
  };
  const poor: Record<string, string> = {
    findability: 'Most AI systems cannot find your site.',
    explainability: 'AI cannot explain what your business does.',
    buyability: 'AI cannot help someone buy from you.',
    trustworthiness: 'AI lacks confidence to recommend you.',
  };
  if (score >= 80) return good[category];
  if (score >= 60) return partial[category];
  return poor[category];
}

// ============================================================
// Key page detail data for side panel
// ============================================================
function getKeyPageDetail(type: string, domain: string): { title: string; whyItMatters: string; whatToInclude: string[]; exampleCode: string } {
  const name = domain.replace(/\.(com|io|co|org|net)$/, '').replace(/^www\./, '');
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  const url = `https://${domain}`;

  const details: Record<string, { title: string; whyItMatters: string; whatToInclude: string[]; exampleCode: string }> = {
    homepage: { title: 'Homepage', whyItMatters: 'The homepage is the first page AI crawlers visit. It must clearly state what your product does, who it\'s for, and how to get started.', whatToInclude: ['Clear H1 describing your product', 'Meta description with value proposition', 'Organization schema (JSON-LD)', 'Open Graph meta tags', 'Primary CTA button', 'Navigation to pricing, product, contact', 'Customer logos or trust signals'], exampleCode: `<title>${cap} — [What You Do] for [Who You Serve]</title>\n<meta name="description" content="${cap} helps [audience] [solve problem]. Start free today.">\n<meta property="og:title" content="${cap} — [What You Do]">\n<meta property="og:description" content="[Value proposition in one sentence]">\n<meta property="og:image" content="${url}/og-image.png">\n<script type="application/ld+json">\n{"@context":"https://schema.org","@type":"Organization","name":"${cap}","url":"${url}","logo":"${url}/logo.png"}\n</script>` },
    pricing: { title: 'Pricing Page', whyItMatters: 'AI systems are frequently asked "how much does X cost?" Without a pricing page, AI cannot answer this question and may not recommend your product.', whatToInclude: ['Clear plan names and prices in HTML text', 'Feature comparison between plans', 'Offer/PriceSpecification schema', 'Free tier or trial option clearly visible', 'FAQ section about billing', 'CTA for each plan'], exampleCode: `<!-- ${url}/pricing -->\n<title>Pricing — ${cap} | Plans Starting at $X/mo</title>\n<meta name="description" content="${cap} pricing: Free, Pro ($X/mo), Enterprise. Compare features.">\n<h1>${cap} Pricing</h1>\n<script type="application/ld+json">\n{"@context":"https://schema.org","@type":"WebPage","name":"${cap} Pricing","offers":[{"@type":"Offer","name":"Pro","price":"X","priceCurrency":"USD"}]}\n</script>` },
    product: { title: 'Product / Features Page', whyItMatters: 'Product pages tell AI what you actually do. Without them, AI has very limited ability to describe or recommend your product for specific use cases.', whatToInclude: ['Clear explanation of what the product does', 'Specific feature list (not vague marketing)', 'Who it\'s for (target audience)', 'What problem it solves', 'SoftwareApplication schema', 'Screenshots or demo', 'CTA to sign up or try'], exampleCode: `<!-- ${url}/product -->\n<title>${cap} Features — [Key Benefit] for [Audience]</title>\n<meta name="description" content="${cap} helps [audience] [benefit]. Features: [feature 1], [feature 2], [feature 3].">\n<h1>${cap}: [What it does in one line]</h1>\n<script type="application/ld+json">\n{"@context":"https://schema.org","@type":"SoftwareApplication","name":"${cap}","applicationCategory":"BusinessApplication","description":"[What it does]"}\n</script>` },
    contact: { title: 'Contact Page', whyItMatters: 'When AI recommends a product, users often ask "how do I get in touch?" A contact page provides the conversion path that makes your product actionable.', whatToInclude: ['Contact form with name, email, message', 'Business email address', 'Phone number if applicable', 'Physical address for trust', 'Support hours', 'Link to demo booking if available'], exampleCode: `<!-- ${url}/contact -->\n<title>Contact Us — ${cap}</title>\n<meta name="description" content="Get in touch with ${cap}. Request a demo, ask questions, or reach our team.">\n<h1>Contact ${cap}</h1>` },
    demo: { title: 'Demo / Trial Page', whyItMatters: 'A demo page gives AI a clear "next step" to recommend. When users ask "how do I try X?", AI needs a page to point them to.', whatToInclude: ['Clear headline about trying the product', 'Demo booking form or free trial signup', 'What to expect from the demo/trial', 'No credit card required messaging', 'Social proof near the CTA'], exampleCode: `<!-- ${url}/demo -->\n<title>Book a Demo — ${cap}</title>\n<meta name="description" content="See ${cap} in action. Schedule a free 15-minute demo with our team.">\n<h1>See ${cap} in Action</h1>` },
    docs: { title: 'Documentation', whyItMatters: 'Documentation signals product maturity and helps AI answer technical questions about your product. It\'s especially important for developer-focused tools.', whatToInclude: ['Getting started guide', 'API reference if applicable', 'Searchable content', 'Clear navigation structure', 'Code examples', 'Breadcrumb navigation'], exampleCode: `<!-- ${url}/docs -->\n<title>${cap} Documentation — Getting Started</title>\n<meta name="description" content="Learn how to use ${cap}. API reference, guides, and examples.">\n<h1>${cap} Documentation</h1>` },
    blog: { title: 'Blog / Content', whyItMatters: 'Blog content builds AI trust (E-E-A-T signals) and gives AI systems material to reference about your expertise. It helps AI understand your domain authority.', whatToInclude: ['Regular publishing cadence', 'Author bylines with credentials', 'Publish dates on every post', 'Article schema (JSON-LD)', 'Internal links to product/pricing', 'Topics demonstrating domain expertise'], exampleCode: `<!-- Blog post template -->\n<title>[Post Title] — ${cap} Blog</title>\n<meta name="author" content="[Author Name]">\n<meta property="article:published_time" content="2025-01-15">\n<script type="application/ld+json">\n{"@context":"https://schema.org","@type":"Article","headline":"[Title]","author":{"@type":"Person","name":"[Author]"},"datePublished":"2025-01-15"}\n</script>` },
    about: { title: 'About / Team', whyItMatters: 'An about page verifies your legitimacy to AI systems. It helps AI confirm you\'re a real company with real people, which increases trust and recommendation confidence.', whatToInclude: ['Company story and mission', 'Team members with names and roles', 'Founded date', 'Company size or stage', 'Office location', 'Photos of real team members'], exampleCode: `<!-- ${url}/about -->\n<title>About ${cap} — Our Mission & Team</title>\n<meta name="description" content="Learn about ${cap}, our mission, and the team building [product description].">\n<h1>About ${cap}</h1>` },
    security: { title: 'Security / Compliance', whyItMatters: 'For B2B products, security information is critical. When AI recommends tools to enterprise buyers, compliance certifications are often a deciding factor.', whatToInclude: ['Compliance certifications (SOC2, GDPR, HIPAA)', 'Data handling practices', 'Security architecture overview', 'Encryption details', 'Privacy controls', 'Contact for security inquiries'], exampleCode: `<!-- ${url}/security -->\n<title>Security & Compliance — ${cap}</title>\n<meta name="description" content="${cap} security: SOC 2 Type II certified, GDPR compliant. Enterprise-grade data protection.">\n<h1>Security at ${cap}</h1>` },
    privacy: { title: 'Privacy Policy', whyItMatters: 'A privacy policy is a baseline trust signal. Its absence signals to AI systems that the business may not be established or trustworthy.', whatToInclude: ['What data you collect', 'How data is used', 'Data retention policies', 'User rights (access, deletion)', 'Cookie policy', 'Contact for privacy inquiries', 'Last updated date'], exampleCode: `<!-- ${url}/privacy -->\n<title>Privacy Policy — ${cap}</title>\n<meta name="description" content="${cap} privacy policy. How we collect, use, and protect your data.">\n<h1>Privacy Policy</h1>\n<p>Last updated: ${new Date().toLocaleDateString()}</p>` },
    comparison: { title: 'Comparison Pages', whyItMatters: 'When users ask AI "X vs Y" or "alternatives to Z", comparison pages make you part of that conversation. Without them, competitors with comparison pages win those queries.', whatToInclude: ['Feature-by-feature comparison table', 'Honest pros/cons', 'Pricing comparison', 'Use case fit analysis', 'Clear CTA for your product'], exampleCode: `<!-- ${url}/compare/competitor -->\n<title>${cap} vs [Competitor] — Feature Comparison</title>\n<meta name="description" content="Compare ${cap} and [Competitor]. See features, pricing, and which is right for your team.">\n<h1>${cap} vs [Competitor]</h1>` },
    integrations: { title: 'Integrations', whyItMatters: 'AI uses integration data to recommend products that work with a user\'s existing tools. "Does X integrate with Slack?" is a common AI query.', whatToInclude: ['List of all integrations', 'Category grouping (CRM, messaging, analytics)', 'Setup instructions per integration', 'API/webhook documentation', 'Logos of integration partners'], exampleCode: `<!-- ${url}/integrations -->\n<title>${cap} Integrations — Connect Your Tools</title>\n<meta name="description" content="${cap} integrates with Slack, Salesforce, HubSpot, and 50+ other tools.">\n<h1>Integrations</h1>` },
    'use-case': { title: 'Services / Use Cases', whyItMatters: 'Service and use case pages help AI match your business to specific customer needs and queries.', whatToInclude: ['Clear description of each service or use case', 'Who it\'s for and what problem it solves', 'Pricing or next steps', 'Testimonials or case study excerpts', 'Internal links to related pages'], exampleCode: `<!-- ${url}/services/[service-name] -->\n<title>[Service Name] — ${cap}</title>\n<meta name="description" content="${cap} offers [service]. Learn how we help [audience] with [problem].">\n<h1>[Service Name]</h1>` },
    resource: { title: 'Resources / Case Studies', whyItMatters: 'Case studies and resource pages give AI concrete evidence of your work and expertise to reference when recommending your business.', whatToInclude: ['Client name and industry', 'Problem description', 'Your solution and approach', 'Measurable results', 'Testimonial or quote'], exampleCode: `<!-- ${url}/case-studies/[client] -->\n<title>[Client] Case Study — ${cap}</title>\n<meta name="description" content="See how ${cap} helped [client] achieve [result].">\n<h1>Case Study: [Client Name]</h1>` },
    changelog: { title: 'Changelog / Updates', whyItMatters: 'A changelog signals active development to AI systems. It helps AI confirm your product is maintained and evolving.', whatToInclude: ['Dated entries for each release', 'New features and improvements', 'Bug fixes', 'Clear version numbers', 'Links to documentation'], exampleCode: `<!-- ${url}/changelog -->\n<title>Changelog — ${cap}</title>\n<meta name="description" content="See the latest updates and improvements to ${cap}.">\n<h1>${cap} Changelog</h1>` },
  };

  return details[type] || { title: type, whyItMatters: 'This page type helps AI systems better understand your site.', whatToInclude: ['Clear page title and meta description', 'Relevant structured data', 'Internal links to other key pages'], exampleCode: `<title>[Page Title] — ${cap}</title>\n<meta name="description" content="[Page description]">` };
}

// ============================================================
// Export consultant report as HTML
// ============================================================
function generateConsultantReport(audit: AuditData['audit'], pages: AuditData['pages'], recommendations: AuditData['recommendations'], crawlerStatuses: CrawlerStatus[], keyPagesStatus: KeyPageStatus[]): string {
  const domain = audit.site?.domain || 'unknown';
  const date = new Date(audit.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const score = audit.overall_score ?? 0;
  const highRecs = recommendations.filter(r => r.severity === 'high');
  const medRecs = recommendations.filter(r => r.severity === 'medium');
  const lowRecs = recommendations.filter(r => r.severity === 'low');
  const blocked = crawlerStatuses?.filter(c => c.status === 'blocked') || [];
  const missing = keyPagesStatus?.filter(kp => !kp.found) || [];

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>AI Visibility Audit Report — ${domain}</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;max-width:800px;margin:0 auto;padding:40px 20px;color:#1a1a2e;line-height:1.6}
h1{font-size:24px;border-bottom:3px solid #6366F1;padding-bottom:12px;margin-top:40px}
h2{font-size:18px;color:#6366F1;margin-top:32px;border-bottom:1px solid #e2e8f0;padding-bottom:8px}
h3{font-size:15px;margin-top:20px}
.meta{color:#64748b;font-size:13px}
.score-box{background:#f8fafc;border:2px solid #6366F1;border-radius:12px;padding:24px;text-align:center;margin:20px 0}
.score-num{font-size:48px;font-weight:bold;color:${score >= 80 ? '#10B981' : score >= 50 ? '#F59E0B' : '#EF4444'}}
.score-bar{display:flex;align-items:center;gap:8px;margin:4px 0}
.score-bar-label{width:120px;font-size:13px;color:#64748b}
.score-bar-fill{height:8px;border-radius:4px}
.score-bar-track{flex:1;height:8px;background:#e2e8f0;border-radius:4px}
table{width:100%;border-collapse:collapse;margin:12px 0}
th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px}
th{background:#f8fafc;font-weight:600;color:#64748b}
.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}
.badge-high{background:#FEE2E2;color:#DC2626}
.badge-medium{background:#FEF3C7;color:#D97706}
.badge-low{background:#DBEAFE;color:#2563EB}
.badge-found{background:#ECFDF5;color:#059669}
.badge-missing{background:#FEE2E2;color:#DC2626}
.rec-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:8px 0}
.rec-title{font-weight:600;font-size:14px}
.rec-fix{font-size:13px;color:#475569;margin-top:4px}
.footer{margin-top:40px;padding-top:20px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;text-align:center}
@media print{body{padding:20px}.score-box{break-inside:avoid}}
</style></head><body>

<div style="text-align:center;margin-bottom:32px">
<div style="font-size:13px;color:#6366F1;font-weight:600;letter-spacing:1px;text-transform:uppercase">AI Visibility Audit Report</div>
<h1 style="border:none;margin-top:8px;padding:0;font-size:28px">${domain}</h1>
<p class="meta">Report generated ${date} · ${pages.length} pages scanned</p>
</div>

<h2>Executive Summary</h2>
<div class="score-box">
<div class="score-num">${scoreToGrade(score)}</div>
<p style="color:#64748b;margin:8px 0 16px">${score}/100 — Overall AI Visibility Grade</p>
<div class="score-bar"><span class="score-bar-label">Findability</span><div class="score-bar-track"><div class="score-bar-fill" style="width:${audit.crawlability_score ?? 0}%;background:${getScoreColor(audit.crawlability_score ?? 0)}"></div></div><span style="font-weight:600;width:30px;text-align:right">${scoreToGrade(audit.crawlability_score ?? 0)}</span></div>
<div class="score-bar"><span class="score-bar-label">Explainability</span><div class="score-bar-track"><div class="score-bar-fill" style="width:${audit.machine_readability_score ?? 0}%;background:${getScoreColor(audit.machine_readability_score ?? 0)}"></div></div><span style="font-weight:600;width:30px;text-align:right">${scoreToGrade(audit.machine_readability_score ?? 0)}</span></div>
<div class="score-bar"><span class="score-bar-label">Buyability</span><div class="score-bar-track"><div class="score-bar-fill" style="width:${audit.commercial_clarity_score ?? 0}%;background:${getScoreColor(audit.commercial_clarity_score ?? 0)}"></div></div><span style="font-weight:600;width:30px;text-align:right">${scoreToGrade(audit.commercial_clarity_score ?? 0)}</span></div>
<div class="score-bar"><span class="score-bar-label">Trustworthiness</span><div class="score-bar-track"><div class="score-bar-fill" style="width:${audit.trust_clarity_score ?? 0}%;background:${getScoreColor(audit.trust_clarity_score ?? 0)}"></div></div><span style="font-weight:600;width:30px;text-align:right">${scoreToGrade(audit.trust_clarity_score ?? 0)}</span></div>
</div>

<p>${score >= 80 ? 'Your site has strong AI visibility.' : score >= 60 ? 'Your site has moderate AI visibility with clear areas for improvement.' : score >= 40 ? 'Your site has limited AI visibility. AI systems may struggle to accurately describe or recommend your product.' : 'Your site has poor AI visibility. Immediate action is needed to ensure AI systems can find and reference your content.'} We identified ${highRecs.length} high-priority, ${medRecs.length} medium-priority, and ${lowRecs.length} low-priority findings across ${pages.length} scanned pages.</p>

<h2>Methodology</h2>
<p>This audit scanned ${pages.length} pages on ${domain} using 100+ automated checks across four categories: Findability (can AI find your site?), Explainability (can AI explain what you do?), Buyability (can AI help someone buy?), and Trustworthiness (can AI trust and recommend you?). Each page was analyzed for technical signals, structured data, content quality, and commercial clarity.</p>

<h2>Key Pages Status</h2>
<table>
<tr><th>Page Type</th><th>Status</th></tr>
${keyPagesStatus?.map(kp => `<tr><td>${kp.label}</td><td><span class="badge badge-${kp.found ? 'found' : 'missing'}">${kp.found ? 'Found' : 'Missing'}</span></td></tr>`).join('\n') || ''}
</table>
${missing.length > 0 ? `<p><strong>Missing pages:</strong> ${missing.map(m => m.label).join(', ')}. These gaps mean AI cannot answer common questions about your product's pricing, contact information, or key features.</p>` : '<p>All key page types were found.</p>'}

<h2>AI Crawler Access</h2>
${blocked.length > 0 ? `<p><strong>${blocked.length} AI system(s) are blocked:</strong> ${blocked.map(b => b.displayName + ' (' + b.operator + ')').join(', ')}. These systems cannot access your site content at all.</p>` : '<p>No AI crawlers are blocked. All major AI systems can access your site.</p>'}

<h2>Findings & Recommendations</h2>
<h3>High Priority (${highRecs.length})</h3>
${highRecs.map(r => `<div class="rec-card"><div class="rec-title"><span class="badge badge-high">HIGH</span> ${r.title}</div><div class="rec-fix"><strong>Why:</strong> ${r.why_it_matters}</div><div class="rec-fix"><strong>Fix:</strong> ${r.recommended_fix}</div></div>`).join('\n') || '<p>No high-priority issues found.</p>'}

<h3>Medium Priority (${medRecs.length})</h3>
${medRecs.map(r => `<div class="rec-card"><div class="rec-title"><span class="badge badge-medium">MEDIUM</span> ${r.title}</div><div class="rec-fix"><strong>Why:</strong> ${r.why_it_matters}</div><div class="rec-fix"><strong>Fix:</strong> ${r.recommended_fix}</div></div>`).join('\n') || '<p>No medium-priority issues found.</p>'}

<h3>Low Priority (${lowRecs.length})</h3>
${lowRecs.map(r => `<div class="rec-card"><div class="rec-title"><span class="badge badge-low">LOW</span> ${r.title}</div><div class="rec-fix"><strong>Fix:</strong> ${r.recommended_fix}</div></div>`).join('\n') || '<p>No low-priority issues found.</p>'}

<h2>Pages Analyzed</h2>
<table>
<tr><th>Page</th><th>Type</th><th>Schema</th><th>Issues</th></tr>
${pages.map(p => { let path = p.url; try { path = new URL(p.url).pathname; } catch {} return `<tr><td>${p.title || path}</td><td>${p.page_type}</td><td>${p.has_schema ? '✓' : '—'}</td><td>${p.issues.length}</td></tr>`; }).join('\n')}
</table>

<h2>Next Steps</h2>
<ol>
<li><strong>Address high-priority issues first</strong> — these have the largest impact on whether AI can find and recommend your product.</li>
<li><strong>Create missing key pages</strong> — ${missing.length > 0 ? missing.map(m => m.label).join(', ') : 'all key pages are present'}.</li>
<li><strong>Add structured data</strong> — JSON-LD schema on your homepage, product pages, and blog posts.</li>
<li><strong>Re-scan in 2-4 weeks</strong> — after implementing fixes, run another audit to measure progress.</li>
</ol>

<div style="margin-top: 40px; padding: 24px; background: linear-gradient(135deg, #1e3a5f, #0f2137); border: 1px solid #2d5a8e; border-radius: 16px; text-align: center; font-family: sans-serif;">
  <h3 style="color: white; font-size: 18px; font-weight: bold; margin: 0 0 8px 0;">Take Action On Your Results</h3>
  <p style="color: #d1d5db; font-size: 14px; margin: 0 0 20px 0;">Your report is ready — now let's improve your score.</p>
  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; max-width: 600px; margin: 0 auto;">
    <div style="background: #0f2137; border: 1px solid #2d5a8e; border-radius: 12px; padding: 16px; text-align: left;">
      <div style="color: white; font-weight: 600; font-size: 14px; margin-bottom: 8px;">🔁 Monthly Monitoring</div>
      <div style="color: #9ca3af; font-size: 12px; margin-bottom: 12px;">Automated monthly re-scans, score tracking, and change alerts.</div>
      <div style="color: white; font-size: 22px; font-weight: bold;">$25<span style="font-size: 12px; color: #9ca3af;">/month</span></div>
      <div style="color: #6b7280; font-size: 11px; margin-top: 4px;">Visit aivisibility.io to get started</div>
    </div>
    <div style="background: #0f2137; border: 1px solid #2d5a8e; border-radius: 12px; padding: 16px; text-align: left;">
      <div style="color: white; font-weight: 600; font-size: 14px; margin-bottom: 8px;">🤝 Work With a Specialist</div>
      <div style="color: #9ca3af; font-size: 12px; margin-bottom: 12px;">Get matched with a tech or marketing specialist to implement your fixes.</div>
      <div style="color: #7dd3fc; font-size: 13px; font-weight: 500;">Free consultation</div>
      <div style="color: #6b7280; font-size: 11px; margin-top: 4px;">help@aivisibility.io</div>
    </div>
  </div>
</div>

<div class="footer">
<p>AI Visibility Audit — aivisibilityaudit.com</p>
<p>This report was generated automatically. Recommendations are based on automated scanning and should be reviewed by your development team before implementation.</p>
</div>
</body></html>`;
}

// ============================================================
// Code snippet copy button
// ============================================================
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors"
      style={{ color: copied ? '#10B981' : 'var(--text-tertiary)', background: 'var(--bg-tertiary)' }}>
      {copied ? <><Check className="w-3 h-3" />Copied</> : <><Copy className="w-3 h-3" />Copy</>}
    </button>
  );
}

// ============================================================
// Reusable locked/upgrade CTA component
// ============================================================
function LockedSection({ title, description, onCheckout, loading }: { title: string; description: string; onCheckout: () => void; loading: boolean }) {
  return (
    <div className="card p-10 text-center mb-6" style={{ borderColor: 'rgba(99,102,241,0.15)', background: 'var(--surface)' }}>
      <Lock className="w-8 h-8 mx-auto" style={{ color: '#6366F1' }} />
      <h2 className="mt-3 text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
      <p className="mt-2 text-sm max-w-md mx-auto" style={{ color: 'var(--text-secondary)' }}>{description}</p>
      <button onClick={onCheckout} disabled={loading} className="mt-5 btn-primary inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium">
        {loading ? 'Redirecting…' : '$50 — Unlock Full Report'} <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ============================================================
// Main component
// ============================================================
export default function AuditResultPage() {
  const params = useParams();
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasPaid, setHasPaid] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('category');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedCrawlers, setExpandedCrawlers] = useState<Set<string>>(new Set());
  const [selectedKeyPage, setSelectedKeyPage] = useState<KeyPageStatus | null>(null);
  const [selectedPerceptionQ, setSelectedPerceptionQ] = useState<number | null>(null);
  const [showAllMissing, setShowAllMissing] = useState(false);
  const [monitoringLoading, setMonitoringLoading] = useState(false);
  const [hasMonitoring, setHasMonitoring] = useState(false);

  function handleExportReport() {
    if (!data) return;
    const html = generateConsultantReport(data.audit, data.pages, data.recommendations, data.crawlerStatuses || [], data.keyPagesStatus || []);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-visibility-report-${data.audit.site?.domain}-${new Date(data.audit.created_at).toISOString().split('T')[0]}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleCheckout(priceType: 'initial_scan' | 'rescan' | 'monthly') {
    if (!data) return;
    const siteId = data.audit.site_id || data.audit.site?.id;
    if (!siteId) {
      console.error('No siteId available for checkout. audit:', { site_id: data.audit.site_id, site: data.audit.site });
      return;
    }
    setCheckoutLoading(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, priceType }),
      });
      const result = await res.json();
      if (result.url) {
        window.location.href = result.url;
      } else {
        console.error('Checkout failed:', result);
      }
    } catch (err) {
      console.error('Checkout network error:', err);
    } finally {
      setCheckoutLoading(false);
    }
  }

  const handleStartMonitoring = async () => {
    if (!data) return;
    const siteId = data.audit.site_id || data.audit.site?.id;
    if (!siteId) {
      console.error('[monitoring] No siteId available for checkout');
      return;
    }
    try {
      setMonitoringLoading(true);
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId,
          priceType: 'monthly',
          auditId: data.audit.id,
        }),
      });
      const result = await response.json();
      if (result.url) {
        window.location.href = result.url;
      } else {
        console.error('[monitoring] No checkout URL returned:', result);
        setMonitoringLoading(false);
      }
    } catch (err) {
      console.error('[monitoring] Checkout error:', err);
      setMonitoringLoading(false);
    }
  };

  const [activeTab, setActiveTab] = useState<ReportTab>('overview');
  const [perceptionQuestions, setPerceptionQuestions] = useState<Array<{ question: string; intent: string; what_ai_needs: string; status: 'pass' | 'partial' | 'fail'; assessment: string; fix: string; codeSnippet: string | null }> | null>(null);
  const [perceptionLoading, setPerceptionLoading] = useState(false);
  const [growthData, setGrowthData] = useState<{ competitors: Array<{ domain: string; overall: number; crawl: number; read: number; commercial: number; trust: number; rationale?: string }>; yourScores: { overall: number; crawl: number; read: number; commercial: number; trust: number }; marketingStrategy: { queries: string[]; pages_to_create: Array<{ title: string; why: string }>; content_to_optimize: Array<{ page: string; action: string }>; schema_actions: Array<{ action: string; impact: string }>; trust_actions: Array<{ action: string; impact: string }> } } | null>(null);
  const [growthLoading, setGrowthLoading] = useState(false);
  const [generatedFixes, setGeneratedFixes] = useState<Array<{ key: string; implementation: string; explanation: string }> | null>(null);
  const [fixesLoading, setFixesLoading] = useState(false);
  const fixesRequested = useRef(false);
  // animateProjections state removed — card design doesn't need it

  function switchTab(tab: ReportTab) {
    setActiveTab(tab);
    if (tab === 'fix-plan') {
      setViewMode('category');
      if (!growthData && !growthLoading && hasPaid) loadGrowthStrategy();
      if (!generatedFixes && !fixesRequested.current && hasPaid) loadGeneratedFixes();
    }
    else if (tab === 'ai-perception' && !perceptionQuestions && !perceptionLoading) loadPerceptionQuestions();
  }

  async function loadPerceptionQuestions() {
    if (!data || perceptionLoading) return;
    setPerceptionLoading(true);

    const { audit, pages } = data;
    const domain = audit.site?.domain || 'example.com';
    const name = domain.replace(/\.(com|io|co|org|net)$/, '').replace(/^www\./, '');
    const cap = name.charAt(0).toUpperCase() + name.slice(1);
    const homepage = pages.find((p: { page_type: string }) => p.page_type === 'homepage');
    const h1 = homepage?.h1_text || null;
    const metaDesc = homepage?.meta_description || null;
    const pageTypes = Array.from(new Set(pages.map((p: { page_type: string }) => p.page_type)));
    const hasSchema = pages.some((p: { has_schema: boolean }) => p.has_schema);
    const hasPricingPage = pageTypes.includes('pricing');
    const hasProductPage = pageTypes.includes('product');
    const hasContactPage = pageTypes.includes('contact') || pageTypes.includes('demo');
    const hasBlog = pageTypes.includes('blog') || pageTypes.includes('resource') || pageTypes.includes('docs');
    const hasAbout = pageTypes.includes('about');
    const hasComparison = pageTypes.includes('comparison');
    const hasSecurity = pageTypes.includes('security');
    // Build core questions from scan data
    const coreQuestions: Array<{ question: string; intent: string; what_ai_needs: string; status: 'pass' | 'partial' | 'fail'; assessment: string; fix: string; codeSnippet: string | null }> = [];

    // Q1: What does this company do?
    const hasGoodH1 = h1 && h1.length > 15 && !h1.toLowerCase().includes('welcome') && !h1.toLowerCase().includes('hello');
    const hasGoodMeta = metaDesc && metaDesc.length > 50;
    coreQuestions.push({
      question: `"What is ${cap} and what do they do?"`,
      intent: 'discovery',
      what_ai_needs: 'Clear homepage heading, meta description, and first paragraph explaining the product',
      status: hasGoodH1 && hasGoodMeta && hasProductPage ? 'pass' : hasGoodH1 || hasGoodMeta ? 'partial' : 'fail',
      assessment: hasGoodH1 && hasGoodMeta
        ? `AI would likely describe you as: "${h1}". Your meta description provides additional context: "${(metaDesc || '').substring(0, 100)}…"${hasProductPage ? ' Product pages give AI more detail to work with.' : ''}`
        : hasGoodH1
        ? `AI would see your heading "${h1}" but ${!hasGoodMeta ? 'your meta description is missing or too short to give full context' : ''}. ${!hasProductPage ? 'No product page found for deeper detail.' : ''}`
        : 'AI would struggle to describe your product. Your homepage heading is vague or missing, and there isn\'t enough structured content to form a clear description.',
      fix: !hasGoodH1 ? 'Rewrite your homepage H1 to clearly state what you do and who you serve.' : !hasGoodMeta ? 'Add a meta description (120-155 chars) with your value proposition.' : !hasProductPage ? 'Create a dedicated product page with feature details.' : 'Your core description is solid.',
      codeSnippet: !hasGoodH1 ? `<h1>${cap}: [What you do] for [who you serve]</h1>` : !hasGoodMeta ? `<meta name="description" content="${cap} helps [audience] [solve problem]. [Key differentiator]. Start free today.">` : null,
    });

    // Q2: How much does it cost?
    coreQuestions.push({
      question: `"How much does ${cap} cost?"`,
      intent: 'evaluation',
      what_ai_needs: 'A pricing page with plan names, dollar amounts, and feature tiers in plain HTML text',
      status: hasPricingPage ? 'pass' : 'fail',
      assessment: hasPricingPage
        ? 'AI can find your pricing page and likely extract plan information. Having Offer schema would make pricing even more accessible to AI.'
        : 'AI cannot answer this question. No pricing page was found during the scan. Users asking AI about your pricing will get no answer or be told to visit your website directly.',
      fix: hasPricingPage ? 'Consider adding Offer schema to make pricing machine-readable.' : 'Create a /pricing page with clear plan names, prices, and features in HTML text (not images).',
      codeSnippet: !hasPricingPage ? `<!-- Create ${domain}/pricing -->\n<title>Pricing — ${cap}</title>\n<h1>${cap} Pricing</h1>\n<h2>Free — $0/mo</h2>\n<h2>Pro — $X/mo</h2>` : null,
    });

    // Q3: How do I try / get started?
    coreQuestions.push({
      question: `"How do I try ${cap}?" or "Does ${cap} have a free trial?"`,
      intent: 'use_case',
      what_ai_needs: 'A visible free trial, demo page, or getting-started path with clear CTAs',
      status: hasContactPage ? 'pass' : 'partial',
      assessment: hasContactPage
        ? `AI can find a contact or demo page to direct users to.${hasBlog ? ' Your docs/blog content may also help users understand how to get started.' : ''}`
        : 'AI would have difficulty directing users to try your product. No clear demo, trial, or contact page was found.',
      fix: !hasContactPage ? 'Create a /demo or /contact page. Add prominent "Start Free Trial" or "Book a Demo" CTAs to your homepage.' : 'Your trial path is visible. Consider adding a /getting-started guide for more context.',
      codeSnippet: !hasContactPage ? `<!-- Create ${domain}/demo -->\n<title>Try ${cap} Free — Book a Demo</title>\n<h1>See ${cap} in Action</h1>\n<a href="/signup">Start Free Trial</a>` : null,
    });

    // Q4: Is this company trustworthy/legitimate?
    const trustSignals = [hasAbout, hasSecurity, hasBlog].filter(Boolean).length;
    coreQuestions.push({
      question: `"Is ${cap} legit?" or "Can I trust ${cap}?"`,
      intent: 'evaluation',
      what_ai_needs: 'About page, customer logos, review platform links, privacy policy, social media presence',
      status: trustSignals >= 2 ? 'pass' : trustSignals === 1 ? 'partial' : 'fail',
      assessment: trustSignals >= 2
        ? `AI has several trust signals to reference: ${hasAbout ? 'about page, ' : ''}${hasBlog ? 'content/blog presence, ' : ''}${hasSecurity ? 'security page' : ''}. Adding customer logos and review links would strengthen this further.`
        : trustSignals === 1
        ? `AI has limited trust signals. Only ${hasAbout ? 'an about page' : hasBlog ? 'blog content' : 'a security page'} was found. Missing: ${!hasAbout ? 'about page, ' : ''}${!hasBlog ? 'blog/content, ' : ''}customer logos, review platform links.`
        : 'AI has very few trust signals to work with. No about page, limited content, and no obvious social proof. AI systems may hesitate to recommend you confidently.',
      fix: trustSignals < 2 ? `Create ${!hasAbout ? 'an /about page with your team and mission, ' : ''}${!hasBlog ? 'a blog with expert content, ' : ''}and add customer logos + G2/Capterra links to your homepage.` : 'Consider adding customer testimonials and third-party review links to strengthen trust signals.',
      codeSnippet: !hasAbout ? `<!-- Create ${domain}/about -->\n<title>About ${cap} — Our Mission & Team</title>\n<h1>About ${cap}</h1>\n<p>[Company story, mission, and team]</p>` : null,
    });

    // Q5: How does it compare?
    coreQuestions.push({
      question: `"${cap} vs [competitor]" or "What are alternatives to ${cap}?"`,
      intent: 'evaluation',
      what_ai_needs: 'Comparison pages, feature differentiation content, and clear positioning',
      status: hasComparison ? 'pass' : hasProductPage ? 'partial' : 'fail',
      assessment: hasComparison
        ? 'You have comparison content that AI can reference when users ask about alternatives. This is a strong competitive advantage.'
        : hasProductPage
        ? 'AI can reference your product pages for features, but without dedicated comparison content, competitors with comparison pages may win these queries.'
        : 'AI has no comparison content and limited product detail to work with. When users ask how you compare to alternatives, AI will likely recommend competitors who have comparison pages.',
      fix: !hasComparison ? 'Create comparison pages: /compare/[competitor-name] with feature tables and honest pros/cons.' : 'Your comparison content is a strong asset. Keep it updated as competitors change.',
      codeSnippet: !hasComparison ? `<!-- Create ${domain}/compare/[competitor] -->\n<title>${cap} vs [Competitor] — Honest Comparison</title>\n<h1>${cap} vs [Competitor]</h1>\n<h2>Feature Comparison</h2>\n<!-- Feature-by-feature table -->` : null,
    });

    // Fetch dynamic questions from API
    try {
      const res = await fetch('/api/ai-perception', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain, homepageH1: h1, homepageDescription: metaDesc,
          pageTypes, hasSchema, hasPricing: hasPricingPage, hasComparison,
          industryHints: h1, siteId: audit.site_id,
        }),
      });
      const result = await res.json();
      if (result.questions && Array.isArray(result.questions)) {
        for (const dq of result.questions.slice(0, 3)) {
          coreQuestions.push({
            question: `"${dq.question}"`,
            intent: dq.intent || 'discovery',
            what_ai_needs: dq.what_ai_needs || 'Relevant content on your site',
            status: 'partial',
            assessment: 'This is a question potential buyers may ask AI about your type of product. Having clear, specific content addressing this topic improves your chances of being referenced.',
            fix: dq.what_ai_needs || 'Create content that directly addresses this question.',
            codeSnippet: null,
          });
        }
      }
    } catch { /* API unavailable — core questions are enough */ }

    setPerceptionQuestions(coreQuestions);
    setPerceptionLoading(false);
    // Save to DB so we don't re-generate on subsequent visits
    fetch(`/api/audit/${params.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ perceptionData: coreQuestions }) }).catch(() => {});
  }

  async function loadGrowthStrategy() {
    if (!data || growthLoading) return;
    setGrowthLoading(true);
    try {
      const { audit, pages, recommendations } = data;
      const homepage = pages.find((p: { page_type: string }) => p.page_type === 'homepage');
      const res = await fetch('/api/growth-strategy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: audit.site?.domain,
          vertical: audit.site?.vertical || 'other',
          h1: homepage?.h1_text,
          metaDescription: homepage?.meta_description,
          pageTypes: Array.from(new Set(pages.map((p: { page_type: string }) => p.page_type))),
          scores: {
            overall: audit.overall_score,
            crawl: audit.crawlability_score,
            read: audit.machine_readability_score,
            commercial: audit.commercial_clarity_score,
            trust: audit.trust_clarity_score,
          },
          recommendations: recommendations.map((r: { severity: string; title: string }) => ({ severity: r.severity, title: r.title })),
          siteId: audit.site_id,
        }),
      });
      if (res.ok) {
        const gd = await res.json();
        setGrowthData(gd);
        // Save to DB so we don't re-generate on subsequent visits
        fetch(`/api/audit/${params.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ growthData: gd }) }).catch(() => {});
      }
    } catch { /* skip */ }
    finally { setGrowthLoading(false); }
  }

  async function loadGeneratedFixes() {
    if (!data || fixesRequested.current) return;
    // Check if fixes are already loaded from audit data
    if (data.audit?.generated_fixes && data.audit.generated_fixes.length > 0) {
      setGeneratedFixes(data.audit.generated_fixes);
      fixesRequested.current = true;
      return;
    }
    fixesRequested.current = true;
    setFixesLoading(true);
    try {
      const a = data.audit;
      const p = data.pages;
      const recs = data.recommendations;
      const homepage = p.find((pg) => pg.page_type === 'homepage');
      const res = await fetch('/api/generate-fixes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auditId: a.id,
          siteId: a.site_id,
          domain: a.site?.domain,
          vertical: a.site?.vertical || 'other',
          homepageTitle: homepage?.title,
          homepageH1: homepage?.h1_text,
          homepageDescription: homepage?.meta_description,
          businessDescription: homepage?.meta_description || homepage?.h1_text || '',
          recommendations: recs.map((r) => ({ title: r.title, category: r.category, severity: r.severity })),
          missingPages: [],
          existingPages: p.slice(0, 10).map((pg) => ({ url: pg.url, title: pg.title, pageType: pg.page_type })),
        }),
      });
      const result = await res.json();
      if (res.ok && result.fixes && result.fixes.length > 0) {
        setGeneratedFixes(result.fixes);
        // If server-side DB save failed, persist via PATCH as fallback
        if (!result.saved) {
          fetch(`/api/audit/${params.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ generatedFixes: result.fixes }),
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error('loadGeneratedFixes error:', err);
    } finally {
      setFixesLoading(false);
    }
  }

  // Auto-trigger fix generation when Fix Plan tab is active and user has paid
  useEffect(() => {
    console.log('[fix-plan] useEffect fired, activeTab:', activeTab, 'fixesRequested:', fixesRequested.current);
    if (fixesRequested.current) return;
    if (activeTab === 'fix-plan' && hasPaid && data && !generatedFixes) {
      console.log('[fix-plan] Making generate-fixes request');
      fixesRequested.current = true;
      loadGeneratedFixes();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // animateProjections useEffect removed — card design doesn't need it

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        setIsAuthenticated(!!user);
        const res = await fetch(`/api/audit/${params.id}`);
        if (!res.ok) { setError('Audit not found'); return; }
        const auditData = await res.json();
        setData(auditData);
        setHasPaid(!!auditData.hasEntitlement);
        if (auditData.hasMonitoring) {
          setHasMonitoring(true);
        }
        // Restore previously saved data
        if (auditData.perceptionData) setPerceptionQuestions(auditData.perceptionData);
        if (auditData.growthData) setGrowthData(auditData.growthData);
        if (auditData.audit?.generated_fixes && auditData.audit.generated_fixes.length > 0) {
          setGeneratedFixes(auditData.audit.generated_fixes);
        }
        if (user && auditData.audit && !auditData.audit.user_id) {
          await fetch(`/api/audit/${params.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id }) }).catch(() => {});
        }
      } catch { setError('Failed to load audit'); }
      finally { setLoading(false); }
    }
    load();
  }, [params.id]);

  // Fix generation useEffect is defined after loadGeneratedFixes below

  const allFindings = useMemo(() => {
    if (!data) return [];
    const items: Array<{ id: string; title: string; why: string; fix: string; codeSnippet: string | null; severity: 'high' | 'medium' | 'low'; effort: 'easy' | 'medium' | 'harder'; category: string; affectedUrls: string[]; priorityOrder: number; }> = [];
    const domain = data.audit.site?.domain || 'example.com';
    for (const rec of data.recommendations) {
      items.push({ id: rec.id, title: rec.title, why: rec.why_it_matters, fix: rec.recommended_fix, codeSnippet: generateCodeSnippet(rec.title, domain), severity: rec.severity as 'high' | 'medium' | 'low', effort: rec.effort as 'easy' | 'medium' | 'harder', category: rec.category, affectedUrls: data.findings.find(f => f.title === rec.title)?.affected_urls || [], priorityOrder: rec.priority_order });
    }
    const recTitles = new Set(data.recommendations.map(r => r.title.toLowerCase()));
    const pageIssueMap = new Map<string, string[]>();
    for (const page of data.pages) { for (const issue of page.issues) { if (!pageIssueMap.has(issue)) pageIssueMap.set(issue, []); pageIssueMap.get(issue)!.push(page.url); } }
    for (const [issue, urls] of Array.from(pageIssueMap.entries())) {
      const alreadyCovered = Array.from(recTitles).some(t => t.includes(issue.toLowerCase().substring(0, 20)));
      if (alreadyCovered) continue;
      const detail = getIssueDetail(issue);
      items.push({ id: `pi-${issue.replace(/\s/g, '-')}`, title: issue, why: detail.why, fix: detail.fix, codeSnippet: null, severity: issue.includes('Missing page title') || issue.includes('Missing H1') ? 'medium' : 'low', effort: 'easy', category: detail.category, affectedUrls: urls, priorityOrder: 100 });
    }
    return items;
  }, [data]);

  const filteredFindings = useMemo(() => {
    if (severityFilter === 'all') return allFindings;
    return allFindings.filter(f => f.severity === severityFilter);
  }, [allFindings, severityFilter]);

  const findingsByPage = useMemo(() => {
    if (!data) return new Map<string, typeof allFindings>();
    const map = new Map<string, typeof allFindings>();
    for (const page of data.pages) {
      const pf = filteredFindings.filter(f => f.affectedUrls.includes(page.url) || f.affectedUrls.length === 0);
      if (pf.length > 0) map.set(page.url, pf);
    }
    const sw = filteredFindings.filter(f => f.affectedUrls.length === 0);
    if (sw.length > 0) map.set('__site_wide__', sw);
    return map;
  }, [data, filteredFindings]);

  const findingsByCategory = useMemo(() => {
    const map = new Map<string, typeof allFindings>();
    for (const cat of ['crawlability', 'machine_readability', 'commercial_clarity', 'trust_clarity']) {
      const cf = filteredFindings.filter(f => f.category === cat);
      if (cf.length > 0) map.set(cat, cf);
    }
    return map;
  }, [filteredFindings]);

  const auditDelta = useMemo(() => {
    if (!data?.previousAudit) return null;
    return compareAudits(
      { overall_score: data.audit.overall_score, crawlability_score: data.audit.crawlability_score, machine_readability_score: data.audit.machine_readability_score, commercial_clarity_score: data.audit.commercial_clarity_score, trust_clarity_score: data.audit.trust_clarity_score, findings: data.findings, pages: data.pages },
      { overall_score: data.previousAudit.overall_score, crawlability_score: data.previousAudit.crawlability_score, machine_readability_score: data.previousAudit.machine_readability_score, commercial_clarity_score: data.previousAudit.commercial_clarity_score, trust_clarity_score: data.previousAudit.trust_clarity_score, findings: data.previousAudit.findings, pages: data.previousAudit.pages }
    );
  }, [data]);

  const monthlyActions = useMemo(() => {
    if (!auditDelta || !data) return null;
    return generateMonthlyActions(data.findings, auditDelta);
  }, [data, auditDelta]);

  function togglePage(url: string) { setExpandedPages(prev => { const n = new Set(prev); if (n.has(url)) n.delete(url); else n.add(url); return n; }); }
  function toggleCategory(cat: string) { setExpandedCategories(prev => { const n = new Set(prev); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; }); }
  function toggleCrawler(name: string) { setExpandedCrawlers(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; }); }

  if (loading) return (<div className="max-w-4xl mx-auto px-4 py-20 text-center"><div className="animate-spin w-8 h-8 border-2 rounded-full mx-auto" style={{ borderColor: '#6366F1', borderTopColor: 'transparent' }} /><p className="mt-4" style={{ color: 'var(--text-tertiary)' }}>Loading audit results…</p></div>);
  if (error || !data) return (<div className="max-w-4xl mx-auto px-4 py-20 text-center"><AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" /><p className="mt-4 font-medium" style={{ color: 'var(--text-primary)' }}>{error || 'Something went wrong'}</p><a href="/" className="mt-4 inline-block" style={{ color: '#6366F1' }}>← Try another URL</a></div>);

  const { audit, pages, crawlerStatuses } = data;
  if (audit.status === 'failed') return (<div className="max-w-4xl mx-auto px-4 py-20 text-center"><AlertTriangle className="w-10 h-10 text-red-500 mx-auto" /><h2 className="mt-4 text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Scan failed</h2><p className="mt-2" style={{ color: 'var(--text-secondary)' }}>{audit.summary || 'The site could not be scanned.'}</p><a href="/" className="mt-6 inline-block" style={{ color: '#6366F1' }}>← Try another URL</a></div>);

  const highCount = allFindings.filter(f => f.severity === 'high').length;

  const ctaBanner = (
    <div className="rounded-2xl p-6 mt-6" style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #1a2e4a 50%, #0f2137 100%)', border: '1px solid #2d5a8e' }}>

      {/* Main heading */}
      <h3 className="text-lg font-bold text-white text-center mb-2">
        Take Action On Your Results
      </h3>
      <p className="text-sm text-gray-300 text-center mb-6 max-w-lg mx-auto">
        Your report is ready — now let&apos;s improve your score. Choose how you want to move forward.
      </p>

      {/* Two column layout on larger screens */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Left card — Monitoring upsell */}
        <div className="rounded-xl p-4" style={{ background: '#0f2137', border: '1px solid #2d5a8e' }}>
          <div className="text-sm font-semibold text-white mb-1">🔁 Automated Monthly Monitoring</div>
          <div className="text-xs text-gray-400 mb-3">
            We re-scan your site every month, track your progress, and alert you when your AI visibility score changes.
          </div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-2xl font-bold text-white">$25</span>
              <span className="text-xs text-gray-400">/month</span>
            </div>
            <div className="text-xs text-gray-500 text-right">
              Cancel anytime<br/>No contracts
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="px-2 py-1 rounded-full text-xs" style={{ background: '#1e4d7b', color: '#7dd3fc' }}>Monthly re-scan</span>
            <span className="px-2 py-1 rounded-full text-xs" style={{ background: '#1e4d7b', color: '#7dd3fc' }}>Score tracking</span>
            <span className="px-2 py-1 rounded-full text-xs" style={{ background: '#1e4d7b', color: '#7dd3fc' }}>Change alerts</span>
          </div>
          <button
            onClick={handleStartMonitoring}
            disabled={monitoringLoading || hasMonitoring}
            className="w-full py-2.5 rounded-xl font-semibold text-sm transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            style={{ background: hasMonitoring ? '#1f2937' : 'linear-gradient(135deg, #059669, #0891b2)', color: 'white' }}
          >
            {hasMonitoring ? '✅ Monitoring Active' : monitoringLoading ? 'Redirecting...' : '🚀 Start Monitoring — $25/mo'}
          </button>
        </div>

        {/* Right card — Human help CTA */}
        <div className="rounded-xl p-4" style={{ background: '#0f2137', border: '1px solid #2d5a8e' }}>
          <div className="text-sm font-semibold text-white mb-1">🤝 Work With a Specialist</div>
          <div className="text-xs text-gray-400 mb-3">
            We&apos;ll match you with a vetted tech specialist or marketing strategist who can implement your fixes and improve your AI visibility.
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="px-2 py-1 rounded-full text-xs" style={{ background: '#1e4d7b', color: '#7dd3fc' }}>🔧 Technical fixes</span>
            <span className="px-2 py-1 rounded-full text-xs" style={{ background: '#1e4d7b', color: '#7dd3fc' }}>📈 Strategy session</span>
            <span className="px-2 py-1 rounded-full text-xs" style={{ background: '#1e4d7b', color: '#7dd3fc' }}>📋 Implementation plan</span>
          </div>
          <div className="text-xs text-gray-500 mb-3">
            Free consultation — we review your report and match you with the right person.
          </div>
          {/* TODO: Replace help@aivisibility.io with actual contact email before launch */}
          <a
            href="mailto:help@aivisibility.io?subject=I need help implementing my AI Visibility fixes&body=Hi, I just reviewed my AI Visibility Audit report and would like to discuss options for implementing the recommended fixes."
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl font-semibold text-sm transition-all hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #2563eb, #0891b2)', color: 'white' }}
          >
            📬 Get Matched With a Specialist
          </a>
          <p className="text-xs text-gray-600 text-center mt-2">help@aivisibility.io</p>
        </div>

      </div>

      {/* Print-only fallback for browser print dialogs */}
      <div className="hidden print:block mt-8 p-4 border border-gray-300 rounded text-center">
        <p className="font-bold text-gray-800">Need help implementing these fixes?</p>
        <p className="text-sm text-gray-600 mt-1">Contact us at help@aivisibility.io to get matched with a specialist or start monthly monitoring at $25/mo.</p>
      </div>
    </div>
  );

  function getFindingStateBadge(finding: typeof allFindings[0]) {
    if (!data?.previousAudit) return null;
    const state = classifyFinding(
      { id: finding.id, category: finding.category, severity: finding.severity, title: finding.title, description: finding.why, affected_urls: finding.affectedUrls },
      data.previousAudit.findings
    );
    if (state === 'new') return <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ color: '#3B82F6', background: 'rgba(59,130,246,0.1)' }}>New</span>;
    if (state === 'regressed') return <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ color: '#EF4444', background: 'rgba(239,68,68,0.1)' }}>Regressed</span>;
    return <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)' }}>Ongoing</span>;
  }

  function renderFindingCard(finding: typeof allFindings[0], index?: number) {
    // Look up AI-generated customized fix for this finding
    const customFix = generatedFixes?.find(f => {
      // Strip any "[category]" prefix Claude may have added
      const cleanKey = f.key.replace(/^\[.*?\]\s*/, '').trim();
      const titleLower = finding.title.toLowerCase();
      const keyLower = cleanKey.toLowerCase();
      // Exact match
      if (titleLower === keyLower) return true;
      // Containment match
      if (titleLower.includes(keyLower) || keyLower.includes(titleLower)) return true;
      // First 30 chars match
      if (titleLower.substring(0, 30) === keyLower.substring(0, 30) && titleLower.length > 10) return true;
      return false;
    });
    const snippetToShow = customFix?.implementation || finding.codeSnippet;
    const hasSnippet = !!snippetToShow;
    const isCustom = !!customFix;
    const stateBadge = getFindingStateBadge(finding);
    return (
      <div key={finding.id} className={`rounded-xl border p-5 finding-${finding.severity}`} style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {index !== undefined && <span className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 mt-0.5" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{index + 1}</span>}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{finding.title}</h3>
                {stateBadge}
              </div>
              <div className="mt-2 rounded-lg p-3 border" style={{ background: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.15)' }}>
                <p className="text-sm font-medium" style={{ color: '#F59E0B' }}>Why it matters</p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{finding.why}</p>
              </div>
              <div className="mt-2 rounded-lg p-3 border" style={{ background: 'rgba(99,102,241,0.06)', borderColor: 'rgba(99,102,241,0.15)' }}>
                <p className="text-sm font-medium" style={{ color: '#6366F1' }}>Recommended fix</p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{finding.fix}</p>
              </div>
              {hasSnippet && (
                <div className="mt-3 rounded-lg p-3 overflow-x-auto border" style={{ background: '#0F172A', borderColor: isCustom ? 'rgba(16,185,129,0.3)' : '#1E293B' }}>
                  <div className="flex items-center justify-between mb-2">
                    {isCustom ? (
                      <span className="text-xs font-medium flex items-center gap-1" style={{ color: '#10B981' }}><Code className="w-3 h-3" />Custom implementation for {audit.site?.domain}</span>
                    ) : (
                      <span className="text-xs font-medium flex items-center gap-1" style={{ color: '#818CF8' }}><Code className="w-3 h-3" />Code template:</span>
                    )}
                    <CopyButton text={snippetToShow!} />
                  </div>
                  {isCustom && customFix.explanation && (
                    <p className="text-xs mb-2" style={{ color: '#94A3B8' }}>{customFix.explanation}</p>
                  )}
                  <pre className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: '#E2E8F0', fontFamily: 'var(--font-mono)' }}>{snippetToShow}</pre>
                </div>
              )}
              {finding.affectedUrls.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Affected pages:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {finding.affectedUrls.slice(0, 5).map((url) => { let p = url; try { p = new URL(url).pathname; } catch {} return (<a key={url} href={url} target="_blank" rel="noopener" className="text-xs px-2 py-0.5 rounded truncate max-w-[220px]" style={{ color: '#6366F1', background: 'rgba(99,102,241,0.08)' }} title={url}>{p || '/'}</a>); })}
                    {finding.affectedUrls.length > 5 && <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>+{finding.affectedUrls.length - 5} more</span>}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1.5 shrink-0">
            <SeverityBadge severity={finding.severity} />
            <EffortBadge effort={finding.effort} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      {/* HEADER with breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <div>
          <a href="/dashboard" className="text-xs inline-flex items-center gap-1 mb-1" style={{ color: '#6366F1' }}><ArrowLeft className="w-3 h-3" />Dashboard</a>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>AI Visibility Report</h1>
          <p className="mt-1" style={{ color: 'var(--text-tertiary)' }}>{audit.site?.domain} · {new Date(audit.created_at).toLocaleDateString()}{audit.pages_scanned > 0 && ` · ${audit.pages_scanned} pages`}</p>
        </div>
        <div className="flex items-center gap-2">
          {isAuthenticated && hasPaid && <button onClick={handleExportReport} className="btn-secondary inline-flex items-center gap-2 px-4 py-2 text-sm"><Download className="w-4 h-4" />Export Report</button>}
          <a href="/" className="btn-secondary inline-flex items-center gap-2 px-4 py-2 text-sm"><RefreshCw className="w-4 h-4" />New Audit</a>
        </div>
      </div>

      {/* TAB NAVIGATION — always visible for authenticated users */}
      {isAuthenticated && (
        <div className="flex items-center gap-1 overflow-x-auto mb-6 pb-1 rounded-lg p-1" style={{ background: 'var(--bg-tertiary)' }}>
          {([
            { id: 'overview' as ReportTab, label: 'Overview', icon: LayoutGrid, locked: false },
            { id: 'fix-plan' as ReportTab, label: 'Fix Plan', icon: Wrench, locked: !hasPaid },
            { id: 'ai-perception' as ReportTab, label: 'AI Perception', icon: Eye, locked: !hasPaid },
            { id: 'pages' as ReportTab, label: 'Pages', icon: MonitorSmartphone, locked: !hasPaid },
          ]).map(tab => (
            <button key={tab.id} onClick={() => switchTab(tab.id)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-colors"
              style={{ background: activeTab === tab.id ? 'var(--surface)' : 'transparent', color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-tertiary)', boxShadow: activeTab === tab.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
              <tab.icon className="w-3.5 h-3.5" />{tab.label}
              {tab.locked && <Lock className="w-3 h-3 ml-0.5" style={{ color: 'var(--text-tertiary)' }} />}
            </button>
          ))}
        </div>
      )}

      {/* ===== OVERVIEW TAB ===== */}
      {(!isAuthenticated || activeTab === 'overview') && (<>

      {/* 1. BUSINESS-FRIENDLY SUMMARY — always visible */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {([
          { question: 'Can AI find you?', score: audit.crawlability_score ?? 0, category: 'findability' as const },
          { question: 'Can AI explain what you do?', score: audit.machine_readability_score ?? 0, category: 'explainability' as const },
          { question: 'Can AI help someone buy from you?', score: audit.commercial_clarity_score ?? 0, category: 'buyability' as const },
          { question: 'Can AI trust you?', score: audit.trust_clarity_score ?? 0, category: 'trustworthiness' as const },
        ]).map((item) => {
          const grade = scoreToGrade(item.score);
          const color = getScoreColor(item.score);
          return (
            <div key={item.category} className="card p-5">
              <div className="flex items-start justify-between mb-2">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{item.question}</p>
                <span className="text-lg font-bold shrink-0 ml-3" style={{ color, fontFamily: 'var(--font-mono)' }}>{grade}</span>
              </div>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{getCategoryInterpretation(item.score, item.category)}</p>
            </div>
          );
        })}
      </div>

      {/* SCORE RING */}
      <div className="card p-6 sm:p-8 mb-6">
        <div className="flex flex-col sm:flex-row items-center gap-8">
          <ScoreRing score={audit.overall_score ?? 0} label="Overall Score" size={160} />
          <div className="flex-1 w-full space-y-3">
            <ScoreBar score={audit.crawlability_score ?? 0} label="Findability" />
            <ScoreBar score={audit.machine_readability_score ?? 0} label="Explainability" />
            <ScoreBar score={audit.commercial_clarity_score ?? 0} label="Buyability" />
            <ScoreBar score={audit.trust_clarity_score ?? 0} label="Trustworthiness" />
          </div>
        </div>
      </div>

      {/* ISSUE COUNT + FIX PLAN CTA */}
      <div className="card p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              We found <span className="font-bold">{allFindings.length}</span> issue{allFindings.length !== 1 ? 's' : ''} affecting your AI visibility
              {highCount > 0 && <> · <span className="font-bold" style={{ color: '#EF4444' }}>{highCount} high priority</span></>}
            </p>
          </div>
          {isAuthenticated && (
            <button onClick={() => switchTab('fix-plan')} className="btn-primary px-5 py-2.5 text-sm font-medium inline-flex items-center gap-2 whitespace-nowrap">
              {hasPaid ? 'See Your Fix Plan' : 'Unlock Fix Plan — $50'} <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* COMPETITOR BENCHMARK — paid only, on Overview */}
      {isAuthenticated && hasPaid && growthData && growthData.competitors.length > 0 && (
        <div className="card p-6 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-5 h-5" style={{ color: '#6366F1' }} />
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Peer Benchmark</h2>
          </div>
          <p className="text-sm mb-4" style={{ color: 'var(--text-tertiary)' }}>How your AI visibility compares to likely competitors. Scores are AI-estimated.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--bg-tertiary)' }}>
                  <th className="text-left py-3 px-4 font-medium" style={{ color: 'var(--text-tertiary)' }}>Site</th>
                  <th className="text-center py-3 px-4 font-medium" style={{ color: 'var(--text-tertiary)' }}>Overall</th>
                  <th className="text-center py-3 px-4 font-medium" style={{ color: 'var(--text-tertiary)' }}>Find</th>
                  <th className="text-center py-3 px-4 font-medium" style={{ color: 'var(--text-tertiary)' }}>Explain</th>
                  <th className="text-center py-3 px-4 font-medium" style={{ color: 'var(--text-tertiary)' }}>Buy</th>
                  <th className="text-center py-3 px-4 font-medium" style={{ color: 'var(--text-tertiary)' }}>Trust</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t" style={{ borderColor: 'var(--border)', background: 'rgba(99,102,241,0.04)' }}>
                  <td className="py-3 px-4 font-semibold" style={{ color: '#6366F1' }}>{audit.site?.domain} (you)</td>
                  {[growthData.yourScores.overall, growthData.yourScores.crawl, growthData.yourScores.read, growthData.yourScores.commercial, growthData.yourScores.trust].map((s, i) => (
                    <td key={i} className="py-3 px-4 text-center font-bold" style={{ color: getScoreColor(s), fontFamily: 'var(--font-mono)' }}>{scoreToGrade(s)}</td>
                  ))}
                </tr>
                {growthData.competitors.map((comp) => (
                  <tr key={comp.domain} className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className="py-3 px-4" style={{ color: 'var(--text-primary)' }}>
                      <span>{comp.domain}</span>
                      {comp.rationale && <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{comp.rationale}</p>}
                    </td>
                    {[comp.overall, comp.crawl, comp.read, comp.commercial, comp.trust].map((s, i) => {
                      const yours = [growthData.yourScores.overall, growthData.yourScores.crawl, growthData.yourScores.read, growthData.yourScores.commercial, growthData.yourScores.trust][i];
                      const ahead = s > yours;
                      return (
                        <td key={i} className="py-3 px-4 text-center" style={{ fontFamily: 'var(--font-mono)' }}>
                          <span className="font-bold" style={{ color: getScoreColor(s) }}>{scoreToGrade(s)}</span>
                          {ahead && <span className="text-xs ml-1" style={{ color: '#EF4444' }}>▲</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs mt-3" style={{ color: 'var(--text-tertiary)' }}>Competitor scores are AI-estimated based on public knowledge. ▲ = competitor scores higher.</p>
        </div>
      )}

      {/* KEY PAGES STATUS (vertical-aware) */}
      {isAuthenticated && (() => {
        const siteVertical = audit.site?.vertical || 'other';
        const expectedPages = getExpectedPages(siteVertical);
        const verticalConfig = getVerticalConfig(siteVertical);
        const verticalKeyPages = expectedPages.map((ep) => {
          const scannedPage = pages.find((p) => p.page_type === ep.type);
          return { type: ep.type, label: ep.label, found: !!scannedPage, url: scannedPage?.url || null, why: ep.why };
        });
        const missingPages = verticalKeyPages.filter((kp) => !kp.found);
        return (<>
          <div className="card p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Globe className="w-5 h-5" style={{ color: '#6366F1' }} />
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Key Pages for Your {verticalConfig.label} Site</h2>
            </div>
            <p className="text-sm mb-4" style={{ color: 'var(--text-tertiary)' }}>These are the pages AI needs to accurately describe and recommend your business.{hasPaid ? ' Click any page for details.' : ''}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {verticalKeyPages.map((kp) => (
                <button key={kp.type} onClick={() => hasPaid ? setSelectedKeyPage(kp) : handleCheckout('initial_scan')}
                  className="rounded-lg p-3 border text-left transition-all hover:shadow-md" style={{ borderColor: kp.found ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)', background: kp.found ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)', cursor: 'pointer' }}>
                  <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>{kp.label}</p>
                  <div className="flex items-center justify-between">
                    {kp.found ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-500"><CheckCircle className="w-3.5 h-3.5" />Found</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-500"><XCircle className="w-3.5 h-3.5" />Missing</span>
                    )}
                    {!hasPaid && <Lock className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />}
                  </div>
                </button>
              ))}
            </div>
          </div>
          {hasPaid && missingPages.length > 0 && (
            <div className="card p-6 mb-6">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-5 h-5" style={{ color: '#F59E0B' }} />
                <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Pages Your {verticalConfig.label} Site Needs</h2>
              </div>
              <p className="text-sm mb-4" style={{ color: 'var(--text-tertiary)' }}>{missingPages.length} key page{missingPages.length !== 1 ? 's are' : ' is'} missing.</p>
              <div className="space-y-3">
                {missingPages.slice(0, showAllMissing ? undefined : 3).map((mp) => {
                  const detail = getKeyPageDetail(mp.type, audit.site?.domain || 'example.com');
                  return (
                    <div key={mp.type} className="rounded-lg border p-4" style={{ borderColor: 'rgba(239,68,68,0.15)', background: 'rgba(239,68,68,0.03)' }}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <XCircle className="w-4 h-4 shrink-0 text-red-400" />
                            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{mp.label}</h3>
                          </div>
                          <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>{mp.why}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {detail.whatToInclude.slice(0, 3).map((item, idx) => (
                              <span key={idx} className="text-xs px-2 py-0.5 rounded" style={{ color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)' }}>{item}</span>
                            ))}
                          </div>
                        </div>
                        <button onClick={() => setSelectedKeyPage(mp)} className="shrink-0 text-xs font-medium px-2 py-1 rounded" style={{ color: '#6366F1', background: 'rgba(99,102,241,0.08)' }}>
                          View Details
                        </button>
                      </div>
                    </div>
                  );
                })}
                {missingPages.length > 3 && !showAllMissing && (
                  <button onClick={() => setShowAllMissing(true)} className="text-xs font-medium flex items-center gap-1" style={{ color: '#6366F1' }}>
                    <ChevronDown className="w-3.5 h-3.5" />Show {missingPages.length - 3} more
                  </button>
                )}
                {missingPages.length > 3 && showAllMissing && (
                  <button onClick={() => setShowAllMissing(false)} className="text-xs font-medium flex items-center gap-1" style={{ color: '#6366F1' }}>Show fewer</button>
                )}
              </div>
            </div>
          )}
        </>);
      })()}

      {/* KEY PAGE DETAIL SIDE PANEL */}
      {selectedKeyPage && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setSelectedKeyPage(null)} />
          <div className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[480px] overflow-y-auto" style={{ background: 'var(--surface)', borderLeft: '1px solid var(--border)' }}>
            {(() => {
              const detail = getKeyPageDetail(selectedKeyPage.type, audit.site?.domain || 'example.com');
              return (
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{detail.title}</h3>
                    <button onClick={() => setSelectedKeyPage(null)} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)' }}><X className="w-4 h-4" /></button>
                  </div>
                  <div className="flex items-center gap-2 mb-4">
                    {selectedKeyPage.found ? (
                      <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-500 px-2 py-1 rounded" style={{ background: 'rgba(16,185,129,0.1)' }}><CheckCircle className="w-4 h-4" />Found{selectedKeyPage.url && ` — ${new URL(selectedKeyPage.url).pathname}`}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-sm font-semibold text-red-500 px-2 py-1 rounded" style={{ background: 'rgba(239,68,68,0.1)' }}><XCircle className="w-4 h-4" />Not Found</span>
                    )}
                  </div>
                  <div className="rounded-lg p-4 mb-4 border" style={{ borderColor: 'rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.05)' }}>
                    <p className="text-xs font-semibold mb-1" style={{ color: '#F59E0B' }}>Why This Page Matters for AI</p>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{detail.whyItMatters}</p>
                  </div>
                  <div className="mb-4">
                    <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>What This Page Should Include</p>
                    <div className="space-y-1.5">
                      {detail.whatToInclude.map((detailItem, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: '#6366F1' }} />
                          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{detailItem}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Recommended Code</p>
                      <CopyButton text={detail.exampleCode} />
                    </div>
                    <div className="rounded-lg p-3 overflow-x-auto border" style={{ background: '#0F172A', borderColor: '#1E293B' }}>
                      <pre className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: '#E2E8F0', fontFamily: 'var(--font-mono)' }}>{detail.exampleCode}</pre>
                    </div>
                  </div>
                  {selectedKeyPage.found && selectedKeyPage.url && (
                    <div className="mt-4">
                      <a href={selectedKeyPage.url} target="_blank" rel="noopener" className="text-sm inline-flex items-center gap-1" style={{ color: '#6366F1' }}>
                        View page <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </>
      )}

      <div className="bg-red-600 text-white text-center p-4 text-xl font-bold">
        ⬇️ CTA BANNER BELOW ⬇️
      </div>
      <div style={{ background: 'red', color: 'white', padding: '20px', fontSize: '24px', textAlign: 'center' }}>
        TEST - CTA SHOULD BE BELOW THIS
      </div>
      {ctaBanner}

      </>)}

      {/* ===== FIX PLAN TAB ===== */}
      {isAuthenticated && activeTab === 'fix-plan' && !hasPaid && (
        <>
          <LockedSection
            title="Your Fix Plan"
            description={`We found ${allFindings.length} improvements for your AI visibility. Unlock to see your prioritized fix plan with code snippets and action items.`}
            onCheckout={() => handleCheckout('initial_scan')}
            loading={checkoutLoading}
          />
          {ctaBanner}
        </>
      )}
      {isAuthenticated && activeTab === 'fix-plan' && hasPaid && (<>

      {/* PROJECTED IMPROVEMENT — donut circles per category */}
      {allFindings.length > 0 && (() => {
        const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
        const effortOrder: Record<string, number> = { easy: 0, medium: 1, harder: 2 };
        const top5 = [...allFindings]
          .sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9) || (effortOrder[a.effort] ?? 9) - (effortOrder[b.effort] ?? 9))
          .slice(0, 5);
        const impactMap: Record<string, number> = { high: 10, medium: 5, low: 2 };
        const categoryBoosts: Record<string, number> = {};
        for (const fix of top5) {
          const pts = impactMap[fix.severity] || 3;
          categoryBoosts[fix.category] = (categoryBoosts[fix.category] || 0) + pts;
        }
        const currentScores: Record<string, number> = {
          crawlability: audit.crawlability_score ?? 0, machine_readability: audit.machine_readability_score ?? 0,
          commercial_clarity: audit.commercial_clarity_score ?? 0, trust_clarity: audit.trust_clarity_score ?? 0,
        };
        const projectedScores: Record<string, number> = { ...currentScores };
        for (const [cat] of Object.entries(categoryBoosts)) {
          projectedScores[cat] = Math.min(100, (currentScores[cat] ?? 0) + (categoryBoosts[cat] ?? 0));
        }
        const weights: Record<string, number> = { crawlability: 0.3, machine_readability: 0.25, commercial_clarity: 0.3, trust_clarity: 0.15 };
        const currentOverall = audit.overall_score ?? 0;
        const projectedOverall = Math.min(100, Math.round(Object.entries(weights).reduce((sum, [cat, w]) => sum + (projectedScores[cat] ?? 0) * w, 0)));
        if (projectedOverall <= currentOverall && Object.keys(categoryBoosts).length === 0) return null;

        const totalGain = Math.max(0, projectedOverall - currentOverall);
        const currentGrade = scoreToGrade(currentOverall);
        const projectedGrade = scoreToGrade(projectedOverall);

        // Build the list of items: Overall first, then all 4 categories
        const donutItems: { label: string; current: number; projected: number; gain: number }[] = [
          { label: 'Overall', current: currentOverall, projected: projectedOverall, gain: totalGain },
        ];
        for (const cat of Object.keys(currentScores)) {
          const cur = currentScores[cat] ?? 0;
          const proj = projectedScores[cat] ?? 0;
          donutItems.push({ label: CATEGORY_LABELS[cat] || cat, current: cur, projected: proj, gain: Math.max(0, proj - cur) });
        }

        return (
          <div className="rounded-2xl border p-6 mb-6" style={{ background: '#111827', borderColor: '#374151' }}>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-6">
              Projected Improvement From Your Top 5 Fixes
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
              {donutItems.map((item) => (
                <div key={item.label} className="rounded-xl p-4 text-center" style={{ background: '#1f2937', border: '1px solid #374151' }}>
                  {/* Category label */}
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-3">{item.label}</div>
                  {/* Current grade — muted */}
                  <div className="text-2xl font-bold text-gray-500">{scoreToGrade(item.current)}</div>
                  {/* Gain */}
                  <div className="my-2 text-emerald-400 font-bold text-sm">
                    {item.gain > 0 ? `+${item.gain} pts` : 'Optimized'}
                  </div>
                  {/* Projected grade — bright and prominent */}
                  <div className="text-3xl font-bold text-emerald-400">{scoreToGrade(item.projected)}</div>
                </div>
              ))}
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-xl p-3 text-center" style={{ background: '#1f2937' }}>
                <div className="text-xl font-bold text-emerald-400">+{totalGain}</div>
                <div className="text-xs text-gray-500 mt-0.5">Total Point Gain</div>
              </div>
              <div className="rounded-xl p-3 text-center" style={{ background: '#1f2937' }}>
                <div className="text-xl font-bold text-white">{currentGrade} → {projectedGrade}</div>
                <div className="text-xs text-gray-500 mt-0.5">Grade Jump</div>
              </div>
              <div className="rounded-xl p-3 text-center" style={{ background: '#1f2937' }}>
                <div className="text-xl font-bold text-white">5</div>
                <div className="text-xs text-gray-500 mt-0.5">Fixes Required</div>
              </div>
            </div>

            <p className="text-xs text-gray-600 text-center mt-4">
              Estimates based on issue severity. Actual improvement may vary.
            </p>
          </div>
        );
      })()}

      {/* Generating fixes loading state */}
      {fixesLoading && (
        <div className="mb-4 p-4 rounded-lg border flex items-center gap-3" style={{ background: 'rgba(99,102,241,0.04)', borderColor: 'rgba(99,102,241,0.15)' }}>
          <div className="w-5 h-5 border-2 rounded-full animate-spin shrink-0" style={{ borderColor: '#6366F1', borderTopColor: 'transparent' }} />
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Generating your customized fix plan...</p>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>AI is writing implementation code specific to {audit.site?.domain}</p>
          </div>
        </div>
      )}

      {/* FIX PLAN HEADER — changes since last scan */}
      {auditDelta && (
        <div className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-lg" style={{ background: 'var(--bg-tertiary)' }}>
          <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Since last scan:</span>
          <span className="text-xs font-bold" style={{ color: auditDelta.overallDelta > 0 ? '#10B981' : auditDelta.overallDelta < 0 ? '#EF4444' : 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
            {auditDelta.overallDelta > 0 ? '+' : ''}{auditDelta.overallDelta} overall
          </span>
          {auditDelta.newFindings.length > 0 && <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ color: '#3B82F6', background: 'rgba(59,130,246,0.1)' }}>{auditDelta.newFindings.length} new</span>}
          {auditDelta.resolvedFindings.length > 0 && <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ color: '#10B981', background: 'rgba(16,185,129,0.1)' }}>{auditDelta.resolvedFindings.length} resolved</span>}
          {auditDelta.regressedFindings.length > 0 && <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ color: '#EF4444', background: 'rgba(239,68,68,0.1)' }}>{auditDelta.regressedFindings.length} regressed</span>}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Fix Plan</h2>
        <div className="flex items-center gap-3 text-xs">
          <span style={{ color: 'var(--text-tertiary)' }}>{allFindings.length} improvements</span>
          {highCount > 0 && <span className="px-2 py-0.5 rounded font-medium" style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>{highCount} high</span>}
        </div>
      </div>

      {/* TOP 5 FIXES */}
      {allFindings.length > 0 && (() => {
        const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
        const effortOrder: Record<string, number> = { easy: 0, medium: 1, harder: 2 };
        const top5 = [...allFindings]
          .sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9) || (effortOrder[a.effort] ?? 9) - (effortOrder[b.effort] ?? 9))
          .slice(0, 5);
        const impactMap: Record<string, number> = { high: 10, medium: 5, low: 2 };
        const fixImpacts = top5.map(fix => ({ id: fix.id, points: impactMap[fix.severity] || 3, category: fix.category }));
        return (
          <div className="card p-6 mb-6">
            <div className="flex items-center gap-2 mb-1">
              <Wrench className="w-5 h-5" style={{ color: '#6366F1' }} />
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Top 5 Fixes</h2>
            </div>
            <p className="text-sm mb-4" style={{ color: 'var(--text-tertiary)' }}>Highest-impact improvements, sorted by priority.</p>
            <div className="space-y-3">
              {top5.map((fix, i) => {
                const owner = getFixOwner(fix.title, fix.category);
                const impact = fixImpacts.find(f => f.id === fix.id);
                return (
                  <div key={fix.id} className="flex gap-3 p-3 rounded-lg border" style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border)' }}>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-sm font-bold" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366F1' }}>{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{fix.title}</p>
                      <p className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--text-secondary)' }}>{fix.why}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <SeverityBadge severity={fix.severity} />
                        <EffortBadge effort={fix.effort} />
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ color: owner.color, background: `${owner.color}15` }}>{owner.label}</span>
                        {impact && <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ color: '#10B981', background: 'rgba(16,185,129,0.1)' }}>+{impact.points} {CATEGORY_LABELS[impact.category] || impact.category}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* WHAT TO DO THIS MONTH */}
      {monthlyActions && (monthlyActions.quickWins.length > 0 || monthlyActions.mediumEffort.length > 0 || monthlyActions.strategic.length > 0) && (
        <div className="card p-6 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <CalendarCheck className="w-5 h-5" style={{ color: '#6366F1' }} />
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>What to Do This Month</h2>
          </div>
          <div className="space-y-4 mt-3">
            {monthlyActions.quickWins.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#10B981' }}>Quick Wins</p>
                <div className="space-y-2">
                  {monthlyActions.quickWins.map((f) => (
                    <div key={f.id} className="flex items-center gap-3 p-2.5 rounded-lg" style={{ background: 'var(--bg-tertiary)' }}>
                      <Zap className="w-4 h-4 shrink-0" style={{ color: '#10B981' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{f.title}</p>
                      </div>
                      <SeverityBadge severity={f.severity} />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {monthlyActions.mediumEffort.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#F59E0B' }}>Medium Effort</p>
                <div className="space-y-2">
                  {monthlyActions.mediumEffort.map((f) => (
                    <div key={f.id} className="flex items-center gap-3 p-2.5 rounded-lg" style={{ background: 'var(--bg-tertiary)' }}>
                      <Wrench className="w-4 h-4 shrink-0" style={{ color: '#F59E0B' }} />
                      <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{f.title}</p></div>
                      <SeverityBadge severity={f.severity} />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {monthlyActions.strategic.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#6366F1' }}>Strategic</p>
                <div className="space-y-2">
                  {monthlyActions.strategic.map((f) => (
                    <div key={f.id} className="flex items-center gap-3 p-2.5 rounded-lg" style={{ background: 'var(--bg-tertiary)' }}>
                      <Target className="w-4 h-4 shrink-0" style={{ color: '#6366F1' }} />
                      <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{f.title}</p></div>
                      <SeverityBadge severity={f.severity} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ALL FINDINGS — view toggle */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>All Findings</h2>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ background: 'var(--bg-tertiary)' }}>
              {(['category', 'priority', 'page'] as ViewMode[]).map((mode) => (
                <button key={mode} onClick={() => setViewMode(mode)} className="px-3 py-1.5 text-sm font-medium rounded-md transition-colors" style={{ background: viewMode === mode ? 'var(--surface)' : 'transparent', color: viewMode === mode ? 'var(--text-primary)' : 'var(--text-tertiary)', boxShadow: viewMode === mode ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                  {mode === 'category' ? 'By Category' : mode === 'priority' ? 'By Priority' : 'By Page'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
              <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)} className="text-sm rounded-lg px-3 py-1.5" style={{ background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                <option value="all">All severities</option><option value="high">High only</option><option value="medium">Medium only</option><option value="low">Low only</option>
              </select>
            </div>
          </div>
        </div>

        {viewMode === 'category' && (
          <div className="space-y-3">
            {Array.from(findingsByCategory.entries()).map(([cat, catFindings]) => {
              const isExp = expandedCategories.has(cat);
              const cs = cat === 'crawlability' ? audit.crawlability_score : cat === 'machine_readability' ? audit.machine_readability_score : cat === 'commercial_clarity' ? audit.commercial_clarity_score : audit.trust_clarity_score;
              const catHigh = catFindings.filter(f => f.severity === 'high').length;
              return (
                <div key={cat} className="rounded-xl border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                  <button onClick={() => toggleCategory(cat)} className="w-full flex items-center justify-between p-4 transition-colors text-left">
                    <div className="flex items-center gap-3">
                      {isExp ? <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} /> : <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />}
                      <div>
                        <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{CATEGORY_LABELS[cat] || cat}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{CATEGORY_DESCRIPTIONS[cat]}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {catHigh > 0 && <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>{catHigh} high</span>}
                      <span className="text-sm font-bold" style={{ color: getScoreColor(cs ?? 0), fontFamily: 'var(--font-mono)' }}>{scoreToGrade(cs ?? 0)}</span>
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{catFindings.length} issue{catFindings.length !== 1 ? 's' : ''}</span>
                    </div>
                  </button>
                  {isExp && <div className="border-t p-4 space-y-3" style={{ borderColor: 'var(--border)' }}>{catFindings.map((f, i) => renderFindingCard(f, i))}</div>}
                </div>
              );
            })}
          </div>
        )}

        {viewMode === 'priority' && (
          <div className="space-y-4">
            {[...filteredFindings].sort((a, b) => { const s: Record<string, number> = { high: 0, medium: 1, low: 2 }; return (s[a.severity] - s[b.severity]) || (a.priorityOrder - b.priorityOrder); }).map((finding, i) => renderFindingCard(finding, i))}
          </div>
        )}

        {viewMode === 'page' && (
          <div className="space-y-3">
            {Array.from(findingsByPage.entries()).map(([url, pageFindings]) => {
              const isExp = expandedPages.has(url);
              const page = pages.find(p => p.url === url);
              const isSW = url === '__site_wide__';
              let pageName = isSW ? 'Site-wide issues' : url;
              try { if (!isSW) pageName = page?.title || new URL(url).pathname || url; } catch { /* skip */ }
              return (
                <div key={url} className="rounded-xl border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                  <button onClick={() => togglePage(url)} className="w-full flex items-center justify-between p-4 transition-colors text-left">
                    <div className="flex items-center gap-3 min-w-0">
                      {isExp ? <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} /> : <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />}
                      <div className="min-w-0">
                        <p className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>{pageName}</p>
                        {!isSW && page && <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}><span className="capitalize">{page.page_type}</span>{page.word_count ? ` · ${page.word_count} words` : ''}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {pageFindings.filter(f => f.severity === 'high').length > 0 && <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>{pageFindings.filter(f => f.severity === 'high').length} high</span>}
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{pageFindings.length} issue{pageFindings.length !== 1 ? 's' : ''}</span>
                    </div>
                  </button>
                  {isExp && <div className="border-t p-4 space-y-3" style={{ borderColor: 'var(--border)' }}>{pageFindings.map(f => renderFindingCard(f))}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* AI BOT ACCESS STATUS */}
      {crawlerStatuses && crawlerStatuses.length > 0 && (() => {
        const platformDefs = [
          { id: 'chatgpt', name: 'ChatGPT / OpenAI', question: 'Can people find you through ChatGPT?', bots: ['GPTBot', 'ChatGPT-User'] },
          { id: 'google', name: 'Google AI / Gemini', question: 'Does Google AI reference your content?', bots: ['Google-Extended'] },
          { id: 'claude', name: 'Claude / Anthropic', question: 'Can people find you through Claude?', bots: ['ClaudeBot', 'Anthropic'] },
          { id: 'perplexity', name: 'Perplexity', question: 'Do you show up in Perplexity search?', bots: ['PerplexityBot'] },
          { id: 'others', name: 'Other AI Systems', question: 'Are other AI crawlers allowed?', bots: ['CCBot', 'Amazonbot', 'Meta-ExternalAgent', 'Bytespider'] },
        ];
        const platforms = platformDefs.map((pd) => {
          const bots = pd.bots.map(name => crawlerStatuses.find(c => c.name === name)).filter(Boolean) as CrawlerStatus[];
          const allowedCount = bots.filter(b => b.status === 'allowed').length;
          const blockedCount = bots.filter(b => b.status === 'blocked').length;
          const bestStatus: 'allowed' | 'blocked' | 'no_rule' | 'mixed' = blockedCount > 0 && allowedCount > 0 ? 'mixed' : blockedCount > 0 ? 'blocked' : allowedCount > 0 ? 'allowed' : 'no_rule';
          const avgReadiness = bots.length > 0 ? Math.round(bots.reduce((sum, b) => sum + b.readinessScore, 0) / bots.length) : 0;
          const allBarriers = Array.from(new Set(bots.flatMap(b => b.barriers)));
          const allRecs = Array.from(new Set(bots.flatMap(b => b.recommendations)));
          return { ...pd, bots, status: bestStatus, readiness: avgReadiness, barriers: allBarriers, recommendations: allRecs, allowedCount, totalCount: bots.length };
        });
        return (
          <div className="card p-6 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-5 h-5" style={{ color: '#6366F1' }} />
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>AI Bot Access Status</h2>
            </div>
            <p className="text-sm mb-4" style={{ color: 'var(--text-tertiary)' }}>Which AI systems can access your site? Click any to learn more.</p>
            <div className="space-y-2">
              {platforms.map((p) => {
                const isExp = expandedCrawlers.has(p.id);
                const readColor = getScoreColor(p.readiness);
                return (
                  <div key={p.id} className="rounded-xl border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                    <button onClick={() => toggleCrawler(p.id)} className="w-full flex items-center justify-between p-4 text-left transition-colors" style={{ background: isExp ? 'var(--bg-tertiary)' : 'transparent' }}>
                      <div className="flex items-center gap-3 min-w-0">
                        {isExp ? <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} /> : <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />}
                        <div className="min-w-0">
                          <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{p.name}</span>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{p.question}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {p.id === 'others' ? (
                          <span className="text-xs font-semibold" style={{ color: p.allowedCount === p.totalCount ? '#10B981' : p.allowedCount > 0 ? '#F59E0B' : '#EF4444' }}>{p.allowedCount}/{p.totalCount} allowed</span>
                        ) : (
                          <>
                            {p.status === 'allowed' && <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-500"><CheckCircle className="w-3.5 h-3.5" />Allowed</span>}
                            {p.status === 'blocked' && <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-500"><XCircle className="w-3.5 h-3.5" />Blocked</span>}
                            {p.status === 'mixed' && <span className="text-xs font-semibold" style={{ color: '#F59E0B' }}>Mixed</span>}
                            {p.status === 'no_rule' && <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}><Minus className="w-3.5 h-3.5" />No Rule</span>}
                          </>
                        )}
                        <div className="flex items-center gap-1.5 ml-2">
                          <div className="w-12 h-1.5 rounded-full" style={{ background: 'var(--bg-tertiary)' }}>
                            <div className="h-full rounded-full" style={{ width: `${p.readiness}%`, background: readColor }} />
                          </div>
                          <span className="text-xs font-bold w-7 text-right" style={{ color: readColor, fontFamily: 'var(--font-mono)' }}>{scoreToGrade(p.readiness)}</span>
                        </div>
                      </div>
                    </button>
                    {isExp && (
                      <div className="border-t p-4 space-y-4" style={{ borderColor: 'var(--border)' }}>
                        <div className="space-y-2">
                          {p.bots.map((bot) => (
                            <div key={bot.name} className="flex items-center justify-between p-2.5 rounded-lg" style={{ background: 'var(--bg-tertiary)' }}>
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{bot.displayName}</span>
                                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>— {bot.description}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {bot.status === 'allowed' && <span className="text-xs font-semibold text-emerald-500">Allowed</span>}
                                {bot.status === 'blocked' && <span className="text-xs font-semibold text-red-500">Blocked</span>}
                                {bot.status === 'no_rule' && <span className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>No Rule</span>}
                                <span className="text-xs font-bold" style={{ color: getScoreColor(bot.readinessScore), fontFamily: 'var(--font-mono)' }}>{scoreToGrade(bot.readinessScore)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        {p.barriers.length > 0 && (
                          <div>
                            <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Barriers:</p>
                            {p.barriers.map((b, i) => (
                              <div key={i} className="flex items-start gap-1.5"><XCircle className="w-3 h-3 mt-0.5 shrink-0 text-red-400" /><span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{b}</span></div>
                            ))}
                          </div>
                        )}
                        {p.recommendations.length > 0 && (
                          <div>
                            <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Recommendations:</p>
                            {p.recommendations.map((r, i) => (
                              <div key={i} className="flex items-start gap-1.5"><Zap className="w-3 h-3 mt-0.5 shrink-0" style={{ color: '#6366F1' }} /><span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{r}</span></div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {ctaBanner}

      </>)}


      {/* ===== AI PERCEPTION TAB ===== */}
      {isAuthenticated && activeTab === 'ai-perception' && !hasPaid && (
        <LockedSection
          title="AI Perception Check"
          description="See how AI assistants would answer questions about your business. Find out if ChatGPT, Claude, and Perplexity can accurately describe what you offer."
          onCheckout={() => handleCheckout('initial_scan')}
          loading={checkoutLoading}
        />
      )}

      {isAuthenticated && activeTab === 'ai-perception' && hasPaid && (
      <>
      <div className="card p-6 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Eye className="w-5 h-5" style={{ color: '#6366F1' }} />
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>AI Perception Check</h2>
        </div>
        <p className="text-sm mb-6" style={{ color: 'var(--text-tertiary)' }}>When someone asks an AI assistant about your business, can it answer accurately? We evaluate your site against the questions buyers actually ask.</p>

        {perceptionLoading && (
          <div className="flex items-center gap-3 p-6 rounded-lg" style={{ background: 'var(--bg-tertiary)' }}>
            <div className="animate-spin w-5 h-5 border-2 rounded-full" style={{ borderColor: '#6366F1', borderTopColor: 'transparent' }} />
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Evaluating how AI perceives {audit.site?.domain}…</span>
          </div>
        )}

        {!perceptionQuestions && !perceptionLoading && (
          <div className="text-center p-8 rounded-lg border" style={{ borderColor: 'var(--border)', background: 'var(--bg-tertiary)' }}>
            <Bot className="w-10 h-10 mx-auto mb-3" style={{ color: '#6366F1' }} />
            <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>Click to evaluate how AI assistants would answer questions about your business.</p>
            <button onClick={loadPerceptionQuestions} className="btn-primary px-5 py-2.5 text-sm inline-flex items-center gap-2">
              <Eye className="w-4 h-4" />Run AI Perception Check
            </button>
          </div>
        )}

        {perceptionQuestions && (
          <div>
            {/* Score summary */}
            <div className="flex items-center gap-4 p-4 rounded-lg border mb-4" style={{ borderColor: 'var(--border)', background: 'var(--bg-tertiary)' }}>
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <span className="text-2xl font-bold" style={{ color: '#10B981', fontFamily: 'var(--font-mono)' }}>{perceptionQuestions.filter(q => q.status === 'pass').length}</span>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Can Answer</p>
                </div>
                <div className="text-center">
                  <span className="text-2xl font-bold" style={{ color: '#F59E0B', fontFamily: 'var(--font-mono)' }}>{perceptionQuestions.filter(q => q.status === 'partial').length}</span>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Partially</p>
                </div>
                <div className="text-center">
                  <span className="text-2xl font-bold" style={{ color: '#EF4444', fontFamily: 'var(--font-mono)' }}>{perceptionQuestions.filter(q => q.status === 'fail').length}</span>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Cannot Answer</p>
                </div>
              </div>
              <p className="text-sm ml-4" style={{ color: 'var(--text-secondary)' }}>
                of {perceptionQuestions.length} questions a buyer might ask AI
              </p>
            </div>

            {/* Compact question cards */}
            <div className="space-y-2">
              {perceptionQuestions.map((q, i) => (
                <button key={i} onClick={() => setSelectedPerceptionQ(i)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all hover:shadow-md"
                  style={{ borderColor: selectedPerceptionQ === i ? '#6366F1' : 'var(--border)', background: 'var(--surface)' }}>
                  <div className="shrink-0">
                    {q.status === 'pass' && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                    {q.status === 'partial' && <AlertTriangle className="w-4 h-4" style={{ color: '#F59E0B' }} />}
                    {q.status === 'fail' && <XCircle className="w-4 h-4 text-red-500" />}
                  </div>
                  <p className="flex-1 text-sm truncate" style={{ color: 'var(--text-primary)' }}>{q.question}</p>
                  <span className="text-xs px-1.5 py-0.5 rounded shrink-0" style={{
                    color: q.status === 'pass' ? '#10B981' : q.status === 'partial' ? '#F59E0B' : '#EF4444',
                    background: q.status === 'pass' ? 'rgba(16,185,129,0.1)' : q.status === 'partial' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                  }}>
                    {q.status === 'pass' ? 'Can answer' : q.status === 'partial' ? 'Partial' : 'Cannot answer'}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                </button>
              ))}
            </div>

            <p className="text-xs text-center pt-3" style={{ color: 'var(--text-tertiary)' }}>
              Click any question to see what AI would say and how to improve it.
            </p>
          </div>
        )}
      </div>

      </>
      )}

      {/* PERCEPTION DETAIL SIDE PANEL — at top level */}
      {selectedPerceptionQ !== null && perceptionQuestions && perceptionQuestions[selectedPerceptionQ] && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={(e) => { e.stopPropagation(); setSelectedPerceptionQ(null); }} />
          <div className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[480px] overflow-y-auto" style={{ background: 'var(--surface)', borderLeft: '1px solid var(--border)' }} onClick={(e) => e.stopPropagation()}>
            {(() => {
              const q = perceptionQuestions[selectedPerceptionQ];
              return (
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      {q.status === 'pass' && <CheckCircle className="w-5 h-5 text-emerald-500" />}
                      {q.status === 'partial' && <AlertTriangle className="w-5 h-5" style={{ color: '#F59E0B' }} />}
                      {q.status === 'fail' && <XCircle className="w-5 h-5 text-red-500" />}
                      <span className="text-xs px-2 py-0.5 rounded font-medium" style={{
                        color: q.status === 'pass' ? '#10B981' : q.status === 'partial' ? '#F59E0B' : '#EF4444',
                        background: q.status === 'pass' ? 'rgba(16,185,129,0.1)' : q.status === 'partial' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                      }}>
                        {q.status === 'pass' ? 'AI can answer this' : q.status === 'partial' ? 'Partial answer possible' : 'AI cannot answer this'}
                      </span>
                    </div>
                    <button onClick={() => setSelectedPerceptionQ(null)} className="p-1.5 rounded-lg" style={{ color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)' }}>
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <h3 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{q.question}</h3>
                  <div className="flex items-center gap-2 mb-5">
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)' }}>
                      {q.intent === 'discovery' ? 'Discovery query' : q.intent === 'evaluation' ? 'Evaluation query' : 'Use case query'}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: '#818CF8', background: 'rgba(99,102,241,0.08)' }}>Based on scan data</span>
                  </div>

                  <div className="rounded-lg p-4 mb-4 border" style={{ borderColor: 'var(--border)', background: 'var(--bg-tertiary)' }}>
                    <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>What AI would likely piece together</p>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{q.assessment}</p>
                  </div>

                  <div className="rounded-lg p-4 mb-4 border" style={{ borderColor: 'rgba(245,158,11,0.15)', background: 'rgba(245,158,11,0.04)' }}>
                    <p className="text-xs font-semibold mb-2" style={{ color: '#F59E0B' }}>What AI needs to answer well</p>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{q.what_ai_needs}</p>
                  </div>

                  {q.status !== 'pass' && (
                    <div className="rounded-lg p-4 mb-4 border" style={{ borderColor: 'rgba(99,102,241,0.15)', background: 'rgba(99,102,241,0.04)' }}>
                      <p className="text-xs font-semibold mb-2" style={{ color: '#6366F1' }}>How to fix</p>
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{q.fix}</p>
                    </div>
                  )}

                  {q.codeSnippet && q.status !== 'pass' && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Recommended code</p>
                        <CopyButton text={q.codeSnippet} />
                      </div>
                      <div className="rounded-lg p-3 overflow-x-auto border" style={{ background: '#0F172A', borderColor: '#1E293B' }}>
                        <pre className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: '#E2E8F0', fontFamily: 'var(--font-mono)' }}>{q.codeSnippet}</pre>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-6 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                    <button onClick={() => setSelectedPerceptionQ(Math.max(0, selectedPerceptionQ - 1))} disabled={selectedPerceptionQ === 0}
                      className="text-xs px-3 py-1.5 rounded-lg border" style={{ borderColor: 'var(--border)', color: selectedPerceptionQ === 0 ? 'var(--text-tertiary)' : 'var(--text-secondary)', background: 'var(--bg-tertiary)', opacity: selectedPerceptionQ === 0 ? 0.5 : 1 }}>
                      ← Previous
                    </button>
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{selectedPerceptionQ + 1} of {perceptionQuestions.length}</span>
                    <button onClick={() => setSelectedPerceptionQ(Math.min(perceptionQuestions.length - 1, selectedPerceptionQ + 1))} disabled={selectedPerceptionQ === perceptionQuestions.length - 1}
                      className="text-xs px-3 py-1.5 rounded-lg border" style={{ borderColor: 'var(--border)', color: selectedPerceptionQ === perceptionQuestions.length - 1 ? 'var(--text-tertiary)' : 'var(--text-secondary)', background: 'var(--bg-tertiary)', opacity: selectedPerceptionQ === perceptionQuestions.length - 1 ? 0.5 : 1 }}>
                      Next →
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </>
      )}



      {/* ===== PAGES TAB ===== */}
      {(!isAuthenticated || activeTab === 'pages') && (
      <>
      {/* 8. PAGES ANALYZED */}
      {isAuthenticated && !hasPaid && activeTab === 'pages' && (
        <LockedSection
          title="Detailed Page Analysis"
          description="See how each of your pages performs for AI visibility — titles, schema data, content quality, and page-level issues."
          onCheckout={() => handleCheckout('initial_scan')}
          loading={checkoutLoading}
        />
      )}
      {isAuthenticated && hasPaid && pages.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Pages Analyzed</h2>
          <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr style={{ background: 'var(--bg-tertiary)' }}><th className="text-left py-3 px-4 font-medium" style={{ color: 'var(--text-tertiary)' }}>Page</th><th className="text-left py-3 px-4 font-medium" style={{ color: 'var(--text-tertiary)' }}>Type</th><th className="text-center py-3 px-4 font-medium" style={{ color: 'var(--text-tertiary)' }}>Schema</th><th className="text-center py-3 px-4 font-medium" style={{ color: 'var(--text-tertiary)' }}>Issues</th><th className="text-right py-3 px-4 font-medium" style={{ color: 'var(--text-tertiary)' }}>Load Time</th></tr></thead>
                <tbody>
                  {pages.map((page) => (
                    <tr key={page.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                      <td className="py-3 px-4"><div className="flex items-center gap-1.5 max-w-xs"><span className="truncate font-medium" style={{ color: 'var(--text-primary)' }} title={page.url}>{page.title || new URL(page.url).pathname}</span><a href={page.url} target="_blank" rel="noopener" style={{ color: 'var(--text-tertiary)' }}><ExternalLink className="w-3.5 h-3.5" /></a></div></td>
                      <td className="py-3 px-4"><span className="inline-flex px-2 py-0.5 text-xs rounded capitalize" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>{page.page_type}</span></td>
                      <td className="py-3 px-4 text-center">{page.has_schema ? <CheckCircle className="w-4 h-4 text-emerald-500 mx-auto" /> : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}</td>
                      <td className="py-3 px-4 text-center">{page.issues.length > 0 ? <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold" style={{ background: 'rgba(245,158,11,0.15)', color: '#FBBF24' }}>{page.issues.length}</span> : <CheckCircle className="w-4 h-4 text-emerald-500 mx-auto" />}</td>
                      <td className="py-3 px-4 text-right" style={{ color: 'var(--text-secondary)' }}>{page.load_time_ms ? `${(page.load_time_ms / 1000).toFixed(1)}s` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Pages teaser for unauthenticated */}
      {!isAuthenticated && pages.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Pages Analyzed</h2>
          <div className="card p-6 text-center">
            <FileText className="w-8 h-8 mx-auto" style={{ color: 'var(--text-tertiary)' }} />
            <p className="mt-3" style={{ color: 'var(--text-secondary)' }}>We scanned {pages.length} pages. <a href={`/auth/signup?redirect=/audit/${audit.id}`} className="font-medium" style={{ color: '#6366F1' }}>Sign up free</a> to see the full breakdown.</p>
          </div>
        </div>
      )}

      {/* CTA banner — always visible for unauthenticated users at bottom of landing state */}
      {!isAuthenticated && ctaBanner}
      </>
      )}
    </div>
  );
}
