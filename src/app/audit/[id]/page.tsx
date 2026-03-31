'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import ScoreRing, { ScoreBar } from '@/components/ScoreRing';
import SeverityBadge, { EffortBadge } from '@/components/SeverityBadge';
import { Lock, ArrowRight, ArrowLeft, CheckCircle, XCircle, ExternalLink, FileText, AlertTriangle, RefreshCw, ChevronDown, ChevronRight, Filter, Shield, Code, Eye, Bot, Copy, Check, Globe, Minus, LayoutGrid, Wrench, Zap, MonitorSmartphone, X, Download } from 'lucide-react';

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
    id: string; status: string; overall_score: number | null;
    crawlability_score: number | null; machine_readability_score: number | null;
    commercial_clarity_score: number | null; trust_clarity_score: number | null;
    pages_scanned: number; summary: string | null; created_at: string;
    completed_at: string | null; site: { domain: string; url: string };
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
}

type ViewMode = 'priority' | 'page' | 'category';
type SeverityFilter = 'all' | 'high' | 'medium' | 'low';
type ReportTab = 'overview' | 'diagnostics' | 'action-plan' | 'ai-sees' | 'pages';

const FREE_RECOMMENDATION_LIMIT = 3;

const CATEGORY_LABELS: Record<string, string> = {
  crawlability: 'Crawlability', machine_readability: 'Machine Readability',
  commercial_clarity: 'Commercial Page Clarity', trust_clarity: 'Trust & Source Clarity',
};
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  crawlability: 'Can AI crawlers access and navigate your site?',
  machine_readability: 'Can AI systems understand your page content?',
  commercial_clarity: 'Are your key commercial pages structured for AI discovery?',
  trust_clarity: 'Does your site establish trust and authority signals?',
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
function generateAiSummary(audit: AuditData['audit'], crawlerStatuses: CrawlerStatus[], keyPagesStatus: KeyPageStatus[], findingsCount: number, highCount: number): string {
  const domain = audit.site?.domain || 'this site';
  const score = audit.overall_score ?? 0;
  const parts: string[] = [];

  // Overall assessment
  if (score >= 80) parts.push(`${domain} has strong AI visibility with a score of ${score}/100. AI systems can likely find and reference most of your key content.`);
  else if (score >= 60) parts.push(`${domain} has moderate AI visibility with a score of ${score}/100. AI systems can find your site, but several improvements would help them better understand and recommend your product.`);
  else if (score >= 40) parts.push(`${domain} has limited AI visibility with a score of ${score}/100. AI systems may struggle to accurately describe your product or recommend it to users.`);
  else parts.push(`${domain} has poor AI visibility with a score of ${score}/100. AI systems likely cannot find or accurately reference most of your key content. Immediate action is needed.`);

  // Crawler access
  const blocked = crawlerStatuses?.filter(c => c.status === 'blocked') || [];
  const allowed = crawlerStatuses?.filter(c => c.status === 'allowed') || [];
  if (blocked.length > 0) parts.push(`${blocked.length} AI crawler(s) are actively blocked, including ${blocked.slice(0, 3).map(b => b.displayName).join(', ')}. These systems cannot access your site at all.`);
  else if (allowed.length > 0) parts.push(`AI crawlers have access to your site, which is good.`);

  // Missing pages
  const missing = keyPagesStatus?.filter(kp => !kp.found) || [];
  if (missing.length > 0) parts.push(`Key pages missing: ${missing.map(m => m.label).join(', ')}. Without these, AI cannot answer common buyer questions about your product.`);

  // Issues
  if (highCount > 0) parts.push(`There are ${highCount} high-priority issues that should be addressed first to significantly improve how AI systems perceive and recommend ${domain}.`);

  // Next steps
  const steps: string[] = [];
  if (highCount > 0) steps.push('Review the Diagnostics tab to see all findings by category');
  if (missing.length > 0) steps.push('Click any missing page above to see what to create and example code');
  steps.push('Use the Action Plan tab for a prioritized list of fixes with copy-paste code');
  if (blocked.length > 0) steps.push('Check AI Source Visibility below — some AI systems are blocked and need robots.txt changes');
  steps.push('Export this report to share with your team using the download button');
  parts.push('Next steps: ' + steps.join('. ') + '.');

  return parts.join('\n\n');
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
<div class="score-num">${score}/100</div>
<p style="color:#64748b;margin:8px 0 16px">Overall AI Visibility Score</p>
<div class="score-bar"><span class="score-bar-label">Crawlability</span><div class="score-bar-track"><div class="score-bar-fill" style="width:${audit.crawlability_score ?? 0}%;background:${(audit.crawlability_score ?? 0) >= 80 ? '#10B981' : (audit.crawlability_score ?? 0) >= 50 ? '#F59E0B' : '#EF4444'}"></div></div><span style="font-weight:600;width:30px;text-align:right">${audit.crawlability_score ?? 0}</span></div>
<div class="score-bar"><span class="score-bar-label">Readability</span><div class="score-bar-track"><div class="score-bar-fill" style="width:${audit.machine_readability_score ?? 0}%;background:${(audit.machine_readability_score ?? 0) >= 80 ? '#10B981' : (audit.machine_readability_score ?? 0) >= 50 ? '#F59E0B' : '#EF4444'}"></div></div><span style="font-weight:600;width:30px;text-align:right">${audit.machine_readability_score ?? 0}</span></div>
<div class="score-bar"><span class="score-bar-label">Commercial</span><div class="score-bar-track"><div class="score-bar-fill" style="width:${audit.commercial_clarity_score ?? 0}%;background:${(audit.commercial_clarity_score ?? 0) >= 80 ? '#10B981' : (audit.commercial_clarity_score ?? 0) >= 50 ? '#F59E0B' : '#EF4444'}"></div></div><span style="font-weight:600;width:30px;text-align:right">${audit.commercial_clarity_score ?? 0}</span></div>
<div class="score-bar"><span class="score-bar-label">Trust</span><div class="score-bar-track"><div class="score-bar-fill" style="width:${audit.trust_clarity_score ?? 0}%;background:${(audit.trust_clarity_score ?? 0) >= 80 ? '#10B981' : (audit.trust_clarity_score ?? 0) >= 50 ? '#F59E0B' : '#EF4444'}"></div></div><span style="font-weight:600;width:30px;text-align:right">${audit.trust_clarity_score ?? 0}</span></div>
</div>

<p>${score >= 80 ? 'Your site has strong AI visibility.' : score >= 60 ? 'Your site has moderate AI visibility with clear areas for improvement.' : score >= 40 ? 'Your site has limited AI visibility. AI systems may struggle to accurately describe or recommend your product.' : 'Your site has poor AI visibility. Immediate action is needed to ensure AI systems can find and reference your content.'} We identified ${highRecs.length} high-priority, ${medRecs.length} medium-priority, and ${lowRecs.length} low-priority findings across ${pages.length} scanned pages.</p>

<h2>Methodology</h2>
<p>This audit scanned ${pages.length} pages on ${domain} using 100+ automated checks across four categories: Crawlability (can AI systems access your site?), Machine Readability (can they understand it?), Commercial Page Clarity (can they help someone buy?), and Trust & Source Clarity (can they trust and recommend you?). Each page was analyzed for technical SEO signals, structured data, content quality, and commercial clarity.</p>

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
// Main component
// ============================================================
export default function AuditResultPage() {
  const params = useParams();
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('category');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedCrawlers, setExpandedCrawlers] = useState<Set<string>>(new Set());
  const [selectedKeyPage, setSelectedKeyPage] = useState<KeyPageStatus | null>(null);

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
  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ReportTab>('overview');

  function switchTab(tab: ReportTab) {
    setActiveTab(tab);
    if (tab === 'diagnostics') setViewMode('category');
    else if (tab === 'action-plan') setViewMode('priority');
  }

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
        if (user && auditData.audit && !auditData.audit.user_id) {
          await fetch(`/api/audit/${params.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id }) }).catch(() => {});
        }
      } catch { setError('Failed to load audit'); }
      finally { setLoading(false); }
    }
    load();
  }, [params.id]);

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

  function togglePage(url: string) { setExpandedPages(prev => { const n = new Set(prev); if (n.has(url)) n.delete(url); else n.add(url); return n; }); }
  function toggleCategory(cat: string) { setExpandedCategories(prev => { const n = new Set(prev); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; }); }
  function toggleCrawler(name: string) { setExpandedCrawlers(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; }); }

  if (loading) return (<div className="max-w-4xl mx-auto px-4 py-20 text-center"><div className="animate-spin w-8 h-8 border-2 rounded-full mx-auto" style={{ borderColor: '#6366F1', borderTopColor: 'transparent' }} /><p className="mt-4" style={{ color: 'var(--text-tertiary)' }}>Loading audit results…</p></div>);
  if (error || !data) return (<div className="max-w-4xl mx-auto px-4 py-20 text-center"><AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" /><p className="mt-4 font-medium" style={{ color: 'var(--text-primary)' }}>{error || 'Something went wrong'}</p><a href="/" className="mt-4 inline-block" style={{ color: '#6366F1' }}>← Try another URL</a></div>);

  const { audit, pages, recommendations, crawlerStatuses, keyPagesStatus, pagePreviews } = data;
  if (audit.status === 'failed') return (<div className="max-w-4xl mx-auto px-4 py-20 text-center"><AlertTriangle className="w-10 h-10 text-red-500 mx-auto" /><h2 className="mt-4 text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Scan failed</h2><p className="mt-2" style={{ color: 'var(--text-secondary)' }}>{audit.summary || 'The site could not be scanned.'}</p><a href="/" className="mt-6 inline-block" style={{ color: '#6366F1' }}>← Try another URL</a></div>);

  const visibleRecs = isAuthenticated ? recommendations : recommendations.slice(0, FREE_RECOMMENDATION_LIMIT);
  const gatedCount = recommendations.length - FREE_RECOMMENDATION_LIMIT;
  const highCount = allFindings.filter(f => f.severity === 'high').length;
  const medCount = allFindings.filter(f => f.severity === 'medium').length;
  const lowCount = allFindings.filter(f => f.severity === 'low').length;

  function renderFindingCard(finding: typeof allFindings[0], index?: number) {
    const hasSnippet = !!finding.codeSnippet;
    return (
      <div key={finding.id} className={`rounded-xl border p-5 finding-${finding.severity}`} style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {index !== undefined && <span className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 mt-0.5" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{index + 1}</span>}
            <div className="min-w-0">
              <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{finding.title}</h3>
              <div className="mt-2 rounded-lg p-3 border" style={{ background: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.15)' }}>
                <p className="text-sm font-medium" style={{ color: '#F59E0B' }}>Why it matters</p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{finding.why}</p>
              </div>
              <div className="mt-2 rounded-lg p-3 border" style={{ background: 'rgba(99,102,241,0.06)', borderColor: 'rgba(99,102,241,0.15)' }}>
                <p className="text-sm font-medium" style={{ color: '#6366F1' }}>Recommended fix</p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{finding.fix}</p>
              </div>
              {hasSnippet && (
                <div className="mt-3 rounded-lg p-3 overflow-x-auto border" style={{ background: '#0F172A', borderColor: '#1E293B' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium flex items-center gap-1" style={{ color: '#818CF8' }}><Code className="w-3 h-3" />Copy &amp; paste this code:</span>
                    <CopyButton text={finding.codeSnippet!} />
                  </div>
                  <pre className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: '#E2E8F0', fontFamily: 'var(--font-mono)' }}>{finding.codeSnippet}</pre>
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
          {isAuthenticated && <button onClick={handleExportReport} className="btn-secondary inline-flex items-center gap-2 px-4 py-2 text-sm"><Download className="w-4 h-4" />Export Report</button>}
          <a href="/" className="btn-secondary inline-flex items-center gap-2 px-4 py-2 text-sm"><RefreshCw className="w-4 h-4" />New Audit</a>
        </div>
      </div>

      {/* TAB NAVIGATION */}
      {isAuthenticated && (
        <div className="flex items-center gap-1 overflow-x-auto mb-6 pb-1 rounded-lg p-1" style={{ background: 'var(--bg-tertiary)' }}>
          {([
            { id: 'overview' as ReportTab, label: 'Overview', icon: LayoutGrid },
            { id: 'diagnostics' as ReportTab, label: 'Diagnostics', icon: Wrench },
            { id: 'action-plan' as ReportTab, label: 'Action Plan', icon: Zap },
            { id: 'ai-sees' as ReportTab, label: 'What AI Sees', icon: Eye },
            { id: 'pages' as ReportTab, label: 'Pages', icon: MonitorSmartphone },
          ]).map(tab => (
            <button key={tab.id} onClick={() => switchTab(tab.id)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-colors"
              style={{ background: activeTab === tab.id ? 'var(--surface)' : 'transparent', color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-tertiary)', boxShadow: activeTab === tab.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
              <tab.icon className="w-3.5 h-3.5" />{tab.label}
            </button>
          ))}
        </div>
      )}

      {/* ===== OVERVIEW TAB ===== */}
      {(!isAuthenticated || activeTab === 'overview') && (<>
      {/* 2. SCORE OVERVIEW (graph) */}
      <div className="card p-6 sm:p-8 mb-6">
        <div className="flex flex-col sm:flex-row items-center gap-8">
          <ScoreRing score={audit.overall_score ?? 0} label="Overall Score" size={160} />
          <div className="flex-1 w-full space-y-3">
            <ScoreBar score={audit.crawlability_score ?? 0} label="Crawlability" />
            <ScoreBar score={audit.machine_readability_score ?? 0} label="Readability" />
            <ScoreBar score={audit.commercial_clarity_score ?? 0} label="Commercial" />
            <ScoreBar score={audit.trust_clarity_score ?? 0} label="Trust" />
          </div>
        </div>
      </div>

      {/* 3. AI VISIBILITY SUMMARY */}
      {isAuthenticated && (
        <div className="card p-6 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Bot className="w-5 h-5" style={{ color: '#6366F1' }} />
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>AI Visibility Summary</h2>
          </div>
          <div className="p-4 rounded-lg border" style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border)' }}>
            <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
              {generateAiSummary(audit, crawlerStatuses || [], keyPagesStatus || [], allFindings.length, highCount)}
            </p>
          </div>
        </div>
      )}
      {!isAuthenticated && audit.summary && (
        <div className="card p-4 mb-6">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{audit.summary}</p>
        </div>
      )}

      {/* 4. KEY PAGES STATUS */}
      {isAuthenticated && keyPagesStatus && keyPagesStatus.length > 0 && (
        <div className="card p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="w-5 h-5" style={{ color: '#6366F1' }} />
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Key Pages Status</h2>
          </div>
          <p className="text-sm mb-4" style={{ color: 'var(--text-tertiary)' }}>Can AI find the pages that matter most? Click any missing page for details and recommended code.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {keyPagesStatus.map((kp) => (
              <button key={kp.type} onClick={() => setSelectedKeyPage(kp)}
                className="rounded-lg p-3 border text-left transition-all hover:shadow-md" style={{ borderColor: kp.found ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)', background: kp.found ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)', cursor: 'pointer' }}>
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>{kp.label}</p>
                {kp.found ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-500"><CheckCircle className="w-3.5 h-3.5" />Found</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-500"><XCircle className="w-3.5 h-3.5" />Missing</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

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
                      {detail.whatToInclude.map((item, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: '#6366F1' }} />
                          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{item}</span>
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

      {/* 5. AI SOURCE VISIBILITY */}
      {isAuthenticated && crawlerStatuses && crawlerStatuses.length > 0 && (
        <div className="card p-6 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-5 h-5" style={{ color: '#6366F1' }} />
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>AI Source Visibility</h2>
          </div>
          <p className="text-sm mb-4" style={{ color: 'var(--text-tertiary)' }}>How visible and useful your site is to each AI system. Click any source for details.</p>
          <div className="space-y-2">
            {crawlerStatuses.map((c) => {
              const isExp = expandedCrawlers.has(c.name);
              const readColor = c.readinessScore >= 75 ? '#10B981' : c.readinessScore >= 50 ? '#F59E0B' : '#EF4444';
              return (
                <div key={c.name} className="rounded-xl border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                  {/* Collapsed card */}
                  <button onClick={() => toggleCrawler(c.name)} className="w-full flex items-center justify-between p-4 text-left transition-colors" style={{ background: isExp ? 'var(--bg-tertiary)' : 'transparent' }}>
                    <div className="flex items-center gap-3 min-w-0">
                      {isExp ? <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} /> : <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{c.displayName}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)' }}>{c.operator}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: c.visibilityValue === 'search_citation' ? '#6366F1' : c.visibilityValue === 'assistant_browsing' ? '#F59E0B' : '#64748B', background: c.visibilityValue === 'search_citation' ? 'rgba(99,102,241,0.1)' : c.visibilityValue === 'assistant_browsing' ? 'rgba(245,158,11,0.1)' : 'var(--bg-tertiary)' }}>{c.visibilityLabel}</span>
                        </div>
                        {c.barriers.length > 0 && !isExp && <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-tertiary)' }}>{c.barriers[0]}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {c.status === 'allowed' && <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-500"><CheckCircle className="w-3.5 h-3.5" />Allowed</span>}
                      {c.status === 'blocked' && <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-500"><XCircle className="w-3.5 h-3.5" />Blocked</span>}
                      {c.status === 'no_rule' && <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}><Minus className="w-3.5 h-3.5" />No Rule</span>}
                      <div className="flex items-center gap-1.5 ml-2">
                        <div className="w-12 h-1.5 rounded-full" style={{ background: 'var(--bg-tertiary)' }}>
                          <div className="h-full rounded-full" style={{ width: `${c.readinessScore}%`, background: readColor }} />
                        </div>
                        <span className="text-xs font-bold w-7 text-right" style={{ color: readColor, fontFamily: 'var(--font-mono)' }}>{c.readinessScore}</span>
                      </div>
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isExp && (
                    <div className="border-t p-4 space-y-4" style={{ borderColor: 'var(--border)' }}>
                      {/* About this source */}
                      <div>
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{c.description}</p>
                        <span className="inline-flex items-center gap-1 text-xs mt-1.5 px-1.5 py-0.5 rounded" style={{ color: '#818CF8', background: 'rgba(99,102,241,0.08)' }}>Inferred context</span>
                      </div>

                      {/* Access Status */}
                      <div className="rounded-lg p-3 border" style={{ borderColor: 'var(--border)', background: 'var(--bg-tertiary)' }}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Access Status</span>
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: '#10B981', background: 'rgba(16,185,129,0.08)' }}>Observed</span>
                        </div>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{c.statusDetail}</p>
                      </div>

                      {/* Detection Status — placeholder */}
                      <div className="rounded-lg p-3 border" style={{ borderColor: 'var(--border)', background: 'var(--bg-tertiary)' }}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Detection Status</span>
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}>Not yet measured</span>
                        </div>
                        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Actual visit detection requires server log monitoring. This will be available in a future update.</p>
                      </div>

                      {/* Readiness for this source */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Site Readiness for {c.displayName}</span>
                            <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: '#F59E0B', background: 'rgba(245,158,11,0.08)' }}>Measured + Inferred</span>
                          </div>
                          <span className="text-sm font-bold" style={{ color: readColor, fontFamily: 'var(--font-mono)' }}>{c.readinessScore}/100</span>
                        </div>
                        <div className="w-full h-2 rounded-full mb-3" style={{ background: 'var(--bg-tertiary)' }}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${c.readinessScore}%`, background: readColor }} />
                        </div>
                        {c.barriers.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Barriers:</p>
                            {c.barriers.map((b, i) => (
                              <div key={i} className="flex items-start gap-1.5">
                                <XCircle className="w-3 h-3 mt-0.5 shrink-0 text-red-400" />
                                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{b}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {c.barriers.length === 0 && (
                          <p className="text-xs" style={{ color: '#10B981' }}>No significant barriers detected for this source.</p>
                        )}
                      </div>

                      {/* Source-specific recommendations */}
                      {c.recommendations.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Recommendations for {c.displayName}</span>
                            <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: '#F59E0B', background: 'rgba(245,158,11,0.08)' }}>Inferred</span>
                          </div>
                          <div className="space-y-1.5">
                            {c.recommendations.map((r, i) => (
                              <div key={i} className="flex items-start gap-1.5">
                                <Zap className="w-3 h-3 mt-0.5 shrink-0" style={{ color: '#6366F1' }} />
                                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{r}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      </>)}

      {/* ===== WHAT AI SEES TAB ===== */}
      {isAuthenticated && activeTab === 'ai-sees' && (
      <>
      {/* 6. WHAT AI CRAWLERS SEE */}
      {isAuthenticated && pagePreviews && pagePreviews.length > 0 && (
        <div className="card p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Eye className="w-5 h-5" style={{ color: '#6366F1' }} />
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>What AI Crawlers See</h2>
          </div>
          <p className="text-sm mb-4" style={{ color: 'var(--text-tertiary)' }}>What bots read when they visit your pages — no JavaScript rendering. Select a page to see what AI sees and what to improve.</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {pagePreviews.slice(0, 10).map((pp) => {
              let path = pp.url; try { path = new URL(pp.url).pathname || '/'; } catch {}
              return (
                <button key={pp.url} onClick={() => setActivePreviewUrl(activePreviewUrl === pp.url ? null : pp.url)}
                  className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
                  style={{ borderColor: activePreviewUrl === pp.url ? '#6366F1' : 'var(--border)', background: activePreviewUrl === pp.url ? 'rgba(99,102,241,0.1)' : 'var(--bg-tertiary)', color: activePreviewUrl === pp.url ? '#6366F1' : 'var(--text-secondary)' }}>
                  {path}
                </button>
              );
            })}
          </div>
          {activePreviewUrl && (() => {
            const pp = pagePreviews.find(p => p.url === activePreviewUrl);
            if (!pp) return null;
            const pageIssues = pages.find(p => p.url === activePreviewUrl)?.issues || [];
            return (
              <div>
                <div className="rounded-lg p-4 border font-mono text-xs leading-relaxed mb-3" style={{ background: '#0F172A', borderColor: '#1E293B', color: '#E2E8F0' }}>
                  <div><span style={{ color: '#6366F1' }}>Title:</span> {pp.title}</div>
                  <div><span style={{ color: '#6366F1' }}>Meta:</span> {pp.metaDescription}</div>
                  <div><span style={{ color: '#6366F1' }}>H1:</span> {pp.h1}</div>
                  <div><span style={{ color: '#6366F1' }}>Schema:</span> {pp.schemaTypes.length > 0 ? pp.schemaTypes.join(', ') : 'none'}</div>
                  <div><span style={{ color: '#6366F1' }}>Words:</span> {pp.wordCount || 'unknown'}</div>
                </div>
                {pageIssues.length > 0 && (
                  <div className="rounded-lg p-4 border" style={{ borderColor: 'rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.05)' }}>
                    <p className="text-xs font-semibold mb-3" style={{ color: '#F59E0B' }}>Recommendations for this page:</p>
                    <div className="space-y-3">
                      {pageIssues.map((issue, i) => {
                        const detail = getIssueDetail(issue);
                        const snippet = generateCodeSnippet(issue, audit.site?.domain || 'example.com');
                        return (
                          <div key={i}>
                            <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}><strong style={{ color: 'var(--text-primary)' }}>{issue}</strong> — {detail.fix}</p>
                            {snippet && (
                              <div className="rounded-md p-2.5 mt-1.5 border overflow-x-auto" style={{ background: '#0F172A', borderColor: '#1E293B' }}>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs" style={{ color: '#818CF8' }}>Suggested code:</span>
                                  <CopyButton text={snippet} />
                                </div>
                                <pre className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: '#E2E8F0', fontFamily: 'var(--font-mono)' }}>{snippet}</pre>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {pageIssues.length === 0 && (
                  <div className="rounded-lg p-3 border" style={{ borderColor: 'rgba(16,185,129,0.2)', background: 'rgba(16,185,129,0.05)' }}>
                    <p className="text-xs font-semibold" style={{ color: '#10B981' }}>✓ This page looks good — no issues found for AI crawlers.</p>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      </>
      )}

      {/* ===== DIAGNOSTICS + ACTION PLAN TABS ===== */}
      {(!isAuthenticated || activeTab === 'diagnostics' || activeTab === 'action-plan') && (
      <>
      {/* 7. DETAILED FINDINGS */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{isAuthenticated ? 'Detailed Findings' : 'Top Recommendations'}</h2>
          <div className="flex items-center gap-3 text-xs">
            {highCount > 0 && <span className="px-2 py-0.5 rounded font-medium" style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}>{highCount} high</span>}
            {medCount > 0 && <span className="px-2 py-0.5 rounded font-medium" style={{ background: 'rgba(245,158,11,0.1)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.2)' }}>{medCount} medium</span>}
            {lowCount > 0 && <span className="px-2 py-0.5 rounded font-medium" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366F1', border: '1px solid rgba(99,102,241,0.2)' }}>{lowCount} low</span>}
          </div>
        </div>

        {/* View toggle and filters */}
        {isAuthenticated && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
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
                <option value="all">All severities</option>
                <option value="high">High only</option>
                <option value="medium">Medium only</option>
                <option value="low">Low only</option>
              </select>
            </div>
          </div>
        )}

        {/* Category view (default for authenticated) */}
        {isAuthenticated && viewMode === 'category' && (
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
                      <span className="text-sm font-bold" style={{ color: (cs ?? 0) >= 80 ? '#10B981' : (cs ?? 0) >= 50 ? '#F59E0B' : '#EF4444', fontFamily: 'var(--font-mono)' }}>{cs ?? 0}</span>
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{catFindings.length} issue{catFindings.length !== 1 ? 's' : ''}</span>
                    </div>
                  </button>
                  {isExp && <div className="border-t p-4 space-y-3" style={{ borderColor: 'var(--border)' }}>{catFindings.map((f, i) => renderFindingCard(f, i))}</div>}
                </div>
              );
            })}
          </div>
        )}

        {/* Priority view */}
        {(!isAuthenticated || viewMode === 'priority') && (
          <div className="space-y-4">
            {(isAuthenticated ? [...filteredFindings].sort((a, b) => { const s: Record<string, number> = { high: 0, medium: 1, low: 2 }; return (s[a.severity] - s[b.severity]) || (a.priorityOrder - b.priorityOrder); }) : visibleRecs.map((rec, i) => ({ id: rec.id, title: rec.title, why: rec.why_it_matters, fix: rec.recommended_fix, codeSnippet: generateCodeSnippet(rec.title, audit.site?.domain || 'example.com'), severity: rec.severity as 'high' | 'medium' | 'low', effort: rec.effort as 'easy' | 'medium' | 'harder', category: rec.category, affectedUrls: [] as string[], priorityOrder: i }))).map((finding, i) => renderFindingCard(finding, i))}
          </div>
        )}

        {/* Page view */}
        {isAuthenticated && viewMode === 'page' && (
          <div className="space-y-3">
            {Array.from(findingsByPage.entries()).map(([url, pageFindings]) => {
              const isExp = expandedPages.has(url);
              const page = pages.find(p => p.url === url);
              const isSW = url === '__site_wide__';
              let name = isSW ? 'Site-wide issues' : url;
              try { if (!isSW) name = page?.title || new URL(url).pathname || url; } catch {}
              return (
                <div key={url} className="rounded-xl border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                  <button onClick={() => togglePage(url)} className="w-full flex items-center justify-between p-4 transition-colors text-left">
                    <div className="flex items-center gap-3 min-w-0">
                      {isExp ? <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} /> : <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />}
                      <div className="min-w-0">
                        <p className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>{name}</p>
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

        {/* Gate for unauthenticated */}
        {!isAuthenticated && gatedCount > 0 && (
          <div className="mt-6 relative">
            <div className="rounded-xl border p-5 opacity-40 blur-[2px] pointer-events-none" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}><div className="flex items-start gap-3"><span className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)' }}>{FREE_RECOMMENDATION_LIMIT + 1}</span><div><div className="h-4 w-64 rounded" style={{ background: 'var(--bg-tertiary)' }} /><div className="h-3 w-96 rounded mt-2" style={{ background: 'var(--bg-tertiary)' }} /></div></div></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="rounded-xl border-2 p-6 text-center shadow-lg max-w-sm" style={{ background: 'var(--surface)', borderColor: 'rgba(99,102,241,0.3)' }}>
                <Lock className="w-8 h-8 mx-auto" style={{ color: '#6366F1' }} />
                <h3 className="mt-3 font-semibold" style={{ color: 'var(--text-primary)' }}>{gatedCount} more finding{gatedCount > 1 ? 's' : ''} available</h3>
                <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>Sign up free to unlock crawler status, page analysis, code snippets, and full report.</p>
                <a href={`/auth/signup?redirect=/audit/${audit.id}`} className="mt-4 btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm">Unlock Full Report <ArrowRight className="w-4 h-4" /></a>
              </div>
            </div>
          </div>
        )}
      </div>

      </>
      )}

      {/* ===== PAGES TAB ===== */}
      {(!isAuthenticated || activeTab === 'pages') && (
      <>
      {/* 8. PAGES ANALYZED */}
      {isAuthenticated && pages.length > 0 && (
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
      </>
      )}
    </div>
  );
}
