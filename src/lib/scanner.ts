import * as cheerio from 'cheerio';
import type {
  ScanResult,
  RobotsTxtResult,
  SitemapResult,
  PageScanResult,
} from '@/lib/types';

const USER_AGENT = 'AIVisibilityAudit/1.0 (+https://aivisibilityaudit.com)';
const FETCH_TIMEOUT = 10000; // 10 seconds per request
const MAX_PAGES = 15; // Keep it focused

// Known AI crawler user agents to check in robots.txt
const AI_AGENTS = [
  'GPTBot', 'ChatGPT-User', 'Google-Extended', 'Anthropic',
  'ClaudeBot', 'CCBot', 'PerplexityBot', 'Bytespider',
  'Amazonbot', 'Meta-ExternalAgent', 'Cohere-ai',
];

// ============================================================
// Main scan function
// ============================================================
export async function scanSite(inputUrl: string): Promise<ScanResult> {
  const baseUrl = normalizeUrl(inputUrl);
  const errors: string[] = [];

  // 1. Check robots.txt
  const robotsTxt = await checkRobotsTxt(baseUrl).catch((e) => {
    errors.push(`robots.txt check failed: ${e.message}`);
    return null;
  });

  // 2. Check sitemap
  const sitemap = await checkSitemap(baseUrl, robotsTxt).catch((e) => {
    errors.push(`sitemap check failed: ${e.message}`);
    return null;
  });

  // 3. Scan homepage first
  const homepageResult = await scanPage(baseUrl, 'homepage').catch((e) => {
    errors.push(`Homepage scan failed: ${e.message}`);
    return null;
  });

  if (!homepageResult) {
    return { robotsTxt, sitemap, pages: [], errors: [...errors, 'Could not scan homepage'] };
  }

  // 4. Discover and categorize key pages from homepage links
  const keyPages = discoverKeyPages(homepageResult.internalLinks);

  // 5. Scan key pages (limited set)
  const pageResults: PageScanResult[] = [homepageResult];
  const scannedUrls = new Set([baseUrl, baseUrl + '/']);

  for (const { url, type } of keyPages) {
    if (pageResults.length >= MAX_PAGES) break;
    if (scannedUrls.has(url)) continue;
    scannedUrls.add(url);

    try {
      const result = await scanPage(url, type);
      pageResults.push(result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`Failed to scan ${url}: ${msg}`);
    }
  }

  return { robotsTxt, sitemap, pages: pageResults, errors };
}

// ============================================================
// URL normalization
// ============================================================
function normalizeUrl(input: string): string {
  let url = input.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  // Remove trailing slash for consistency
  return url.replace(/\/+$/, '');
}

// ============================================================
// Fetch helper with timeout and user agent
// ============================================================
async function safeFetch(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
      redirect: 'follow',
    });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================
// robots.txt check
// ============================================================
async function checkRobotsTxt(baseUrl: string): Promise<RobotsTxtResult> {
  const url = `${baseUrl}/robots.txt`;
  const res = await safeFetch(url);

  if (!res.ok) {
    return {
      exists: false,
      content: null,
      blocksAI: false,
      blockedAgents: [],
      allowsSitemap: false,
      sitemapUrls: [],
    };
  }

  const content = await res.text();

  const blockedAgents: string[] = [];
  let currentAgent = '';

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.toLowerCase().startsWith('user-agent:')) {
      currentAgent = trimmed.substring(11).trim();
    }
    if (trimmed.toLowerCase().startsWith('disallow: /') && trimmed.trim() === 'Disallow: /') {
      // Full disallow
      for (const agent of AI_AGENTS) {
        if (currentAgent === '*' || currentAgent.toLowerCase().includes(agent.toLowerCase())) {
          if (!blockedAgents.includes(agent === '*' ? 'all agents' : currentAgent)) {
            blockedAgents.push(currentAgent);
          }
        }
      }
    }
  }

  // Check specifically for AI agents being blocked
  const aiBlocked: string[] = [];
  let activeAgent = '';
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.toLowerCase().startsWith('user-agent:')) {
      activeAgent = trimmed.substring(11).trim();
    } else if (trimmed.toLowerCase() === 'disallow: /' || trimmed.toLowerCase() === 'disallow: *') {
      for (const agent of AI_AGENTS) {
        if (activeAgent.toLowerCase() === agent.toLowerCase()) {
          aiBlocked.push(agent);
        }
      }
    }
  }

  const sitemapUrls = content
    .split('\n')
    .filter((l) => l.trim().toLowerCase().startsWith('sitemap:'))
    .map((l) => l.trim().substring(8).trim());

  return {
    exists: true,
    content: content.substring(0, 2000), // Keep it manageable
    blocksAI: aiBlocked.length > 0,
    blockedAgents: aiBlocked,
    allowsSitemap: sitemapUrls.length > 0,
    sitemapUrls,
  };
}

// ============================================================
// Sitemap check
// ============================================================
async function checkSitemap(
  baseUrl: string,
  robotsTxt: RobotsTxtResult | null
): Promise<SitemapResult> {
  // Try sitemap URLs from robots.txt first
  const sitemapUrls = [
    ...(robotsTxt?.sitemapUrls || []),
    `${baseUrl}/sitemap.xml`,
    `${baseUrl}/sitemap_index.xml`,
  ];

  const uniqueUrls = Array.from(new Set(sitemapUrls));
  for (const url of uniqueUrls) {
    try {
      const res = await safeFetch(url);
      if (res.ok) {
        const text = await res.text();
        const urlCount = (text.match(/<loc>/gi) || []).length;
        return {
          exists: true,
          url,
          urlCount: urlCount || null,
          isAccessible: true,
        };
      }
    } catch {
      continue;
    }
  }

  return { exists: false, url: null, urlCount: null, isAccessible: false };
}

// ============================================================
// Page scanner
// ============================================================
async function scanPage(
  url: string,
  pageType: PageScanResult['pageType']
): Promise<PageScanResult> {
  const start = Date.now();
  const res = await safeFetch(url);
  const loadTimeMs = Date.now() - start;
  const html = await res.text();
  const $ = cheerio.load(html);
  const issues: string[] = [];

  // Title
  const title = $('title').first().text().trim() || null;
  if (!title) issues.push('Missing page title');
  else if (title.length < 20) issues.push('Page title is very short');
  else if (title.length > 70) issues.push('Page title is very long (may truncate)');

  // Meta description
  const metaDescription =
    $('meta[name="description"]').attr('content')?.trim() || null;
  if (!metaDescription) issues.push('Missing meta description');
  else if (metaDescription.length < 50) issues.push('Meta description is very short');
  else if (metaDescription.length > 160) issues.push('Meta description is very long');

  // Canonical
  const canonicalUrl = $('link[rel="canonical"]').attr('href')?.trim() || null;
  if (!canonicalUrl) issues.push('Missing canonical tag');

  // Schema / structured data
  const schemaScripts = $('script[type="application/ld+json"]');
  const schemaTypes: string[] = [];
  schemaScripts.each((_, el) => {
    try {
      const json = JSON.parse($(el).html() || '');
      const t = json['@type'];
      if (t) schemaTypes.push(Array.isArray(t) ? t.join(', ') : t);
    } catch {
      // ignore invalid JSON-LD
    }
  });
  const hasSchema = schemaTypes.length > 0;
  if (!hasSchema) issues.push('No structured data (JSON-LD) found');

  // H1
  const h1Text = $('h1').first().text().trim() || null;
  if (!h1Text) issues.push('Missing H1 heading');

  // All headings
  const headings: { level: number; text: string }[] = [];
  $('h1, h2, h3').each((_, el) => {
    const level = parseInt(el.tagName.replace('h', ''));
    const text = $(el).text().trim();
    if (text) headings.push({ level, text: text.substring(0, 120) });
  });

  // Word count (approximate, text content only)
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const wordCount = bodyText.split(' ').filter((w) => w.length > 0).length;
  if (wordCount < 100) issues.push('Very thin content (under 100 words)');

  // Navigation structure
  const hasStructuredNav = $('nav').length > 0 || $('[role="navigation"]').length > 0;

  // Internal links
  const hostname = new URL(url).hostname;
  const internalLinks: string[] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    try {
      const linkUrl = new URL(href, url);
      if (linkUrl.hostname === hostname && !linkUrl.hash) {
        const normalized = linkUrl.origin + linkUrl.pathname.replace(/\/+$/, '');
        if (!internalLinks.includes(normalized)) {
          internalLinks.push(normalized);
        }
      }
    } catch {
      // skip malformed URLs
    }
  });

  // Check for heavy JS dependency
  const scriptCount = $('script[src]').length;
  if (scriptCount > 15 && wordCount < 200) {
    issues.push('Page may rely heavily on JavaScript for content rendering');
  }

  return {
    url,
    pageType,
    statusCode: res.status,
    title,
    metaDescription,
    canonicalUrl,
    hasSchema,
    schemaTypes,
    h1Text,
    wordCount,
    loadTimeMs,
    headings,
    hasStructuredNav,
    internalLinks,
    issues,
  };
}

// ============================================================
// Page discovery - find key pages from homepage links
// ============================================================
function discoverKeyPages(
  links: string[]
): { url: string; type: PageScanResult['pageType'] }[] {
  const keyPages: { url: string; type: PageScanResult['pageType']; priority: number }[] = [];

  const patterns: { regex: RegExp; type: PageScanResult['pageType']; priority: number }[] = [
    { regex: /\/(pricing|plans|packages)/i, type: 'pricing', priority: 1 },
    { regex: /\/(demo|request-demo|book-demo|get-demo|schedule)/i, type: 'demo', priority: 2 },
    { regex: /\/(contact|contact-us|get-in-touch|talk-to-us)/i, type: 'contact', priority: 3 },
    { regex: /\/(product|products|features|platform|solutions?)\/?$/i, type: 'product', priority: 4 },
    { regex: /\/(product|features|platform|solutions?)\/[^/]+\/?$/i, type: 'product', priority: 5 },
    { regex: /\/(docs|documentation|api-docs|developers|api)\/?$/i, type: 'docs', priority: 6 },
    { regex: /\/(blog|articles|news|insights)\/?$/i, type: 'blog', priority: 7 },
    { regex: /\/(resources?|library|guides?|whitepapers?|case-studies)\/?$/i, type: 'resource', priority: 8 },
    { regex: /\/(about|about-us|company|team)\/?$/i, type: 'other', priority: 9 },
    { regex: /\/(integrations?|partners?|marketplace)\/?$/i, type: 'other', priority: 10 },
  ];

  for (const link of links) {
    for (const pattern of patterns) {
      if (pattern.regex.test(link)) {
        // Avoid duplicates of the same type (except product pages, we want a few)
        const existingOfType = keyPages.filter((p) => p.type === pattern.type);
        if (pattern.type === 'product' && existingOfType.length >= 3) continue;
        if (pattern.type !== 'product' && existingOfType.length >= 1) continue;

        keyPages.push({ url: link, type: pattern.type, priority: pattern.priority });
        break;
      }
    }
  }

  return keyPages.sort((a, b) => a.priority - b.priority);
}
