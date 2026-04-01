import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export const maxDuration = 60;

const FETCH_TIMEOUT = 8000;
const USER_AGENT = 'AIVisibilityAudit/1.0';

async function safeFetch(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try { return await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: controller.signal, redirect: 'follow' }); }
  finally { clearTimeout(timeout); }
}

// Lightweight scan — just enough for a benchmark score
async function lightScan(siteUrl: string): Promise<{ domain: string; overall: number; crawl: number; read: number; commercial: number; trust: number; pageTypes: string[] } | null> {
  try {
    const baseUrl = siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`;
    const domain = new URL(baseUrl).hostname;

    // Check robots.txt
    let hasRobots = false;
    let hasSitemap = false;
    try {
      const robotsRes = await safeFetch(`${baseUrl}/robots.txt`);
      if (robotsRes.ok) {
        hasRobots = true;
        const content = await robotsRes.text();
        hasSitemap = content.toLowerCase().includes('sitemap:');
      }
    } catch { /* skip */ }

    // Scan homepage
    const homeRes = await safeFetch(baseUrl);
    if (!homeRes.ok) return null;
    const html = await homeRes.text();
    const $ = cheerio.load(html);

    const hasTitle = !!$('title').text().trim();
    const hasMeta = !!$('meta[name="description"]').attr('content');
    const hasCanonical = !!$('link[rel="canonical"]').attr('href');
    const hasSchema = $('script[type="application/ld+json"]').length > 0;
    const hasOG = !!$('meta[property="og:title"]').attr('content');
    const hasH1 = !!$('h1').first().text().trim();
    const hasNav = $('nav').length > 0;
    const wordCount = $('body').text().replace(/\s+/g, ' ').trim().split(' ').length;
    const hasPrivacy = $('a[href*="privacy"]').length > 0;
    const hasSocial = $('a[href*="twitter.com"], a[href*="linkedin.com"], a[href*="x.com"]').length > 0;
    const bodyHtml = $('body').html()?.toLowerCase() || '';
    const hasTrust = bodyHtml.includes('trusted by') || bodyHtml.includes('customer') || $('[class*="logo"]').length > 3;
    const hasCta = $('a[href*="signup"], a[href*="demo"], a[href*="trial"], a:contains("Start"), a:contains("Try")').length > 0;

    // Discover key pages from links
    const links: string[] = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') || '';
      try {
        const u = new URL(href, baseUrl);
        if (u.hostname === domain) links.push(u.pathname.toLowerCase());
      } catch { /* skip */ }
    });
    const pageTypes: string[] = ['homepage'];
    if (links.some(l => l.includes('pricing') || l.includes('plans'))) pageTypes.push('pricing');
    if (links.some(l => l.includes('product') || l.includes('features') || l.includes('platform'))) pageTypes.push('product');
    if (links.some(l => l.includes('contact') || l.includes('demo'))) pageTypes.push('contact');
    if (links.some(l => l.includes('blog') || l.includes('resources') || l.includes('articles'))) pageTypes.push('blog');
    if (links.some(l => l.includes('docs') || l.includes('documentation') || l.includes('api'))) pageTypes.push('docs');
    if (links.some(l => l.includes('about') || l.includes('team') || l.includes('company'))) pageTypes.push('about');
    if (links.some(l => l.includes('security') || l.includes('compliance'))) pageTypes.push('security');
    if (links.some(l => l.includes('integrat'))) pageTypes.push('integrations');

    // Compute scores
    let crawl = 100;
    if (!hasRobots) crawl -= 15;
    if (!hasSitemap) crawl -= 15;
    if (!hasNav) crawl -= 8;
    crawl = Math.max(30, crawl);

    let read = 100;
    if (!hasTitle) read -= 12;
    if (!hasMeta) read -= 10;
    if (!hasCanonical) read -= 6;
    if (!hasSchema) read -= 12;
    if (!hasOG) read -= 8;
    if (!hasH1) read -= 6;
    if (wordCount < 100) read -= 8;
    read = Math.max(30, read);

    let commercial = 100;
    if (!pageTypes.includes('pricing')) commercial -= 15;
    if (!pageTypes.includes('product')) commercial -= 12;
    if (!pageTypes.includes('contact')) commercial -= 15;
    if (!hasCta) commercial -= 8;
    commercial = Math.max(25, commercial);

    let trust = 100;
    if (!pageTypes.includes('blog') && !pageTypes.includes('docs')) trust -= 10;
    if (!pageTypes.includes('about')) trust -= 6;
    if (!hasSchema) trust -= 8;
    if (!hasPrivacy) trust -= 8;
    if (!hasSocial) trust -= 8;
    if (!hasTrust) trust -= 6;
    trust = Math.max(30, trust);

    const overall = Math.round(crawl * 0.3 + read * 0.25 + commercial * 0.3 + trust * 0.15);

    return { domain, overall, crawl, read, commercial, trust, pageTypes };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { domain, h1, metaDescription, pageTypes, scores, recommendations } = await request.json();
    if (!domain) return NextResponse.json({ error: 'Domain required' }, { status: 400 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const name = domain.replace(/\.(com|io|co|org|net)$/, '').replace(/^www\./, '');

    // Step 1: Identify competitors via AI
    let competitors: string[] = [];
    if (apiKey) {
      try {
        const compPrompt = `Based on this website info, identify exactly 2 likely direct competitors. Return ONLY a JSON array of 2 domain names (e.g., ["competitor1.com", "competitor2.com"]). No explanation.

Domain: ${domain}
Homepage heading: "${h1 || 'unknown'}"
Meta description: "${metaDescription || 'unknown'}"
Page types found: ${(pageTypes || []).join(', ')}

Rules:
- Pick real, well-known companies in the same category
- These should be direct competitors, not tangentially related
- Return actual domains that exist
- No markdown, no backticks, just the JSON array`;

        const compRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 100, messages: [{ role: 'user', content: compPrompt }] }),
        });
        if (compRes.ok) {
          const compData = await compRes.json();
          const compText = compData.content?.[0]?.text || '';
          try {
            const parsed = JSON.parse(compText.replace(/```json|```/g, '').trim());
            if (Array.isArray(parsed)) competitors = parsed.slice(0, 2).map((c: string) => c.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, ''));
          } catch { /* skip */ }
        }
      } catch { /* skip */ }
    }

    // Step 2: Lightweight scan of competitors
    const benchmarks = [];
    for (const comp of competitors) {
      const result = await lightScan(`https://${comp}`);
      if (result) benchmarks.push(result);
    }

    // Step 3: Generate marketing strategy via AI
    let marketingStrategy = null;
    if (apiKey) {
      try {
        const highRecs = (recommendations || []).filter((r: { severity: string }) => r.severity === 'high').slice(0, 5);
        const stratPrompt = `You are an AI visibility marketing strategist. Based on this scan data, generate a marketing strategy.

Site: ${domain}
Homepage: "${h1 || 'unknown'}"
Description: "${metaDescription || 'unknown'}"
Overall grade: ${scores?.overall || 'unknown'}/100
Scores: Crawl ${scores?.crawl || '?'}, Read ${scores?.read || '?'}, Commercial ${scores?.commercial || '?'}, Trust ${scores?.trust || '?'}
Page types found: ${(pageTypes || []).join(', ')}
Top issues: ${highRecs.map((r: { title: string }) => r.title).join('; ')}
${benchmarks.length > 0 ? `Competitors: ${benchmarks.map(b => b.domain + ' (' + b.overall + '/100)').join(', ')}` : ''}

Return ONLY a JSON object with these fields:
{
  "queries": [5 specific queries people would type into ChatGPT/Perplexity about this type of product — make them realistic buyer queries],
  "pages_to_create": [3-4 specific pages they should create, each with "title" and "why" fields],
  "content_to_optimize": [2-3 existing page improvements, each with "page" and "action" fields],
  "schema_actions": [2 specific schema/structured data actions, each with "action" and "impact" fields],
  "trust_actions": [2-3 trust-building actions, each with "action" and "impact" fields]
}

Make queries specific to their business category. Make recommendations actionable and specific.
No markdown, no backticks, just the JSON.`;

        const stratRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1000, messages: [{ role: 'user', content: stratPrompt }] }),
        });
        if (stratRes.ok) {
          const stratData = await stratRes.json();
          const stratText = stratData.content?.[0]?.text || '';
          try {
            marketingStrategy = JSON.parse(stratText.replace(/```json|```/g, '').trim());
          } catch { /* skip */ }
        }
      } catch { /* skip */ }
    }

    // Fallback marketing strategy from scan data if no API
    if (!marketingStrategy) {
      marketingStrategy = {
        queries: [
          `What is the best ${h1?.toLowerCase().includes('project') ? 'project management' : h1?.toLowerCase().includes('analytic') ? 'analytics' : 'software'} tool?`,
          `${name} review — is it worth it?`,
          `${name} vs alternatives`,
          `How to ${h1?.toLowerCase().includes('manage') ? 'manage projects' : 'solve problems'} with AI tools`,
          `Best tools for ${h1?.toLowerCase().includes('team') ? 'team collaboration' : 'small businesses'} in 2025`,
        ],
        pages_to_create: (pageTypes || []).includes('comparison') ? [] : [
          { title: `${name} vs [Top Competitor] — Comparison`, why: 'Captures AI-driven comparison queries' },
          { title: `How ${name} Works — Getting Started Guide`, why: 'Helps AI answer "how do I use this?" questions' },
          { title: `${name} for [Industry/Use Case]`, why: 'Targets specific audience segments in AI queries' },
        ],
        content_to_optimize: [
          { page: 'Homepage', action: 'Add a clear first paragraph explaining what you do, for whom, and the key benefit' },
          { page: 'Product page', action: 'Add specific feature descriptions with use cases, not just feature names' },
        ],
        schema_actions: [
          { action: 'Add FAQ schema to homepage with 5 common buyer questions', impact: 'Enables AI to directly answer questions from your content' },
          { action: 'Add Organization schema with sameAs links to social profiles', impact: 'Helps AI verify your identity across platforms' },
        ],
        trust_actions: [
          { action: 'Get listed on G2 and Capterra with at least 10 reviews', impact: 'AI systems reference third-party review data heavily' },
          { action: 'Add 3-5 customer case studies with specific metrics', impact: 'Gives AI concrete evidence to cite when recommending you' },
        ],
      };
    }

    return NextResponse.json({
      competitors: benchmarks,
      yourScores: scores || { overall: 0, crawl: 0, read: 0, commercial: 0, trust: 0 },
      marketingStrategy,
    });
  } catch (error) {
    console.error('Growth strategy error:', error);
    return NextResponse.json({ error: 'Failed to generate growth strategy' }, { status: 500 });
  }
}
