import * as cheerio from 'cheerio';
import type {
  ScanResult,
  RobotsTxtResult,
  SitemapResult,
  PageScanResult,
  CrawlerStatus,
  KeyPageStatus,
  SiteWideChecks,
  PageType,
} from '@/lib/types';

const USER_AGENT = 'AIVisibilityAudit/1.0 (+https://aivisibilityaudit.com)';
const FETCH_TIMEOUT = 10000;
const MAX_PAGES = 50;
const CONCURRENT_SCANS = 5;

const AI_AGENTS = [
  'GPTBot', 'ChatGPT-User', 'Google-Extended', 'Anthropic',
  'ClaudeBot', 'CCBot', 'PerplexityBot', 'Bytespider',
  'Amazonbot', 'Meta-ExternalAgent', 'Cohere-ai',
];

// Review platform domains
const REVIEW_PLATFORMS = ['g2.com', 'capterra.com', 'trustradius.com', 'trustpilot.com', 'getapp.com', 'sourceforge.net/software'];
const SOCIAL_PLATFORMS = ['twitter.com', 'x.com', 'linkedin.com', 'facebook.com', 'github.com', 'youtube.com', 'instagram.com'];

// ============================================================
// Main scan function
// ============================================================
export async function scanSite(inputUrl: string): Promise<ScanResult> {
  const baseUrl = normalizeUrl(inputUrl);
  const hostname = new URL(baseUrl).hostname;
  const errors: string[] = [];

  const robotsTxt = await checkRobotsTxt(baseUrl).catch((e) => {
    errors.push(`robots.txt check failed: ${e.message}`);
    return null;
  });

  const sitemapData = await checkSitemap(baseUrl, robotsTxt).catch((e) => {
    errors.push(`sitemap check failed: ${e.message}`);
    return null;
  });

  const sitemap: SitemapResult = sitemapData
    ? { exists: sitemapData.exists, url: sitemapData.url, urlCount: sitemapData.urlCount, isAccessible: sitemapData.isAccessible }
    : { exists: false, url: null, urlCount: null, isAccessible: false };

  const homepageResult = await scanPage(baseUrl, 'homepage').catch((e) => {
    errors.push(`Homepage scan failed: ${e.message}`);
    return null;
  });

  if (!homepageResult) {
    return {
      robotsTxt, sitemap, pages: [], errors: [...errors, 'Could not scan homepage'],
      crawlerStatuses: buildCrawlerStatuses(robotsTxt, []),
      keyPagesStatus: [],
      siteWideChecks: defaultSiteWideChecks(),
      detectedVertical: 'other',
    };
  }

  const scannedUrls = new Set([baseUrl, baseUrl + '/']);
  const urlsToScan: { url: string; type: PageType; priority: number }[] = [];

  const homepageKeyPages = discoverKeyPages(homepageResult.internalLinks);
  for (const page of homepageKeyPages) {
    if (!scannedUrls.has(page.url)) {
      urlsToScan.push({ ...page, priority: page.priority });
      scannedUrls.add(page.url);
    }
  }

  if (sitemapData?.pageUrls) {
    for (const sitemapUrl of sitemapData.pageUrls) {
      if (scannedUrls.has(sitemapUrl)) continue;
      try { if (new URL(sitemapUrl).hostname !== hostname) continue; } catch { continue; }
      const categorized = categorizeUrl(sitemapUrl);
      urlsToScan.push({ url: sitemapUrl, type: categorized.type, priority: categorized.priority + 100 });
      scannedUrls.add(sitemapUrl);
    }
  }

  for (const link of homepageResult.internalLinks) {
    if (scannedUrls.has(link)) continue;
    try { if (new URL(link).hostname !== hostname) continue; } catch { continue; }
    const categorized = categorizeUrl(link);
    urlsToScan.push({ url: link, type: categorized.type, priority: categorized.priority + 200 });
    scannedUrls.add(link);
  }

  urlsToScan.sort((a, b) => a.priority - b.priority);
  const pagesToScan = urlsToScan.slice(0, MAX_PAGES - 1);

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

  const crawlerStatuses = buildCrawlerStatuses(robotsTxt, pageResults);
  const keyPagesStatus = buildKeyPagesStatus(pageResults);
  const siteWideChecks = buildSiteWideChecks(pageResults, homepageResult);
  const detectedVertical = detectVertical(homepageResult, pageResults);

  return { robotsTxt, sitemap, pages: pageResults, errors, crawlerStatuses, keyPagesStatus, siteWideChecks, detectedVertical };
}

// ============================================================
// Auto-detect business vertical from scan data
// ============================================================
function detectVertical(homepage: PageScanResult, pages: PageScanResult[]): string {
  const scores: Record<string, number> = {
    saas: 0, professional_services: 0, local_service: 0,
    ecommerce: 0, healthcare: 0, law_firm: 0, restaurant: 0,
  };

  // Combine text signals from homepage
  const h1 = (homepage.h1Text || '').toLowerCase();
  const title = (homepage.title || '').toLowerCase();
  const meta = (homepage.metaDescription || '').toLowerCase();
  const firstP = (homepage.firstParagraphText || '').toLowerCase();
  const text = `${h1} ${title} ${meta} ${firstP}`;

  // Collect all URL paths
  const allUrls = pages.map(p => { try { return new URL(p.url).pathname.toLowerCase(); } catch { return ''; } });
  const urlText = allUrls.join(' ');

  // Schema types
  const schemaTypes = new Set(pages.flatMap(p => p.schemaTypes.map(s => s.toLowerCase())));

  // ---- SaaS / Software ----
  if (text.match(/\b(software|saas|platform|api|dashboard|deploy|integrat|devops|developer|automat|workflow)\b/)) scores.saas += 3;
  if (urlText.match(/\/(docs|api|changelog|integrations|features|pricing|demo|signup|trial)/)) scores.saas += 2;
  if (schemaTypes.has('softwareapplication') || schemaTypes.has('webapplication')) scores.saas += 4;
  if (text.match(/\b(free trial|start free|sign up|get started)\b/)) scores.saas += 1;

  // ---- E-commerce ----
  if (text.match(/\b(shop|store|buy|cart|order|product|shipping|free delivery|checkout)\b/)) scores.ecommerce += 3;
  if (urlText.match(/\/(shop|cart|product|collection|catalog|checkout)/)) scores.ecommerce += 3;
  if (schemaTypes.has('product') || schemaTypes.has('offer') || schemaTypes.has('store')) scores.ecommerce += 4;
  if (pages.some(p => p.hasPricingContent && p.pageType !== 'pricing')) scores.ecommerce += 1;

  // ---- Healthcare ----
  if (text.match(/\b(doctor|patient|clinic|medical|health|treatment|appointment|physician|dentist|therapy|wellness|diagnosis)\b/)) scores.healthcare += 3;
  if (urlText.match(/\/(patient|appointment|treatments|conditions|providers|specialties|insurance)/)) scores.healthcare += 2;
  if (schemaTypes.has('medicalbusiness') || schemaTypes.has('physician') || schemaTypes.has('dentist') || schemaTypes.has('hospital')) scores.healthcare += 4;

  // ---- Law Firm ----
  if (text.match(/\b(attorney|lawyer|law firm|legal|practice area|litigation|counsel|defense|plaintiff|injury|criminal|divorce|estate planning)\b/)) scores.law_firm += 4;
  if (urlText.match(/\/(practice-areas|attorneys|case-results|legal|lawyer)/)) scores.law_firm += 3;
  if (schemaTypes.has('legalservice') || schemaTypes.has('attorney')) scores.law_firm += 4;

  // ---- Restaurant / Food ----
  if (text.match(/\b(restaurant|menu|dining|chef|reservat|cuisine|food|bistro|cafe|bar & grill|brunch|takeout|delivery|appetizer|entree)\b/)) scores.restaurant += 4;
  if (urlText.match(/\/(menu|reservat|catering|private-dining|order-online|specials)/)) scores.restaurant += 3;
  if (schemaTypes.has('restaurant') || schemaTypes.has('foodestablishment') || schemaTypes.has('cafe') || schemaTypes.has('barorgrill')) scores.restaurant += 4;

  // ---- Professional Services ----
  if (text.match(/\b(consulting|advisory|firm|strategy|solutions|engagement|partner|expertise|consultant|accounting|financial planning|tax)\b/)) scores.professional_services += 3;
  if (urlText.match(/\/(services|case-studies|industries|solutions|team|expertise)/)) scores.professional_services += 2;
  if (schemaTypes.has('professionalservice') || schemaTypes.has('accountingservice') || schemaTypes.has('financialservice')) scores.professional_services += 4;
  if (text.match(/\b(years of experience|certified|accredited|licensed professional)\b/)) scores.professional_services += 1;

  // ---- Local Service ----
  if (text.match(/\b(plumb|electrician|hvac|roofing|landscap|cleaning|handyman|pest control|moving|locksmith|painting|contractor|repair|installation|service area)\b/)) scores.local_service += 4;
  if (urlText.match(/\/(service-area|locations|free-estimate|emergency|residential|commercial-services)/)) scores.local_service += 2;
  if (schemaTypes.has('localbusiness') || schemaTypes.has('homeandconstructionbusiness') || schemaTypes.has('plumber') || schemaTypes.has('electrician')) scores.local_service += 4;
  if (text.match(/\b(free estimate|same.day|24.7|emergency|licensed and insured|serving)\b/)) scores.local_service += 1;

  // Find the highest scoring vertical
  let best = 'other';
  let bestScore = 0;
  for (const [vertical, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      best = vertical;
    }
  }

  // Require a minimum confidence threshold
  return bestScore >= 3 ? best : 'other';
}

// ============================================================
// URL normalization
// ============================================================
function normalizeUrl(input: string): string {
  let url = input.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
  return url.replace(/\/+$/, '');
}

// ============================================================
// Fetch helper
// ============================================================
async function safeFetch(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    return await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: controller.signal, redirect: 'follow' });
  } finally { clearTimeout(timeout); }
}

// ============================================================
// robots.txt check
// ============================================================
async function checkRobotsTxt(baseUrl: string): Promise<RobotsTxtResult> {
  const url = `${baseUrl}/robots.txt`;
  const res = await safeFetch(url);
  if (!res.ok) {
    return { exists: false, content: null, blocksAI: false, blockedAgents: [], allowsSitemap: false, sitemapUrls: [] };
  }
  const content = await res.text();
  const aiBlocked: string[] = [];
  let activeAgent = '';
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.toLowerCase().startsWith('user-agent:')) {
      activeAgent = trimmed.substring(11).trim();
    } else if (trimmed.toLowerCase() === 'disallow: /' || trimmed.toLowerCase() === 'disallow: *') {
      for (const agent of AI_AGENTS) {
        if (activeAgent.toLowerCase() === agent.toLowerCase()) aiBlocked.push(agent);
      }
    }
  }
  const sitemapUrls = content.split('\n').filter((l) => l.trim().toLowerCase().startsWith('sitemap:')).map((l) => l.trim().substring(8).trim());
  return { exists: true, content: content.substring(0, 2000), blocksAI: aiBlocked.length > 0, blockedAgents: aiBlocked, allowsSitemap: sitemapUrls.length > 0, sitemapUrls };
}

// ============================================================
// Sitemap check
// ============================================================
interface SitemapData extends SitemapResult { pageUrls: string[]; }

async function checkSitemap(baseUrl: string, robotsTxt: RobotsTxtResult | null): Promise<SitemapData> {
  const sitemapUrls = [...(robotsTxt?.sitemapUrls || []), `${baseUrl}/sitemap.xml`, `${baseUrl}/sitemap_index.xml`];
  const tried = new Set<string>();
  for (const sUrl of sitemapUrls) {
    if (tried.has(sUrl)) continue;
    tried.add(sUrl);
    try {
      const res = await safeFetch(sUrl);
      if (!res.ok) continue;
      const xml = await res.text();
      if (!xml.includes('<urlset') && !xml.includes('<sitemapindex')) continue;
      let urls: string[] = [];
      if (xml.includes('<sitemapindex')) {
        const subSitemaps = extractUrlsFromXml(xml);
        for (const sub of subSitemaps.slice(0, 3)) {
          try {
            const subRes = await safeFetch(sub);
            if (subRes.ok) { const subXml = await subRes.text(); urls = urls.concat(extractUrlsFromXml(subXml)); }
          } catch { /* skip */ }
        }
      } else {
        urls = extractUrlsFromXml(xml);
      }
      return { exists: true, url: sUrl, urlCount: urls.length, isAccessible: true, pageUrls: urls.slice(0, 200) };
    } catch { continue; }
  }
  return { exists: false, url: null, urlCount: null, isAccessible: false, pageUrls: [] };
}

function extractUrlsFromXml(xml: string): string[] {
  const urls: string[] = [];
  const locRegex = /<loc>\s*(.*?)\s*<\/loc>/gi;
  let match;
  while ((match = locRegex.exec(xml)) !== null) {
    const url = match[1].trim();
    if (url.startsWith('http')) urls.push(url.replace(/\/+$/, ''));
  }
  return urls;
}

// ============================================================
// URL categorization (expanded)
// ============================================================
function categorizeUrl(url: string): { type: PageType; priority: number } {
  const patterns: { regex: RegExp; type: PageType; priority: number }[] = [
    { regex: /\/(pricing|plans|packages)/i, type: 'pricing', priority: 1 },
    { regex: /\/(demo|request-demo|book-demo|get-demo|schedule)/i, type: 'demo', priority: 2 },
    { regex: /\/(contact|contact-us|get-in-touch|talk-to-us)/i, type: 'contact', priority: 3 },
    { regex: /\/(product|products|features|platform|solutions?)\/?$/i, type: 'product', priority: 4 },
    { regex: /\/(product|features|platform|solutions?)\/[^/]+\/?$/i, type: 'product', priority: 5 },
    { regex: /\/(compare|vs|versus|comparison|alternative)/i, type: 'comparison', priority: 5 },
    { regex: /\/(use-case|usecases?|for-)\/?/i, type: 'use-case', priority: 6 },
    { regex: /\/(docs|documentation|api-docs|developers|api)\/?$/i, type: 'docs', priority: 6 },
    { regex: /\/(blog|articles|news|insights)\/?$/i, type: 'blog', priority: 7 },
    { regex: /\/(blog|articles|news|insights)\/[^/]+/i, type: 'blog', priority: 8 },
    { regex: /\/(resources?|library|guides?|whitepapers?|case-studies)\/?$/i, type: 'resource', priority: 9 },
    { regex: /\/(resources?|library|guides?|whitepapers?|case-studies)\/[^/]+/i, type: 'resource', priority: 10 },
    { regex: /\/(about|about-us|company|our-story)\/?$/i, type: 'about', priority: 11 },
    { regex: /\/(team|people|leadership)\/?$/i, type: 'about', priority: 11 },
    { regex: /\/(security|compliance|soc2?|gdpr)\/?$/i, type: 'security', priority: 12 },
    { regex: /\/(privacy|privacy-policy)\/?$/i, type: 'privacy', priority: 12 },
    { regex: /\/(terms|terms-of-service|tos|legal)\/?$/i, type: 'terms', priority: 12 },
    { regex: /\/(careers|jobs|openings|hiring)\/?$/i, type: 'careers', priority: 13 },
    { regex: /\/(integrations?|partners?|marketplace|ecosystem)\/?$/i, type: 'integrations', priority: 12 },
    { regex: /\/(changelog|whats-new|release-notes|updates)\/?$/i, type: 'changelog', priority: 14 },
    { regex: /\/(status|uptime)\/?$/i, type: 'status', priority: 14 },
    { regex: /\/(docs|documentation|api-docs|developers|api)\/[^/]+/i, type: 'docs', priority: 13 },
    { regex: /\/(customers?|testimonials?|reviews?)\/?$/i, type: 'other', priority: 12 },
  ];
  for (const pattern of patterns) {
    if (pattern.regex.test(url)) return { type: pattern.type, priority: pattern.priority };
  }
  return { type: 'other', priority: 50 };
}

// ============================================================
// Page scanner — comprehensive checks
// ============================================================
async function scanPage(url: string, pageType: PageType): Promise<PageScanResult> {
  const start = Date.now();
  const res = await safeFetch(url);
  const loadTimeMs = Date.now() - start;
  const html = await res.text();
  const $ = cheerio.load(html);
  const issues: string[] = [];

  // === BASIC META ===
  const title = $('title').first().text().trim() || null;
  if (!title) issues.push('Missing page title');
  else if (title.length < 20) issues.push('Page title is very short');
  else if (title.length > 70) issues.push('Page title is very long (may truncate)');

  const metaDescription = $('meta[name="description"]').attr('content')?.trim() || null;
  if (!metaDescription) issues.push('Missing meta description');
  else if (metaDescription.length < 50) issues.push('Meta description is very short');
  else if (metaDescription.length > 160) issues.push('Meta description is very long');

  const canonicalUrl = $('link[rel="canonical"]').attr('href')?.trim() || null;
  if (!canonicalUrl) issues.push('Missing canonical tag');

  // === P0: NOINDEX CHECK ===
  const hasNoindex = !!($('meta[name="robots"]').attr('content')?.toLowerCase().includes('noindex') ||
    $('meta[name="googlebot"]').attr('content')?.toLowerCase().includes('noindex'));
  if (hasNoindex) issues.push('Page has noindex tag — AI crawlers will ignore this page');

  // === P0: HTTPS CHECK ===
  const usesHttps = url.startsWith('https://');
  if (!usesHttps) issues.push('Page not served over HTTPS');

  // === SCHEMA / STRUCTURED DATA ===
  const schemaScripts = $('script[type="application/ld+json"]');
  const schemaTypes: string[] = [];
  let hasFaqSchema = false;
  let hasPricingSchema = false;
  schemaScripts.each((_, el) => {
    try {
      const json = JSON.parse($(el).html() || '');
      const t = json['@type'];
      if (t) {
        const typeStr = Array.isArray(t) ? t.join(', ') : t;
        schemaTypes.push(typeStr);
        if (typeStr.includes('FAQ')) hasFaqSchema = true;
        if (typeStr.includes('Offer') || typeStr.includes('Price')) hasPricingSchema = true;
      }
    } catch { /* ignore */ }
  });
  const hasSchema = schemaTypes.length > 0;
  if (!hasSchema) issues.push('No structured data (JSON-LD) found');

  // === H1 AND HEADINGS ===
  const h1Text = $('h1').first().text().trim() || null;
  if (!h1Text) issues.push('Missing H1 heading');

  const headings: { level: number; text: string }[] = [];
  const headingIssues: string[] = [];
  let lastLevel = 0;
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const level = parseInt(el.tagName.replace('h', ''));
    const text = $(el).text().trim();
    if (text) headings.push({ level, text: text.substring(0, 120) });
    // P1: Check heading hierarchy
    if (lastLevel > 0 && level > lastLevel + 1) {
      headingIssues.push(`Skipped from H${lastLevel} to H${level}`);
    }
    lastLevel = level;
  });
  const h1Count = $('h1').length;
  if (h1Count > 1) headingIssues.push(`Multiple H1 tags found (${h1Count})`);
  const headingHierarchyValid = headingIssues.length === 0;
  if (!headingHierarchyValid) issues.push('Heading hierarchy issues found');

  // === CONTENT ANALYSIS ===
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const wordCount = bodyText.split(' ').filter((w) => w.length > 0).length;
  if (wordCount < 100) issues.push('Very thin content (under 100 words)');

  const firstParagraph = $('main p, article p, .content p, body p').first().text().trim();
  const firstParagraphText = firstParagraph ? firstParagraph.substring(0, 300) : null;

  // === NAVIGATION ===
  const hasStructuredNav = $('nav').length > 0 || $('[role="navigation"]').length > 0;
  const navLinks: string[] = [];
  $('nav a[href], [role="navigation"] a[href], header a[href]').each((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim().toLowerCase();
    if (href && text) navLinks.push(text);
  });

  // === INTERNAL LINKS ===
  const hostname = new URL(url).hostname;
  const internalLinks: string[] = [];
  const nofollowInternalLinks: string[] = [];
  const anchorTextIssues: string[] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    const rel = $(el).attr('rel') || '';
    if (!href) return;
    try {
      const linkUrl = new URL(href, url);
      if (linkUrl.hostname === hostname && !linkUrl.hash) {
        const normalized = linkUrl.origin + linkUrl.pathname.replace(/\/+$/, '');
        if (!internalLinks.includes(normalized)) internalLinks.push(normalized);
        // P1: nofollow on internal links
        if (rel.includes('nofollow')) nofollowInternalLinks.push(normalized);
        // P1: bad anchor text
        if (text && (text.toLowerCase() === 'click here' || text.toLowerCase() === 'read more' || text.toLowerCase() === 'learn more' || text === href)) {
          anchorTextIssues.push(`"${text.substring(0, 30)}" → ${linkUrl.pathname}`);
        }
      }
    } catch { /* skip */ }
  });
  const hasNofollowIssues = nofollowInternalLinks.length > 0;
  if (hasNofollowIssues) issues.push('Internal links with nofollow detected');

  // === P0: OPEN GRAPH ===
  const ogTitle = $('meta[property="og:title"]').attr('content')?.trim() || null;
  const ogDescription = $('meta[property="og:description"]').attr('content')?.trim() || null;
  const ogImage = $('meta[property="og:image"]').attr('content')?.trim() || null;
  const hasOpenGraph = !!(ogTitle || ogDescription);
  if (!hasOpenGraph) issues.push('Missing Open Graph meta tags');

  // === P2: TWITTER CARD ===
  const hasTwitterCard = !!$('meta[name="twitter:card"]').attr('content');

  // === P0: IMAGE ALT TEXT ===
  const totalImages = $('img').length;
  let imagesWithoutAlt = 0;
  $('img').each((_, el) => {
    const alt = $(el).attr('alt');
    if (!alt || alt.trim() === '') imagesWithoutAlt++;
  });
  if (totalImages > 0 && imagesWithoutAlt > totalImages * 0.5) {
    issues.push(`${imagesWithoutAlt} of ${totalImages} images missing alt text`);
  }

  // === P1: LANGUAGE ATTRIBUTE ===
  const langValue = $('html').attr('lang')?.trim() || null;
  const hasLangAttribute = !!langValue;
  if (!hasLangAttribute) issues.push('Missing language attribute on HTML tag');

  // === P1: BREADCRUMBS ===
  const hasBreadcrumbs = schemaTypes.some(t => t.includes('BreadcrumbList')) || $('[class*="breadcrumb"], nav[aria-label*="readcrumb"]').length > 0;

  // === P1: ARTICLE DATES & AUTHOR ===
  const hasArticleDates = !!($('time[datetime]').length > 0 || $('meta[property="article:published_time"]').attr('content'));
  const hasAuthorInfo = !!($('meta[name="author"]').attr('content') || schemaTypes.some(t => t.includes('Person')) || $('[class*="author"], [rel="author"]').length > 0);

  // === P0: COMMERCIAL SIGNALS ===
  const bodyHtml = $('body').html()?.toLowerCase() || '';
  const hasPricingContent = !!(bodyHtml.includes('$/mo') || bodyHtml.includes('/month') || bodyHtml.includes('/year') || bodyHtml.includes('pricing') || bodyHtml.includes('free plan') || bodyHtml.includes('enterprise'));
  const hasCtaButton = !!($('a[href*="signup"], a[href*="sign-up"], a[href*="register"], a[href*="trial"], a[href*="demo"], a[href*="get-started"], button:contains("Sign"), button:contains("Start"), button:contains("Try"), button:contains("Get"), a:contains("Sign Up"), a:contains("Start Free"), a:contains("Try Free"), a:contains("Get Started"), a:contains("Book a Demo"), a:contains("Request Demo")').length > 0);

  // === P0: TRUST SIGNALS ===
  const hasCustomerLogos = !!($('[class*="logo"], [class*="customer"], [class*="client"], [class*="trusted"]').length > 2 || bodyHtml.includes('trusted by') || bodyHtml.includes('used by') || bodyHtml.includes('customers include'));
  const hasTestimonials = !!($('[class*="testimonial"], [class*="review"], [class*="quote"], blockquote').length > 0 || bodyHtml.includes('testimonial'));

  // === P0: REVIEW PLATFORM LINKS ===
  const reviewPlatformUrls: string[] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    for (const platform of REVIEW_PLATFORMS) {
      if (href.includes(platform) && !reviewPlatformUrls.includes(href)) {
        reviewPlatformUrls.push(href);
      }
    }
  });
  const hasReviewLinks = reviewPlatformUrls.length > 0;

  // === P0: SOCIAL LINKS ===
  const socialLinkUrls: string[] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    for (const platform of SOCIAL_PLATFORMS) {
      if (href.includes(platform) && !socialLinkUrls.includes(href)) {
        socialLinkUrls.push(href);
      }
    }
  });
  const hasSocialLinks = socialLinkUrls.length > 0;

  // === P0: PRIVACY/TERMS LINKS ===
  const hasPrivacyLink = !!($('a[href*="privacy"]').length > 0);
  const hasTermsLink = !!($('a[href*="terms"]').length > 0);

  // === P1: COMPARISON/USE-CASE CONTENT ===
  const hasComparisonContent = !!(bodyHtml.includes(' vs ') || bodyHtml.includes('compare') || bodyHtml.includes('alternative'));
  const hasUseCaseContent = !!(bodyHtml.includes('use case') || bodyHtml.includes('how teams use') || bodyHtml.includes('built for'));
  const hasSecurityPage = !!(bodyHtml.includes('soc 2') || bodyHtml.includes('soc2') || bodyHtml.includes('gdpr') || bodyHtml.includes('compliance') || bodyHtml.includes('security'));
  const hasFreeTrial = !!(bodyHtml.includes('free trial') || bodyHtml.includes('try free') || bodyHtml.includes('start free') || bodyHtml.includes('freemium') || bodyHtml.includes('free plan'));
  const hasTeamInfo = !!($('[class*="team"], [class*="people"]').length > 0 || bodyHtml.includes('our team') || bodyHtml.includes('meet the'));

  // === P2 CHECKS ===
  const hasTableHeaders = $('table th').length > 0 || $('table').length === 0;
  const usesSemanticLists = $('ul, ol').length > 0;
  const hasViewportMeta = !!$('meta[name="viewport"]').attr('content');
  const hasAddressInfo = !!($('address').length > 0 || bodyHtml.match(/\d{5}/) || bodyHtml.includes('street') || bodyHtml.includes('suite'));

  // === JS DEPENDENCY CHECK ===
  const scriptCount = $('script[src]').length;
  if (scriptCount > 15 && wordCount < 200) {
    issues.push('Page may rely heavily on JavaScript for content rendering');
  }

  // Raw HTML preview
  const rawTitle = title || '(no title)';
  const rawDesc = metaDescription || '(no meta description)';
  const rawH1 = h1Text || '(no H1)';
  const rawBodySnippet = bodyText.substring(0, 300).trim();
  const rawHtmlPreview = `Title: ${rawTitle}\nMeta: ${rawDesc}\nH1: ${rawH1}\nSchema: ${schemaTypes.join(', ') || 'none'}\n---\n${rawBodySnippet}`;

  // Content hash for duplicate detection
  const duplicateContentHash = simpleHash(bodyText.substring(0, 500));

  return {
    url, pageType, statusCode: res.status, title, metaDescription,
    canonicalUrl, hasSchema, schemaTypes, h1Text, wordCount, loadTimeMs,
    headings, hasStructuredNav, internalLinks, issues,
    rawHtmlPreview: rawHtmlPreview.substring(0, 800),
    // P0
    hasNoindex, usesHttps, hasOpenGraph, ogTags: { title: ogTitle, description: ogDescription, image: ogImage },
    imagesWithoutAlt, totalImages, hasPricingContent, hasCtaButton,
    firstParagraphText, hasCustomerLogos, hasTestimonials,
    hasReviewLinks, reviewPlatformUrls, hasSocialLinks, socialLinkUrls,
    hasPrivacyLink, hasTermsLink, navLinks,
    // P1
    headingHierarchyValid, headingIssues, hasLangAttribute, langValue,
    hasBreadcrumbs, hasFaqSchema, hasPricingSchema, hasArticleDates,
    hasAuthorInfo, hasNofollowIssues, nofollowInternalLinks,
    duplicateContentHash, anchorTextIssues, hasComparisonContent,
    hasUseCaseContent, hasSecurityPage, hasFreeTrial, hasTeamInfo,
    // P2
    hasTwitterCard, hasTableHeaders, usesSemanticLists, hasViewportMeta, hasAddressInfo,
  };
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

// ============================================================
// Page discovery
// ============================================================
function discoverKeyPages(links: string[]): { url: string; type: PageType; priority: number }[] {
  const keyPages: { url: string; type: PageType; priority: number }[] = [];
  for (const link of links) {
    const { type, priority } = categorizeUrl(link);
    if (type === 'other' && priority >= 50) continue;
    const existingOfType = keyPages.filter((p) => p.type === type);
    const maxPerType = ['product', 'blog', 'docs', 'resource'].includes(type) ? 5 : 2;
    if (existingOfType.length >= maxPerType) continue;
    keyPages.push({ url: link, type, priority });
  }
  return keyPages.sort((a, b) => a.priority - b.priority);
}

// ============================================================
// Per-crawler status — enriched with metadata + readiness
// ============================================================

interface CrawlerMeta {
  name: string;
  displayName: string;
  operator: string;
  description: string;
  visibilityValue: 'search_citation' | 'assistant_browsing' | 'training_corpus' | 'unknown';
  visibilityLabel: string;
  contentFocus: string[];
}

const CRAWLER_METADATA: CrawlerMeta[] = [
  { name: 'GPTBot', displayName: 'GPTBot', operator: 'OpenAI', description: 'OpenAI\'s web crawler that indexes content for ChatGPT and other OpenAI products. Used to gather training data and keep ChatGPT\'s knowledge current.', visibilityValue: 'search_citation', visibilityLabel: 'Search & Citation', contentFocus: ['structured_data', 'clear_content', 'product_pages'] },
  { name: 'ChatGPT-User', displayName: 'ChatGPT User', operator: 'OpenAI', description: 'Fetches pages in real-time when ChatGPT users browse the web or ask questions that trigger live web access. This is direct assistant browsing.', visibilityValue: 'assistant_browsing', visibilityLabel: 'Assistant Browsing', contentFocus: ['fast_loading', 'clear_content', 'pricing', 'product_pages'] },
  { name: 'Google-Extended', displayName: 'Google AI', operator: 'Google', description: 'Google\'s crawler for AI products including Gemini. Controls whether your content is used by Google\'s generative AI features in search and Gemini.', visibilityValue: 'search_citation', visibilityLabel: 'Search & Citation', contentFocus: ['structured_data', 'schema', 'open_graph', 'clear_content'] },
  { name: 'ClaudeBot', displayName: 'ClaudeBot', operator: 'Anthropic', description: 'Anthropic\'s web crawler used to help Claude access and reference web content. Supports Claude\'s ability to provide current, accurate information.', visibilityValue: 'search_citation', visibilityLabel: 'Search & Citation', contentFocus: ['clear_content', 'structured_data', 'trust_signals'] },
  { name: 'PerplexityBot', displayName: 'PerplexityBot', operator: 'Perplexity AI', description: 'Perplexity\'s crawler for its AI-powered search engine. Perplexity directly cites sources in answers, making it a high-value citation source.', visibilityValue: 'search_citation', visibilityLabel: 'Search & Citation', contentFocus: ['clear_content', 'pricing', 'product_pages', 'comparison'] },
  { name: 'Anthropic', displayName: 'Anthropic', operator: 'Anthropic', description: 'Anthropic\'s general crawler for building and improving Claude\'s capabilities. Separate from ClaudeBot\'s real-time browsing.', visibilityValue: 'training_corpus', visibilityLabel: 'Training & Corpus', contentFocus: ['clear_content', 'trust_signals', 'structured_data'] },
  { name: 'CCBot', displayName: 'CCBot', operator: 'Common Crawl', description: 'Common Crawl\'s web crawler that builds a free, open web archive used by many AI companies for training data. Widely used as a foundational data source.', visibilityValue: 'training_corpus', visibilityLabel: 'Training & Corpus', contentFocus: ['clear_content', 'html_structure'] },
  { name: 'Bytespider', displayName: 'Bytespider', operator: 'ByteDance', description: 'ByteDance\'s web crawler, used for various products including search and AI features. Provides visibility in ByteDance\'s ecosystem.', visibilityValue: 'unknown', visibilityLabel: 'Unknown', contentFocus: ['clear_content'] },
  { name: 'Amazonbot', displayName: 'Amazonbot', operator: 'Amazon', description: 'Amazon\'s crawler used for Alexa AI and Amazon\'s product recommendation systems. Relevant if your product integrates with or competes in Amazon\'s ecosystem.', visibilityValue: 'assistant_browsing', visibilityLabel: 'Assistant Browsing', contentFocus: ['product_pages', 'pricing', 'clear_content'] },
  { name: 'Meta-ExternalAgent', displayName: 'Meta AI', operator: 'Meta', description: 'Meta\'s crawler for AI products including Meta AI assistant across Facebook, Instagram, and WhatsApp. Expanding presence in AI search.', visibilityValue: 'search_citation', visibilityLabel: 'Search & Citation', contentFocus: ['open_graph', 'clear_content', 'social_signals'] },
];

function buildCrawlerStatuses(robotsTxt: RobotsTxtResult | null, pages: PageScanResult[]): CrawlerStatus[] {
  // Parse robots.txt for access rules
  let wildcardBlocked = false;
  const lines = robotsTxt?.content ? robotsTxt.content.split('\n').map(l => l.trim()) : [];
  let inWildcard = false;
  for (const line of lines) {
    if (line.toLowerCase().startsWith('user-agent:')) { inWildcard = line.substring(11).trim() === '*'; }
    else if (inWildcard && (line.toLowerCase() === 'disallow: /' || line.toLowerCase() === 'disallow: *')) { wildcardBlocked = true; }
  }

  // Compute site-level readiness signals
  const homepage = pages.find(p => p.pageType === 'homepage');
  const totalPages = pages.length || 1;
  const pagesWithSchema = pages.filter(p => p.hasSchema).length;
  const pagesWithOG = pages.filter(p => p.hasOpenGraph).length;
  const pagesWithMeta = pages.filter(p => p.metaDescription).length;
  const pagesWithTitle = pages.filter(p => p.title).length;
  const avgLoadTime = pages.reduce((s, p) => s + (p.loadTimeMs || 0), 0) / totalPages;
  const hasStructuredData = pagesWithSchema > 0;
  const hasPricingPage = pages.some(p => p.pageType === 'pricing');
  const hasProductPage = pages.some(p => p.pageType === 'product');
  const hasComparisonContent = pages.some(p => p.pageType === 'comparison' || p.hasComparisonContent);
  const hasSocialLinks = homepage?.hasSocialLinks || false;
  const hasCustomerLogos = homepage?.hasCustomerLogos || false;
  const hasReviewLinks = pages.some(p => p.hasReviewLinks);
  const hasClearHomepage = homepage?.h1Text ? homepage.h1Text.length > 15 && !homepage.h1Text.toLowerCase().includes('welcome') : false;
  const jsHeavyPages = pages.filter(p => p.issues.some(i => i.includes('JavaScript'))).length;

  return CRAWLER_METADATA.map(meta => {
    // Determine access status
    let status: 'allowed' | 'blocked' | 'no_rule' = 'no_rule';
    let statusBasis: 'explicit_rule' | 'wildcard_rule' | 'default' = 'default';
    let statusDetail = 'No specific rule found — allowed by default';

    if (robotsTxt?.exists && robotsTxt.content) {
      let agentActive = false, agentBlocked = false, agentAllowed = false;
      for (const line of lines) {
        if (line.toLowerCase().startsWith('user-agent:')) { agentActive = line.substring(11).trim().toLowerCase() === meta.name.toLowerCase(); }
        else if (agentActive) {
          if (line.toLowerCase() === 'disallow: /' || line.toLowerCase() === 'disallow: *') agentBlocked = true;
          else if (line.toLowerCase() === 'allow: /') agentAllowed = true;
        }
      }
      if (agentBlocked) {
        status = 'blocked'; statusBasis = 'explicit_rule';
        statusDetail = `Blocked via robots.txt rule: User-agent: ${meta.name} / Disallow: /`;
      } else if (agentAllowed) {
        status = 'allowed'; statusBasis = 'explicit_rule';
        statusDetail = `Explicitly allowed via robots.txt rule: User-agent: ${meta.name} / Allow: /`;
      } else if (wildcardBlocked) {
        status = 'blocked'; statusBasis = 'wildcard_rule';
        statusDetail = 'Blocked via wildcard rule: User-agent: * / Disallow: /';
      } else {
        status = 'no_rule'; statusBasis = 'default';
        statusDetail = 'No specific rule — allowed by default under robots.txt convention';
      }
    } else if (!robotsTxt?.exists) {
      statusDetail = 'No robots.txt found — all crawlers allowed by default';
    }

    // Compute readiness score for this source
    const barriers: string[] = [];
    const recommendations: string[] = [];
    let readiness = 100;

    // Universal barriers
    if (status === 'blocked') { readiness -= 40; barriers.push('Crawler is blocked by robots.txt'); recommendations.push(`Allow ${meta.name} in your robots.txt to enable access`); }
    if (pagesWithTitle < totalPages) { readiness -= 5; barriers.push('Some pages missing title tags'); }
    if (pagesWithMeta < totalPages * 0.5) { readiness -= 5; barriers.push('Many pages missing meta descriptions'); }
    if (jsHeavyPages > 0) { readiness -= 8; barriers.push('JS-heavy pages may not render for crawlers'); recommendations.push('Ensure key content is in initial HTML, not loaded via JavaScript'); }
    if (avgLoadTime > 3000) { readiness -= 5; barriers.push('Slow page load times may cause timeouts'); }

    // Source-specific barriers based on content focus
    for (const focus of meta.contentFocus) {
      switch (focus) {
        case 'structured_data':
          if (!hasStructuredData) { readiness -= 8; if (!barriers.includes('No structured data (JSON-LD) found')) { barriers.push('No structured data (JSON-LD) found'); recommendations.push('Add Organization schema to homepage and Product schema to product pages'); } }
          break;
        case 'schema':
          if (pagesWithSchema < totalPages * 0.3) { readiness -= 5; if (!barriers.includes('Limited schema coverage')) { barriers.push('Limited schema coverage across pages'); } }
          break;
        case 'open_graph':
          if (pagesWithOG < totalPages * 0.5) { readiness -= 6; if (!barriers.includes('Missing Open Graph tags')) { barriers.push('Missing Open Graph tags on most pages'); recommendations.push('Add og:title, og:description, og:image to all key pages'); } }
          break;
        case 'clear_content':
          if (!hasClearHomepage) { readiness -= 5; if (!barriers.includes('Homepage heading may be vague')) { barriers.push('Homepage heading may not clearly describe your product'); recommendations.push('Rewrite your H1 to clearly state what you do and who it\'s for'); } }
          break;
        case 'pricing':
          if (!hasPricingPage) { readiness -= 6; if (!barriers.includes('No pricing page')) { barriers.push('No pricing page discoverable'); recommendations.push('Create a dedicated pricing page with clear plans and pricing'); } }
          break;
        case 'product_pages':
          if (!hasProductPage) { readiness -= 5; if (!barriers.includes('No product pages')) { barriers.push('No dedicated product/features pages'); recommendations.push('Create product pages explaining what you do and key features'); } }
          break;
        case 'comparison':
          if (!hasComparisonContent) { readiness -= 4; if (!barriers.includes('No comparison content')) { barriers.push('No comparison or vs. content found'); recommendations.push('Create comparison pages for top competitors'); } }
          break;
        case 'trust_signals':
          if (!hasCustomerLogos && !hasReviewLinks) { readiness -= 5; if (!barriers.includes('Weak trust signals')) { barriers.push('Weak trust signals — no customer logos or review links'); recommendations.push('Add customer logos and link to review platforms (G2, Capterra)'); } }
          break;
        case 'social_signals':
          if (!hasSocialLinks) { readiness -= 4; if (!barriers.includes('No social media links')) { barriers.push('No social media profiles linked'); recommendations.push('Link your social profiles in the footer'); } }
          break;
        case 'fast_loading':
          if (avgLoadTime > 2000) { readiness -= 5; if (!barriers.includes('Pages may be slow for real-time browsing')) { barriers.push('Pages may be slow for real-time assistant browsing'); recommendations.push('Optimize page load speed to under 2 seconds for key pages'); } }
          break;
        case 'html_structure':
          const badHeadings = pages.filter(p => !p.headingHierarchyValid).length;
          if (badHeadings > totalPages * 0.3) { readiness -= 4; if (!barriers.includes('Heading hierarchy issues')) { barriers.push('Heading hierarchy issues on many pages'); } }
          break;
      }
    }

    // Floor the readiness score
    readiness = Math.max(status === 'blocked' ? 10 : 25, Math.min(100, readiness));

    return {
      name: meta.name,
      displayName: meta.displayName,
      operator: meta.operator,
      status,
      statusBasis,
      statusDetail,
      visibilityValue: meta.visibilityValue,
      visibilityLabel: meta.visibilityLabel,
      description: meta.description,
      readinessScore: readiness,
      barriers: barriers.slice(0, 6),
      recommendations: recommendations.slice(0, 4),
      confidenceLevel: 'observed' as const,
    };
  });
}

// ============================================================
// Key pages status
// ============================================================
function buildKeyPagesStatus(pages: PageScanResult[]): KeyPageStatus[] {
  const keyTypes: { type: string; label: string }[] = [
    { type: 'homepage', label: 'Homepage' },
    { type: 'pricing', label: 'Pricing Page' },
    { type: 'product', label: 'Product / Features' },
    { type: 'contact', label: 'Contact Page' },
    { type: 'demo', label: 'Demo / Trial' },
    { type: 'docs', label: 'Documentation' },
    { type: 'blog', label: 'Blog / Content' },
    { type: 'about', label: 'About / Team' },
    { type: 'security', label: 'Security / Compliance' },
    { type: 'privacy', label: 'Privacy Policy' },
    { type: 'comparison', label: 'Comparison Pages' },
    { type: 'integrations', label: 'Integrations' },
  ];
  return keyTypes.map(kt => {
    const found = pages.find(p => p.pageType === kt.type);
    return { type: kt.type, label: kt.label, found: !!found, url: found?.url || null };
  });
}

// ============================================================
// Site-wide checks
// ============================================================
function buildSiteWideChecks(pages: PageScanResult[], homepage: PageScanResult): SiteWideChecks {
  const noindexPages = pages.filter(p => p.hasNoindex).map(p => p.url);
  const brokenLinks: string[] = [];
  const nofollowLinks: string[] = [];
  for (const p of pages) {
    if (p.nofollowInternalLinks.length > 0) nofollowLinks.push(...p.nofollowInternalLinks);
  }
  const socialLinks = homepage.socialLinkUrls || [];
  const reviewLinks = pages.flatMap(p => p.reviewPlatformUrls);
  const navHasKey = (key: string) => homepage.navLinks.some(l => l.includes(key));

  const missingNavLinks: string[] = [];
  if (!navHasKey('pricing') && !navHasKey('price') && !navHasKey('plan')) missingNavLinks.push('Pricing');
  if (!navHasKey('product') && !navHasKey('feature') && !navHasKey('platform') && !navHasKey('solution')) missingNavLinks.push('Product');
  if (!navHasKey('contact') && !navHasKey('demo') && !navHasKey('talk') && !navHasKey('get started')) missingNavLinks.push('Contact/Demo');

  return {
    usesHttps: homepage.usesHttps,
    hasNoindexOnKeyPages: noindexPages.length > 0,
    noindexPages,
    hasNofollowOnKeyLinks: nofollowLinks.length > 0,
    nofollowLinks: Array.from(new Set(nofollowLinks)),
    hasRedirectChains: false,
    redirectChainUrls: [],
    hasBrokenLinks: brokenLinks.length > 0,
    brokenLinks,
    hasPrivacyPolicy: pages.some(p => p.pageType === 'privacy') || homepage.hasPrivacyLink,
    hasTermsOfService: pages.some(p => p.pageType === 'terms') || homepage.hasTermsLink,
    hasSocialLinks: socialLinks.length > 0,
    socialLinks,
    hasCustomerLogos: homepage.hasCustomerLogos,
    hasTestimonials: pages.some(p => p.hasTestimonials),
    hasReviewPlatformLinks: reviewLinks.length > 0,
    reviewPlatformLinks: Array.from(new Set(reviewLinks)),
    navigationLinksToKeyPages: missingNavLinks.length === 0,
    missingNavLinks,
  };
}

function defaultSiteWideChecks(): SiteWideChecks {
  return {
    usesHttps: false, hasNoindexOnKeyPages: false, noindexPages: [],
    hasNofollowOnKeyLinks: false, nofollowLinks: [], hasRedirectChains: false,
    redirectChainUrls: [], hasBrokenLinks: false, brokenLinks: [],
    hasPrivacyPolicy: false, hasTermsOfService: false, hasSocialLinks: false,
    socialLinks: [], hasCustomerLogos: false, hasTestimonials: false,
    hasReviewPlatformLinks: false, reviewPlatformLinks: [],
    navigationLinksToKeyPages: false, missingNavLinks: [],
  };
}
