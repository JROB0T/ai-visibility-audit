import type {
  ScanResult,
  ScoreResult,
  CategoryScore,
  RecommendationInput,
} from '@/lib/types';

// ============================================================
// Main scoring function
// ============================================================
export function calculateScores(scan: ScanResult): ScoreResult {
  const crawlability = scoreCrawlability(scan);
  const machineReadability = scoreMachineReadability(scan);
  const commercialClarity = scoreCommercialClarity(scan);
  const trustClarity = scoreTrustClarity(scan);

  const overall = Math.round(
    crawlability.score * 0.3 +
    machineReadability.score * 0.25 +
    commercialClarity.score * 0.3 +
    trustClarity.score * 0.15
  );

  return { overall, crawlability, machineReadability, commercialClarity, trustClarity };
}

// ============================================================
// Generate all recommendations from scan results
// ============================================================
export function generateRecommendations(scan: ScanResult): RecommendationInput[] {
  const recs: RecommendationInput[] = [];
  const sw = scan.siteWideChecks;

  // ========== CRAWLABILITY ==========

  if (!scan.robotsTxt?.exists) {
    recs.push({ category: 'crawlability', severity: 'high', effort: 'easy', title: 'Add a robots.txt file',
      whyItMatters: 'Without robots.txt, AI crawlers have no guidance on what to index.',
      recommendedFix: 'Create a robots.txt at your site root with Allow rules for AI crawlers and a Sitemap reference.',
      codeSnippet: null, affectedUrls: [] });
  }

  if (scan.robotsTxt?.blocksAI) {
    recs.push({ category: 'crawlability', severity: 'high', effort: 'easy',
      title: `AI crawlers are blocked: ${scan.robotsTxt.blockedAgents.join(', ')}`,
      whyItMatters: 'Blocked AI crawlers cannot read your site. AI search and assistants will not reference your content.',
      recommendedFix: 'Remove Disallow rules for AI crawlers you want to allow.',
      codeSnippet: null, affectedUrls: [] });
  }

  if (!scan.sitemap?.exists) {
    recs.push({ category: 'crawlability', severity: 'high', effort: 'easy', title: 'Add an XML sitemap',
      whyItMatters: 'A sitemap tells crawlers exactly which pages exist. Without one, they may miss key content.',
      recommendedFix: 'Generate a sitemap.xml listing your key pages and reference it in robots.txt.',
      codeSnippet: null, affectedUrls: [] });
  } else if (scan.sitemap.urlCount && scan.sitemap.urlCount < 5) {
    recs.push({ category: 'crawlability', severity: 'medium', effort: 'easy', title: 'Sitemap has very few URLs',
      whyItMatters: 'Your sitemap only lists a handful of pages. Ensure all important pages are included.',
      recommendedFix: 'Add pricing, product, docs, and blog pages to your sitemap.',
      codeSnippet: null, affectedUrls: [scan.sitemap.url || ''] });
  }

  // P0: Noindex on key pages
  if (sw?.hasNoindexOnKeyPages) {
    recs.push({ category: 'crawlability', severity: 'high', effort: 'easy',
      title: 'Key pages have noindex tags — AI crawlers will ignore them',
      whyItMatters: 'Pages with noindex are completely invisible to AI systems. They cannot be cited, summarized, or recommended.',
      recommendedFix: 'Remove the noindex meta tag from any pages you want AI to discover.',
      codeSnippet: null, affectedUrls: sw.noindexPages });
  }

  // P0: HTTPS
  if (!sw?.usesHttps) {
    recs.push({ category: 'crawlability', severity: 'high', effort: 'medium',
      title: 'Site is not served over HTTPS',
      whyItMatters: 'AI systems deprioritize insecure sites. HTTPS is a baseline trust signal.',
      recommendedFix: 'Install an SSL certificate and redirect all HTTP traffic to HTTPS.',
      codeSnippet: null, affectedUrls: [] });
  }

  // P1: Nofollow on internal links
  if (sw?.hasNofollowOnKeyLinks) {
    recs.push({ category: 'crawlability', severity: 'medium', effort: 'easy',
      title: 'Internal links have nofollow attributes',
      whyItMatters: 'Nofollow on internal links tells crawlers not to follow those paths, potentially hiding key pages.',
      recommendedFix: 'Remove rel="nofollow" from internal links pointing to your own pages.',
      codeSnippet: null, affectedUrls: sw.nofollowLinks.slice(0, 5) });
  }

  // P0: Nav links to key pages
  if (sw && !sw.navigationLinksToKeyPages && sw.missingNavLinks.length > 0) {
    recs.push({ category: 'crawlability', severity: 'high', effort: 'easy',
      title: `Navigation missing links to: ${sw.missingNavLinks.join(', ')}`,
      whyItMatters: 'AI crawlers use navigation to discover your most important pages. Missing nav links means they may never find them.',
      recommendedFix: `Add links to ${sw.missingNavLinks.join(', ')} in your main navigation.`,
      codeSnippet: null, affectedUrls: [] });
  }

  // ========== MACHINE READABILITY ==========

  const pagesWithoutTitle = scan.pages.filter((p) => !p.title);
  if (pagesWithoutTitle.length > 0) {
    recs.push({ category: 'machine_readability', severity: 'high', effort: 'easy',
      title: 'Pages missing title tags',
      whyItMatters: 'Title tags are the primary way AI identifies what a page is about.',
      recommendedFix: 'Add unique, descriptive <title> tags (50-60 characters) to every page.',
      codeSnippet: null, affectedUrls: pagesWithoutTitle.map((p) => p.url) });
  }

  const pagesWithoutMeta = scan.pages.filter((p) => !p.metaDescription);
  if (pagesWithoutMeta.length > 0) {
    recs.push({ category: 'machine_readability', severity: 'high', effort: 'easy',
      title: 'Pages missing meta descriptions',
      whyItMatters: 'Meta descriptions are used as summaries when AI references your content.',
      recommendedFix: 'Add meta descriptions (120-155 characters) describing each page.',
      codeSnippet: null, affectedUrls: pagesWithoutMeta.map((p) => p.url) });
  }

  const pagesWithoutCanonical = scan.pages.filter((p) => !p.canonicalUrl);
  if (pagesWithoutCanonical.length > 0) {
    recs.push({ category: 'machine_readability', severity: 'medium', effort: 'easy',
      title: 'Pages missing canonical tags',
      whyItMatters: 'Without canonical tags, AI may index duplicate versions of your pages.',
      recommendedFix: 'Add <link rel="canonical"> pointing to the preferred URL on each page.',
      codeSnippet: null, affectedUrls: pagesWithoutCanonical.map((p) => p.url) });
  }

  const pagesWithoutSchema = scan.pages.filter((p) => !p.hasSchema);
  if (pagesWithoutSchema.length > 0) {
    recs.push({ category: 'machine_readability', severity: 'high', effort: 'medium',
      title: 'Pages missing structured data (JSON-LD)',
      whyItMatters: 'Structured data tells AI exactly what each page represents in machine-readable format.',
      recommendedFix: 'Add JSON-LD: Organization on homepage, Product on product pages, Article on blog posts.',
      codeSnippet: null, affectedUrls: pagesWithoutSchema.map((p) => p.url) });
  }

  const pagesWithoutH1 = scan.pages.filter((p) => !p.h1Text);
  if (pagesWithoutH1.length > 0) {
    recs.push({ category: 'machine_readability', severity: 'medium', effort: 'easy',
      title: 'Pages missing H1 headings',
      whyItMatters: 'The H1 is a strong signal for page topic identification.',
      recommendedFix: 'Add a single, clear H1 heading on every page.',
      codeSnippet: null, affectedUrls: pagesWithoutH1.map((p) => p.url) });
  }

  const thinPages = scan.pages.filter((p) => p.wordCount !== null && p.wordCount < 100);
  if (thinPages.length > 0) {
    recs.push({ category: 'machine_readability', severity: 'medium', effort: 'harder',
      title: 'Pages with very thin content',
      whyItMatters: 'Pages with very little text are unlikely to be referenced by AI.',
      recommendedFix: 'Add meaningful content (at least 300 words on key pages).',
      codeSnippet: null, affectedUrls: thinPages.map((p) => p.url) });
  }

  // P0: Open Graph tags
  const pagesWithoutOG = scan.pages.filter((p) => !p.hasOpenGraph);
  if (pagesWithoutOG.length > scan.pages.length * 0.5) {
    recs.push({ category: 'machine_readability', severity: 'high', effort: 'easy',
      title: 'Most pages missing Open Graph meta tags',
      whyItMatters: 'Open Graph tags control how your pages appear when shared and are used by AI systems for page summaries.',
      recommendedFix: 'Add og:title, og:description, and og:image meta tags to every page.',
      codeSnippet: null, affectedUrls: pagesWithoutOG.slice(0, 5).map((p) => p.url) });
  }

  // P0: Image alt text
  const totalImages = scan.pages.reduce((sum, p) => sum + p.totalImages, 0);
  const missingAlt = scan.pages.reduce((sum, p) => sum + p.imagesWithoutAlt, 0);
  if (totalImages > 0 && missingAlt > totalImages * 0.3) {
    recs.push({ category: 'machine_readability', severity: 'high', effort: 'medium',
      title: `${missingAlt} of ${totalImages} images missing alt text`,
      whyItMatters: 'AI crawlers cannot see images. Alt text is the only way they understand what an image shows.',
      recommendedFix: 'Add descriptive alt attributes to all meaningful images.',
      codeSnippet: null, affectedUrls: scan.pages.filter(p => p.imagesWithoutAlt > 0).slice(0, 5).map(p => p.url) });
  }

  // P1: Heading hierarchy
  const badHeadingPages = scan.pages.filter((p) => !p.headingHierarchyValid);
  if (badHeadingPages.length > 0) {
    recs.push({ category: 'machine_readability', severity: 'medium', effort: 'easy',
      title: 'Heading hierarchy issues found',
      whyItMatters: 'Logical heading order (H1→H2→H3) helps AI understand content structure and importance.',
      recommendedFix: 'Ensure headings follow a logical hierarchy without skipping levels.',
      codeSnippet: null, affectedUrls: badHeadingPages.slice(0, 5).map((p) => p.url) });
  }

  // P1: Language attribute
  const noLang = scan.pages.filter((p) => !p.hasLangAttribute);
  if (noLang.length > 0) {
    recs.push({ category: 'machine_readability', severity: 'medium', effort: 'easy',
      title: 'HTML missing language attribute',
      whyItMatters: 'The lang attribute tells AI what language your content is in, improving comprehension.',
      recommendedFix: 'Add lang="en" (or appropriate language) to your <html> tag.',
      codeSnippet: null, affectedUrls: noLang.slice(0, 3).map((p) => p.url) });
  }

  // P1: Breadcrumbs
  const noBreadcrumbs = scan.pages.filter((p) => p.pageType !== 'homepage' && !p.hasBreadcrumbs);
  if (noBreadcrumbs.length > scan.pages.length * 0.5) {
    recs.push({ category: 'machine_readability', severity: 'low', effort: 'medium',
      title: 'Most pages lack breadcrumb navigation',
      whyItMatters: 'Breadcrumbs help AI understand your site hierarchy and page relationships.',
      recommendedFix: 'Add breadcrumb navigation with BreadcrumbList schema to inner pages.',
      codeSnippet: null, affectedUrls: [] });
  }

  // P1: FAQ schema on FAQ-like pages
  const faqPages = scan.pages.filter((p) => p.url.includes('faq') || p.url.includes('frequently'));
  if (faqPages.length > 0 && !faqPages.some(p => p.hasFaqSchema)) {
    recs.push({ category: 'machine_readability', severity: 'medium', effort: 'easy',
      title: 'FAQ pages missing FAQPage schema',
      whyItMatters: 'FAQ schema lets AI directly answer questions from your content.',
      recommendedFix: 'Add FAQPage JSON-LD structured data to your FAQ pages.',
      codeSnippet: null, affectedUrls: faqPages.map(p => p.url) });
  }

  // P1: Pricing schema
  const pricingPages = scan.pages.filter((p) => p.pageType === 'pricing');
  if (pricingPages.length > 0 && !pricingPages.some(p => p.hasPricingSchema)) {
    recs.push({ category: 'machine_readability', severity: 'medium', effort: 'easy',
      title: 'Pricing page missing Offer/Price schema',
      whyItMatters: 'Pricing schema enables AI to answer "how much does it cost?" accurately.',
      recommendedFix: 'Add Offer or PriceSpecification schema to your pricing page.',
      codeSnippet: null, affectedUrls: pricingPages.map(p => p.url) });
  }

  // P1: Article dates
  const blogPages = scan.pages.filter((p) => p.pageType === 'blog');
  const blogNoDates = blogPages.filter(p => !p.hasArticleDates);
  if (blogNoDates.length > 0) {
    recs.push({ category: 'machine_readability', severity: 'medium', effort: 'easy',
      title: 'Blog posts missing publish dates',
      whyItMatters: 'AI systems use dates to assess content freshness. Undated content may be treated as stale.',
      recommendedFix: 'Add visible dates and article:published_time meta tags to blog posts.',
      codeSnippet: null, affectedUrls: blogNoDates.slice(0, 5).map(p => p.url) });
  }

  // P1: Author info
  const blogNoAuthor = blogPages.filter(p => !p.hasAuthorInfo);
  if (blogNoAuthor.length > 0) {
    recs.push({ category: 'machine_readability', severity: 'low', effort: 'easy',
      title: 'Blog posts missing author information',
      whyItMatters: 'Author attribution is an E-E-A-T signal that helps AI trust your content.',
      recommendedFix: 'Add author names with meta tags or Person schema to blog posts.',
      codeSnippet: null, affectedUrls: blogNoAuthor.slice(0, 5).map(p => p.url) });
  }

  // P1: Anchor text
  const badAnchors = scan.pages.filter(p => p.anchorTextIssues.length > 0);
  if (badAnchors.length > 0) {
    recs.push({ category: 'machine_readability', severity: 'low', effort: 'easy',
      title: 'Internal links use vague anchor text',
      whyItMatters: 'Descriptive link text helps AI understand what the linked page is about.',
      recommendedFix: 'Replace "click here" and "read more" with descriptive anchor text.',
      codeSnippet: null, affectedUrls: badAnchors.slice(0, 5).map(p => p.url) });
  }

  // P1: Duplicate content
  const hashMap = new Map<string, string[]>();
  for (const p of scan.pages) {
    if (p.duplicateContentHash) {
      const existing = hashMap.get(p.duplicateContentHash) || [];
      existing.push(p.url);
      hashMap.set(p.duplicateContentHash, existing);
    }
  }
  const dupes = Array.from(hashMap.values()).filter(urls => urls.length > 1);
  if (dupes.length > 0) {
    recs.push({ category: 'machine_readability', severity: 'medium', effort: 'medium',
      title: 'Potential duplicate content detected',
      whyItMatters: 'Duplicate content confuses AI about which page is the authoritative version.',
      recommendedFix: 'Consolidate duplicate pages or use canonical tags to indicate the preferred version.',
      codeSnippet: null, affectedUrls: dupes[0].slice(0, 5) });
  }

  // ========== COMMERCIAL CLARITY ==========

  const types = new Set(scan.pages.map((p) => p.pageType));

  if (!types.has('pricing')) {
    recs.push({ category: 'commercial_clarity', severity: 'high', effort: 'harder',
      title: 'No pricing page found',
      whyItMatters: 'Without a pricing page, AI cannot answer cost questions and may not recommend your product.',
      recommendedFix: 'Create a dedicated /pricing page with clear plan names, prices, and features.',
      codeSnippet: null, affectedUrls: [] });
  }

  // P0: Pricing content clarity
  if (pricingPages.length > 0 && !pricingPages.some(p => p.hasPricingContent)) {
    recs.push({ category: 'commercial_clarity', severity: 'high', effort: 'medium',
      title: 'Pricing page lacks clear pricing information',
      whyItMatters: 'AI needs actual prices in the HTML to answer "how much does it cost?" questions.',
      recommendedFix: 'Include plan names, dollar amounts, and billing frequency in plain text on the page.',
      codeSnippet: null, affectedUrls: pricingPages.map(p => p.url) });
  }

  if (!types.has('contact') && !types.has('demo')) {
    recs.push({ category: 'commercial_clarity', severity: 'high', effort: 'harder',
      title: 'No contact or demo page found',
      whyItMatters: 'AI cannot direct users to take action if there is no contact or demo page.',
      recommendedFix: 'Create a /contact page with a form or a /demo page for booking.',
      codeSnippet: null, affectedUrls: [] });
  }

  if (!types.has('product')) {
    recs.push({ category: 'commercial_clarity', severity: 'high', effort: 'harder',
      title: 'No dedicated product/solution pages found',
      whyItMatters: 'Without product pages, AI has limited information about what you offer.',
      recommendedFix: 'Create product/feature pages explaining what you do and for whom.',
      codeSnippet: null, affectedUrls: [] });
  }

  // P0: Homepage clarity
  const homepage = scan.pages.find((p) => p.pageType === 'homepage');
  if (homepage && homepage.h1Text) {
    const h1Lower = homepage.h1Text.toLowerCase();
    const isVague = h1Lower.includes('welcome') || h1Lower.includes('hello') || h1Lower.length < 10;
    if (isVague) {
      recs.push({ category: 'commercial_clarity', severity: 'high', effort: 'easy',
        title: 'Homepage heading doesn\'t clearly state what you do',
        whyItMatters: 'The H1 is the first thing AI reads. A vague heading means AI can\'t determine your product\'s purpose.',
        recommendedFix: 'Rewrite your H1 to clearly state what your product does and who it\'s for.',
        codeSnippet: null, affectedUrls: [homepage.url] });
    }
  }

  // P0: CTA presence
  if (homepage && !homepage.hasCtaButton) {
    recs.push({ category: 'commercial_clarity', severity: 'high', effort: 'easy',
      title: 'Homepage missing clear call-to-action',
      whyItMatters: 'AI needs a clear CTA to understand the conversion path and recommend your product effectively.',
      recommendedFix: 'Add a prominent CTA button (e.g., "Start Free Trial", "Book a Demo") to your homepage.',
      codeSnippet: null, affectedUrls: [homepage.url] });
  }

  // P1: Comparison pages
  if (!types.has('comparison')) {
    recs.push({ category: 'commercial_clarity', severity: 'medium', effort: 'harder',
      title: 'No comparison or vs. pages found',
      whyItMatters: 'When users ask AI "X vs Y", comparison pages make you part of that conversation.',
      recommendedFix: 'Create comparison pages like /compare/competitor-name for your top alternatives.',
      codeSnippet: null, affectedUrls: [] });
  }

  // P1: Use case pages
  if (!types.has('use-case') && !scan.pages.some(p => p.hasUseCaseContent)) {
    recs.push({ category: 'commercial_clarity', severity: 'medium', effort: 'harder',
      title: 'No use case or solution pages found',
      whyItMatters: 'Use case pages help AI recommend your product for specific problems and audiences.',
      recommendedFix: 'Create pages for each key use case: /use-cases/[audience-or-problem].',
      codeSnippet: null, affectedUrls: [] });
  }

  // P1: Free trial visibility
  if (!scan.pages.some(p => p.hasFreeTrial)) {
    recs.push({ category: 'commercial_clarity', severity: 'medium', effort: 'easy',
      title: 'No free trial or freemium option visible',
      whyItMatters: 'AI systems are more likely to recommend products that have a low-friction way to try them.',
      recommendedFix: 'Prominently mention your free tier, trial period, or demo option.',
      codeSnippet: null, affectedUrls: [] });
  }

  // P1: Integrations page
  if (!types.has('integrations')) {
    recs.push({ category: 'commercial_clarity', severity: 'low', effort: 'medium',
      title: 'No integrations or ecosystem page found',
      whyItMatters: 'AI uses integration data to recommend products that work with a user\'s existing tools.',
      recommendedFix: 'Create an /integrations page listing the tools and platforms you connect with.',
      codeSnippet: null, affectedUrls: [] });
  }

  // ========== TRUST & SOURCE CLARITY ==========

  // Organization schema
  if (homepage && !homepage.hasSchema) {
    recs.push({ category: 'trust_clarity', severity: 'high', effort: 'easy',
      title: 'Homepage missing Organization structured data',
      whyItMatters: 'Organization schema tells AI your company name, logo, and social profiles in a standardized format.',
      recommendedFix: 'Add Organization JSON-LD to your homepage with name, URL, logo, and sameAs links.',
      codeSnippet: null, affectedUrls: [homepage.url] });
  }

  if (!types.has('blog') && !types.has('resource') && !types.has('docs')) {
    recs.push({ category: 'trust_clarity', severity: 'medium', effort: 'harder',
      title: 'No content/resource pages found',
      whyItMatters: 'Original content builds AI trust and gives them material to reference about your expertise.',
      recommendedFix: 'Create a blog or resource section with original, expert content about your domain.',
      codeSnippet: null, affectedUrls: [] });
  }

  // About page
  if (!types.has('about')) {
    recs.push({ category: 'trust_clarity', severity: 'medium', effort: 'medium',
      title: 'No about/company page found',
      whyItMatters: 'An about page helps AI verify your legitimacy and understand your company.',
      recommendedFix: 'Create an /about page with your company story, mission, and team.',
      codeSnippet: null, affectedUrls: [] });
  }

  // P0: Privacy policy
  if (sw && !sw.hasPrivacyPolicy) {
    recs.push({ category: 'trust_clarity', severity: 'high', effort: 'easy',
      title: 'No privacy policy found',
      whyItMatters: 'A privacy policy is a baseline trust signal. Its absence can indicate an unestablished business.',
      recommendedFix: 'Create a /privacy page with your privacy policy and link to it from your footer.',
      codeSnippet: null, affectedUrls: [] });
  }

  // P1: Terms of service
  if (sw && !sw.hasTermsOfService) {
    recs.push({ category: 'trust_clarity', severity: 'medium', effort: 'easy',
      title: 'No terms of service found',
      whyItMatters: 'Terms of service indicate a legitimate business with defined operating rules.',
      recommendedFix: 'Create a /terms page with your terms of service.',
      codeSnippet: null, affectedUrls: [] });
  }

  // P0: Social links
  if (sw && !sw.hasSocialLinks) {
    recs.push({ category: 'trust_clarity', severity: 'high', effort: 'easy',
      title: 'No social media profiles linked',
      whyItMatters: 'Social links verify your brand identity and give AI additional sources of information about you.',
      recommendedFix: 'Add links to your LinkedIn, Twitter/X, and GitHub profiles in your footer or header.',
      codeSnippet: null, affectedUrls: [] });
  }

  // P0: Customer logos
  if (sw && !sw.hasCustomerLogos) {
    recs.push({ category: 'trust_clarity', severity: 'high', effort: 'easy',
      title: 'No customer logos or social proof on homepage',
      whyItMatters: 'Customer logos signal market validation. AI uses these to assess product credibility.',
      recommendedFix: 'Add a "Trusted by" section with customer logos to your homepage.',
      codeSnippet: null, affectedUrls: [] });
  }

  // P0: Review platform links
  if (sw && !sw.hasReviewPlatformLinks) {
    recs.push({ category: 'trust_clarity', severity: 'high', effort: 'easy',
      title: 'No links to review platforms (G2, Capterra, etc.)',
      whyItMatters: 'AI systems use third-party review data to assess and recommend products.',
      recommendedFix: 'Link to your profiles on G2, Capterra, TrustRadius, or other review platforms.',
      codeSnippet: null, affectedUrls: [] });
  }

  // P1: Testimonials
  if (sw && !sw.hasTestimonials) {
    recs.push({ category: 'trust_clarity', severity: 'medium', effort: 'medium',
      title: 'No testimonials detected on the site',
      whyItMatters: 'Testimonials provide social proof that AI can cite when recommending your product.',
      recommendedFix: 'Add customer testimonials with real names and companies to key pages.',
      codeSnippet: null, affectedUrls: [] });
  }

  // P1: Security page
  if (!types.has('security') && !scan.pages.some(p => p.hasSecurityPage)) {
    recs.push({ category: 'trust_clarity', severity: 'medium', effort: 'medium',
      title: 'No security or compliance page found',
      whyItMatters: 'For B2B products, security/compliance information is critical for AI to recommend you to enterprise buyers.',
      recommendedFix: 'Create a /security page detailing your compliance certifications (SOC2, GDPR, etc.).',
      codeSnippet: null, affectedUrls: [] });
  }

  // P1: Team info
  if (!scan.pages.some(p => p.hasTeamInfo)) {
    recs.push({ category: 'trust_clarity', severity: 'low', effort: 'medium',
      title: 'No team information found',
      whyItMatters: 'Team pages with real people build trust and help AI verify your company is legitimate.',
      recommendedFix: 'Add a team section with names, roles, and photos to your about page.',
      codeSnippet: null, affectedUrls: [] });
  }

  // Performance
  const slowPages = scan.pages.filter((p) => p.loadTimeMs && p.loadTimeMs > 3000);
  if (slowPages.length > 0) {
    recs.push({ category: 'trust_clarity', severity: 'medium', effort: 'medium',
      title: 'Some pages load slowly',
      whyItMatters: 'Slow pages may timeout for AI crawlers, resulting in incomplete indexing.',
      recommendedFix: 'Optimize images, minimize JavaScript, and enable caching to improve load times.',
      codeSnippet: null, affectedUrls: slowPages.map((p) => p.url) });
  }

  // P2: Viewport meta
  const noViewport = scan.pages.filter(p => !p.hasViewportMeta);
  if (noViewport.length > scan.pages.length * 0.5) {
    recs.push({ category: 'trust_clarity', severity: 'low', effort: 'easy',
      title: 'Pages missing viewport meta tag',
      whyItMatters: 'Viewport meta indicates mobile responsiveness, which is a general quality signal.',
      recommendedFix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to all pages.',
      codeSnippet: null, affectedUrls: noViewport.slice(0, 3).map(p => p.url) });
  }

  return recs;
}

// ============================================================
// Scoring functions with balanced floors
// ============================================================
function scoreCrawlability(scan: ScanResult): CategoryScore {
  let score = 100;
  const issues: string[] = [];
  const positives: string[] = [];
  const sw = scan.siteWideChecks;

  if (!scan.robotsTxt?.exists) { score -= 15; issues.push('No robots.txt file found'); }
  else {
    positives.push('robots.txt file is present');
    if (scan.robotsTxt.blocksAI) { score -= 20; issues.push(`AI crawlers blocked: ${scan.robotsTxt.blockedAgents.join(', ')}`); }
    else positives.push('AI crawlers are not blocked');
  }

  if (!scan.sitemap?.exists) { score -= 15; issues.push('No XML sitemap found'); }
  else {
    positives.push('XML sitemap found');
    if (scan.sitemap.urlCount && scan.sitemap.urlCount < 5) { score -= 5; issues.push('Sitemap has very few URLs'); }
  }

  if (sw?.hasNoindexOnKeyPages) { score -= 15; issues.push(`${sw.noindexPages.length} key pages have noindex tags`); }
  if (!sw?.usesHttps) { score -= 10; issues.push('Not served over HTTPS'); }
  else positives.push('HTTPS enabled');
  if (sw?.hasNofollowOnKeyLinks) { score -= 5; issues.push('Internal links with nofollow'); }
  if (sw && !sw.navigationLinksToKeyPages) { score -= 8; issues.push(`Nav missing: ${sw.missingNavLinks.join(', ')}`); }
  else if (sw?.navigationLinksToKeyPages) positives.push('Navigation links to key pages');

  const errorPages = scan.pages.filter((p) => p.statusCode && p.statusCode >= 400);
  if (errorPages.length > 0) { score -= Math.min(10, errorPages.length * 3); issues.push(`${errorPages.length} pages returned errors`); }
  else if (scan.pages.length > 0) positives.push('All pages return valid status codes');

  const floor = issues.length <= 1 ? 60 : issues.length <= 2 ? 45 : issues.length <= 3 ? 35 : 25;
  return { score: Math.max(floor, Math.min(100, score)), maxScore: 100, explanation: 'How easily AI crawlers can access and navigate your site.', issues, positives };
}

function scoreMachineReadability(scan: ScanResult): CategoryScore {
  let score = 100;
  const issues: string[] = [];
  const positives: string[] = [];

  if (scan.pages.length === 0) return { score: 20, maxScore: 100, explanation: 'How well AI systems can understand your page content.', issues: ['No pages scanned'], positives: [] };

  const total = scan.pages.length;
  const withTitle = scan.pages.filter(p => p.title).length;
  const withMeta = scan.pages.filter(p => p.metaDescription).length;
  const withCanonical = scan.pages.filter(p => p.canonicalUrl).length;
  const withSchema = scan.pages.filter(p => p.hasSchema).length;
  const withH1 = scan.pages.filter(p => p.h1Text).length;
  const withOG = scan.pages.filter(p => p.hasOpenGraph).length;
  const withLang = scan.pages.filter(p => p.hasLangAttribute).length;

  if (withTitle === total) positives.push('All pages have title tags');
  else { score -= Math.round(((total - withTitle) / total) * 12); issues.push(`${total - withTitle} pages missing titles`); }

  if (withMeta === total) positives.push('All pages have meta descriptions');
  else { score -= Math.round(((total - withMeta) / total) * 10); issues.push(`${total - withMeta} pages missing meta descriptions`); }

  if (withCanonical === total) positives.push('All pages have canonical tags');
  else { score -= Math.round(((total - withCanonical) / total) * 6); issues.push(`${total - withCanonical} pages missing canonicals`); }

  if (withSchema > 0) positives.push(`${withSchema}/${total} pages have structured data`);
  if (withSchema === 0) { score -= 12; issues.push('No structured data found'); }
  else if (withSchema < total / 2) { score -= 6; issues.push('Most pages lack structured data'); }

  if (withH1 === total) positives.push('All pages have H1 headings');
  else { score -= Math.round(((total - withH1) / total) * 6); issues.push(`${total - withH1} pages missing H1`); }

  if (withOG > total * 0.5) positives.push('Open Graph tags found');
  else { score -= 8; issues.push('Most pages missing Open Graph tags'); }

  if (withLang > 0) positives.push('Language attribute set');
  else { score -= 4; issues.push('Missing language attribute'); }

  const totalImgs = scan.pages.reduce((s, p) => s + p.totalImages, 0);
  const noAlt = scan.pages.reduce((s, p) => s + p.imagesWithoutAlt, 0);
  if (totalImgs > 0 && noAlt > totalImgs * 0.3) { score -= 6; issues.push(`${noAlt}/${totalImgs} images missing alt text`); }
  else if (totalImgs > 0) positives.push('Images have alt text');

  const badH = scan.pages.filter(p => !p.headingHierarchyValid).length;
  if (badH > 0) { score -= 4; issues.push('Heading hierarchy issues'); }

  const thin = scan.pages.filter(p => p.wordCount !== null && p.wordCount < 100).length;
  if (thin > 0) { score -= Math.min(8, thin * 2); issues.push(`${thin} pages have thin content`); }

  const floor = issues.length <= 1 ? 65 : issues.length <= 2 ? 50 : issues.length <= 3 ? 40 : 30;
  return { score: Math.max(floor, Math.min(100, score)), maxScore: 100, explanation: 'How well AI systems can understand your page content and structure.', issues, positives };
}

function scoreCommercialClarity(scan: ScanResult): CategoryScore {
  let score = 100;
  const issues: string[] = [];
  const positives: string[] = [];
  const types = new Set(scan.pages.map(p => p.pageType));
  const homepage = scan.pages.find(p => p.pageType === 'homepage');
  const sw = scan.siteWideChecks;

  if (types.has('pricing')) positives.push('Pricing page found');
  else { score -= 15; issues.push('No pricing page'); }

  if (types.has('contact') || types.has('demo')) positives.push('Contact/demo page found');
  else { score -= 15; issues.push('No contact or demo page'); }

  if (types.has('product')) positives.push('Product pages found');
  else { score -= 12; issues.push('No product pages'); }

  if (homepage?.hasCtaButton) positives.push('Homepage has clear CTA');
  else { score -= 8; issues.push('Homepage missing CTA'); }

  if (homepage?.hasStructuredNav) positives.push('Structured navigation');
  else { score -= 5; issues.push('No structured navigation'); }

  if (sw && !sw.navigationLinksToKeyPages) { score -= 6; issues.push(`Nav missing: ${sw.missingNavLinks.join(', ')}`); }

  if (types.has('comparison') || scan.pages.some(p => p.hasComparisonContent)) positives.push('Comparison content found');
  else { score -= 5; issues.push('No comparison pages'); }

  if (scan.pages.some(p => p.hasFreeTrial)) positives.push('Free trial/freemium visible');
  else { score -= 4; issues.push('No free trial visibility'); }

  if (types.has('integrations')) positives.push('Integrations page found');

  const floor = issues.length <= 1 ? 60 : issues.length <= 2 ? 50 : issues.length <= 3 ? 40 : 25;
  return { score: Math.max(floor, Math.min(100, score)), maxScore: 100, explanation: 'How clearly your key commercial pages are structured for AI discovery.', issues, positives };
}

function scoreTrustClarity(scan: ScanResult): CategoryScore {
  let score = 100;
  const issues: string[] = [];
  const positives: string[] = [];
  const types = new Set(scan.pages.map(p => p.pageType));
  const homepage = scan.pages.find(p => p.pageType === 'homepage');
  const sw = scan.siteWideChecks;

  if (types.has('blog') || types.has('resource') || types.has('docs')) positives.push('Content/resource pages found');
  else { score -= 10; issues.push('No content pages found'); }

  if (homepage?.hasSchema) {
    const hasOrg = homepage.schemaTypes.some(t => t.includes('Organization') || t.includes('WebSite'));
    if (hasOrg) positives.push('Organization schema found');
    else { score -= 8; issues.push('Homepage missing Organization schema'); }
  } else { score -= 8; issues.push('Homepage has no structured data'); }

  if (types.has('about')) positives.push('About page found');
  else { score -= 6; issues.push('No about page'); }

  if (sw?.hasPrivacyPolicy) positives.push('Privacy policy found');
  else { score -= 8; issues.push('No privacy policy'); }

  if (sw?.hasSocialLinks) positives.push('Social profiles linked');
  else { score -= 8; issues.push('No social media links'); }

  if (sw?.hasCustomerLogos) positives.push('Customer logos/social proof');
  else { score -= 6; issues.push('No customer logos or social proof'); }

  if (sw?.hasReviewPlatformLinks) positives.push('Review platform links found');
  else { score -= 6; issues.push('No review platform links'); }

  if (sw?.hasTestimonials) positives.push('Testimonials found');
  else { score -= 4; issues.push('No testimonials detected'); }

  if (types.has('security') || scan.pages.some(p => p.hasSecurityPage)) positives.push('Security page found');
  else { score -= 4; issues.push('No security/compliance page'); }

  const slowPages = scan.pages.filter(p => p.loadTimeMs && p.loadTimeMs > 3000);
  if (slowPages.length > 0) { score -= Math.min(6, slowPages.length * 2); issues.push(`${slowPages.length} slow pages`); }
  else positives.push('All pages load quickly');

  const floor = issues.length <= 1 ? 65 : issues.length <= 2 ? 55 : issues.length <= 3 ? 45 : 35;
  return { score: Math.max(floor, Math.min(100, score)), maxScore: 100, explanation: 'How well your site establishes trust and authority signals for AI systems.', issues, positives };
}

// ============================================================
// Code snippet enrichment
// ============================================================
export function enrichWithCodeSnippets(recs: RecommendationInput[], scan: ScanResult): RecommendationInput[] {
  const domain = scan.pages[0]?.url ? new URL(scan.pages[0].url).hostname : 'example.com';
  const siteName = domain.replace(/\.(com|io|co|org|net)$/, '').replace(/^www\./, '');
  const siteUrl = scan.pages[0]?.url ? new URL(scan.pages[0].url).origin : `https://${domain}`;

  return recs.map(rec => {
    if (rec.title === 'Add a robots.txt file') return { ...rec, codeSnippet: `# robots.txt\nUser-agent: *\nAllow: /\n\nUser-agent: GPTBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml` };
    if (rec.title === 'Add an XML sitemap') return { ...rec, codeSnippet: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${siteUrl}/</loc><priority>1.0</priority></url>\n  <url><loc>${siteUrl}/pricing</loc><priority>0.9</priority></url>\n  <url><loc>${siteUrl}/product</loc><priority>0.9</priority></url>\n</urlset>` };
    if (rec.title.includes('Organization structured data')) return { ...rec, codeSnippet: `<script type="application/ld+json">\n{"@context":"https://schema.org","@type":"Organization","name":"${siteName}","url":"${siteUrl}","logo":"${siteUrl}/logo.png","description":"Your company description","sameAs":["https://twitter.com/${siteName}","https://linkedin.com/company/${siteName}"]}\n</script>` };
    return rec;
  });
}
