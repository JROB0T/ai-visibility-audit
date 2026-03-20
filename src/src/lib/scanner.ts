import * as cheerio from 'cheerio';
import type {
  ScanResult,
  RobotsTxtResult,
  SitemapResult,
  PageScanResult,
} from '@/lib/types';

const USER_AGENT = 'AIVisibilityAudit/1.0 (+https://aivisibilityaudit.com)';
const FETCH_TIMEOUT = 10000; // 10 seconds per request
const MAX_PAGES = 50;
const CONCURRENT_SCANS = 5; // Scan 5 pages at a time for speed

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
  const hostname = new URL(baseUrl).hostname;
  const errors: string[] = [];

  // 1. Check robots.txt
  const robotsTxt = await checkRobotsTxt(baseUrl).catch((e) => {
    errors.push(`robots.txt check failed: ${e.message}`);
    return null;
  });

  // 2. Check sitemap and extract URLs
  const sitemapData = await checkSitemap(baseUrl, robotsTxt).catch((e) => {
    errors.push(`sitemap check failed: ${e.message}`);
    return null;
  });

  const sitemap: SitemapResult = sitemapData
    ? { exists: sitemapData.exists, url: sitemapData.url, urlCount: sitemapData.urlCount, isAccessible: sitemapData.isAccessible }
    : { exists: false, url: null, urlCount: null, isAccessible: false };

  // 3. Scan homepage first
  const homepageResult = await scanPage(baseUrl, 'homepage').catch((e) => {
    errors.push(`Homepage scan failed: ${e.message}`);
    return null;
  });

  if (!homepageResult) {
    return { robotsTxt, sitemap, pages: [], errors: [...errors, 'Could not scan homepage'] };
  }

  // 4. Build a prioritized list of URLs to scan from multiple sources
  const scannedUrls = new Set([baseUrl, baseUrl + '/']);
  const urlsToScan: { url: string; type: PageScanResult['pageType']; priority: number }[] = [];

  // Source A: Key pages from homepage links (highest priority)
  const homepageKeyPages = discoverKeyPages(homepageResult.internalLinks);
  for (const page of homepageKeyPages) {
    if (!scannedUrls.has(page.url)) {
      urlsToScan.push({ ...page, priority: page.priority });
      scannedUrls.add(page.url);
    }
  }

  // Source B: Sitemap URLs (categorized and added)
  if (sitemapData?.pageUrls) {
    for (const sitemapUrl of sitemapData.pageUrls) {
      if (scannedUrls.has(sitemapUrl)) continue;
      // Only include same-hostname URLs
      try {
        if (new URL(sitemapUrl).hostname !== hostname) continue;
      } catch { continue; }

      const categorized = categorizeUrl(sitemapUrl);
      urlsToScan.push({ url: sitemapUrl, type: categorized.type, priority: categorized.priority + 100 }); // Lower priority than homepage-discovered
      scannedUrls.add(sitemapUrl);
    }
  }

  // Source C: Remaining internal links from homepage (lowest priority)
  for (const link of homepageResult.internalLinks) {
    if (scannedUrls.has(link)) continue;
    try {
      if (new URL(link).hostname !== hostname) continue;
    } catch { continue; }
    const categorized = categorizeUrl(link);
    urlsToScan.push({ url: link, type: categorized.type, priority: categorized.priority + 200 });
    scannedUrls.add(link);
  }

  // Sort by priority and cap at MAX_PAGES - 1 (homepage already scanned)
  urlsToScan.sort((a, b) => a.priority - b.priority);
  const pagesToScan = urlsToScan.slice(0, MAX_PAGES - 1);

  // 5. Scan pages in concurrent batches
  const pageResults: PageScanResult[] = [homepageResult];

  for (let i = 0; i < pagesToScan.length; i += CONCURRENT_SCANS) {
    const batch = pagesToScan.slice(i, i + CONCURRENT_SCANS);
    const batchResults = await Promise.allSettled(
      batch.map(({ url, type }) => scanPage(url, type))
    );

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      if (result.status === 'fulfilled') {
        pageResults.push(result.value);
      } else {
        errors.push(`Failed to scan ${batch[j].url}: ${result.reason?.message || 'Unknown error'}`);
      }
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
      exists: false, content: null, blocksAI: false,
      blockedAgents: [], allowsSitemap: false, sitemapUrls: [],
    };
  }

  const content = await res.text();

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
    content: content.substring(0, 2000),
    blocksAI: aiBlocked.length > 0,
    blockedAgents: aiBlocked,
    allowsSitemap: sitemapUrls.length > 0,
    sitemapUrls,
  };
}

// ============================================================
// Sitemap check — now also extracts page URLs
// ============================================================
interface SitemapData extends SitemapResult {
  pageUrls: string[];
}

async function checkSitemap(
  baseUrl: string,
  robotsTxt: RobotsTxtResult | null
): Promise<SitemapData> {
  const sitemapUrls = [
    ...(robotsTxt?.sitemapUrls || []),
    `${baseUrl}/sitemap.xml`,
    `${baseUrl}/sitemap_index.xml`,
  ];

  const uniqueUrls = Array.from(new Set(sitemapUrls));
  const allPageUrls: string[] = [];

  for (const url of uniqueUrls) {
    try {
      const res = await safeFetch(url);
      if (!res.ok) continue;

      const text = await res.text();

      // Check if this is a sitemap index (contains other sitemaps)
      if (text.includes('<sitemapindex') || text.includes('<sitemap>')) {
        const indexUrls = extractLocsFromXml(text);
        // Fetch up to 5 child sitemaps
        const childSitemaps = indexUrls.slice(0, 5);
        for (const childUrl of childSitemaps) {
          try {
            const childRes = await safeFetch(childUrl);
            if (childRes.ok) {
              const childText = await childRes.text();
              allPageUrls.push(...extractLocsFromXml(childText));
            }
          } catch { /* skip failed child sitemaps */ }
        }
      } else {
        // Regular sitemap — extract URLs directly
        allPageUrls.push(...extractLocsFromXml(text));
      }

      const totalUrlCount = allPageUrls.length;
      return {
        exists: true,
        url,
        urlCount: totalUrlCount || null,
        isAccessible: true,
        pageUrls: allPageUrls,
      };
    } catch {
      continue;
    }
  }

  return { exists: false, url: null, urlCount: null, isAccessible: false, pageUrls: [] };
}

// Extract <loc> values from sitemap XML
function extractLocsFromXml(xml: string): string[] {
  const urls: string[] = [];
  const locRegex = /<loc>\s*(.*?)\s*<\/loc>/gi;
  let match;
  while ((match = locRegex.exec(xml)) !== null) {
    const url = match[1].trim();
    if (url.startsWith('http')) {
      urls.push(url.replace(/\/+$/, ''));
    }
  }
  return urls;
}

// ============================================================
// Categorize a URL by its path pattern
// ============================================================
function categorizeUrl(url: string): { type: PageScanResult['pageType']; priority: number } {
  const patterns: { regex: RegExp; type: PageScanResult['pageType']; priority: number }[] = [
    { regex: /\/(pricing|plans|packages)/i, type: 'pricing', priority: 1 },
    { regex: /\/(demo|request-demo|book-demo|get-demo|schedule)/i, type: 'demo', priority: 2 },
    { regex: /\/(contact|contact-us|get-in-touch|talk-to-us)/i, type: 'contact', priority: 3 },
    { regex: /\/(product|products|features|platform|solutions?)\/?$/i, type: 'product', priority: 4 },
    { regex: /\/(product|features|platform|solutions?)\/[^/]+\/?$/i, type: 'product', priority: 5 },
    { regex: /\/(docs|documentation|api-docs|developers|api)\/?$/i, type: 'docs', priority: 6 },
    { regex: /\/(blog|articles|news|insights)\/?$/i, type: 'blog', priority: 7 },
    { regex: /\/(blog|articles|news|insights)\/[^/]+/i, type: 'blog', priority: 8 },
    { regex: /\/(resources?|library|guides?|whitepapers?|case-studies)\/?$/i, type: 'resource', priority: 9 },
    { regex: /\/(resources?|library|guides?|whitepapers?|case-studies)\/[^/]+/i, type: 'resource', priority: 10 },
    { regex: /\/(about|about-us|company|team|careers)\/?$/i, type: 'other', priority: 11 },
    { regex: /\/(integrations?|partners?|marketplace|customers?|testimonials?)\/?$/i, type: 'other', priority: 12 },
    { regex: /\/(docs|documentation|api-docs|developers|api)\/[^/]+/i, type: 'docs', priority: 13 },
    { regex: /\/(security|privacy|terms|legal|compliance)\/?$/i, type: 'other', priority: 14 },
  ];

  for (const pattern of patterns) {
    if (pattern.regex.test(url)) {
      return { type: pattern.type, priority: pattern.priority };
    }
  }
  return { type: 'other', priority: 50 };
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
    url, pageType, statusCode: res.status, title, metaDescription,
    canonicalUrl, hasSchema, schemaTypes, h1Text, wordCount, loadTimeMs,
    headings, hasStructuredNav, internalLinks, issues,
  };
}

// ============================================================
// Page discovery - find key pages from homepage links
// ============================================================
function discoverKeyPages(
  links: string[]
): { url: string; type: PageScanResult['pageType']; priority: number }[] {
  const keyPages: { url: string; type: PageScanResult['pageType']; priority: number }[] = [];

  for (const link of links) {
    const { type, priority } = categorizeUrl(link);
    if (type === 'other' && priority >= 50) continue; // Skip uncategorized for homepage discovery

    // Limit duplicates per type (except blog/docs/product — allow more)
    const existingOfType = keyPages.filter((p) => p.type === type);
    const maxPerType = ['product', 'blog', 'docs', 'resource'].includes(type) ? 5 : 2;
    if (existingOfType.length >= maxPerType) continue;

    keyPages.push({ url: link, type, priority });
  }

  return keyPages.sort((a, b) => a.priority - b.priority);
}
