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

  // Weighted average (crawlability and commercial clarity matter most for AI visibility)
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

  // --- CRAWLABILITY ---
  if (!scan.robotsTxt?.exists) {
    recs.push({
      category: 'crawlability',
      severity: 'high',
      effort: 'easy',
      title: 'Add a robots.txt file',
      whyItMatters:
        'Without robots.txt, AI crawlers have no guidance on what to index. This is the first file bots look for.',
      recommendedFix:
        'Create a robots.txt file at your site root. At minimum, allow all crawlers with "User-agent: * Allow: /" and include your sitemap URL.',
      affectedUrls: [],
    });
  }

  if (scan.robotsTxt?.blocksAI) {
    recs.push({
      category: 'crawlability',
      severity: 'high',
      effort: 'easy',
      title: `AI crawlers are blocked: ${scan.robotsTxt.blockedAgents.join(', ')}`,
      whyItMatters:
        'You are actively blocking AI systems from reading your site. This means AI search and assistants cannot reference your content.',
      recommendedFix:
        'Review your robots.txt and remove Disallow rules for AI crawlers you want to allow (GPTBot, ClaudeBot, etc). Keep blocks only for crawlers you intentionally want to exclude.',
      affectedUrls: [],
    });
  }

  if (!scan.sitemap?.exists) {
    recs.push({
      category: 'crawlability',
      severity: 'high',
      effort: 'easy',
      title: 'Add an XML sitemap',
      whyItMatters:
        'A sitemap tells AI crawlers exactly which pages exist and matter. Without one, crawlers must discover pages on their own and may miss key content.',
      recommendedFix:
        'Generate a sitemap.xml listing your key pages. Most CMS platforms can auto-generate this. Reference it in your robots.txt.',
      affectedUrls: [],
    });
  } else if (scan.sitemap.urlCount && scan.sitemap.urlCount < 5) {
    recs.push({
      category: 'crawlability',
      severity: 'medium',
      effort: 'easy',
      title: 'Sitemap has very few URLs',
      whyItMatters:
        'Your sitemap only lists a handful of pages. Ensure all important commercial and content pages are included.',
      recommendedFix:
        'Review your sitemap and add any missing pages — especially pricing, product, docs, and blog pages.',
      affectedUrls: [scan.sitemap.url || ''],
    });
  }

  // --- MACHINE READABILITY ---
  const pagesWithoutTitle = scan.pages.filter((p) => !p.title);
  if (pagesWithoutTitle.length > 0) {
    recs.push({
      category: 'machine_readability',
      severity: 'high',
      effort: 'easy',
      title: 'Pages missing title tags',
      whyItMatters:
        'Title tags are the primary way AI systems identify what a page is about. Missing titles make your pages invisible or unclear.',
      recommendedFix:
        'Add unique, descriptive title tags to every page. Include your product name and what the page covers.',
      affectedUrls: pagesWithoutTitle.map((p) => p.url),
    });
  }

  const pagesWithoutMeta = scan.pages.filter((p) => !p.metaDescription);
  if (pagesWithoutMeta.length > 0) {
    recs.push({
      category: 'machine_readability',
      severity: 'medium',
      effort: 'easy',
      title: 'Pages missing meta descriptions',
      whyItMatters:
        'Meta descriptions help AI systems understand page purpose. They are often used as the summary when AI references your content.',
      recommendedFix:
        'Write clear, specific meta descriptions (120-155 characters) for each page. Describe what the page offers to a potential customer.',
      affectedUrls: pagesWithoutMeta.map((p) => p.url),
    });
  }

  const pagesWithoutCanonical = scan.pages.filter((p) => !p.canonicalUrl);
  if (pagesWithoutCanonical.length > 0) {
    recs.push({
      category: 'machine_readability',
      severity: 'medium',
      effort: 'easy',
      title: 'Pages missing canonical tags',
      whyItMatters:
        'Canonical tags tell AI systems which version of a page is the "real" one. Without them, AI might index duplicate content or the wrong URL.',
      recommendedFix:
        'Add rel="canonical" link tags pointing to the preferred URL for each page.',
      affectedUrls: pagesWithoutCanonical.map((p) => p.url),
    });
  }

  const pagesWithoutSchema = scan.pages.filter((p) => !p.hasSchema);
  if (pagesWithoutSchema.length > 0) {
    recs.push({
      category: 'machine_readability',
      severity: 'medium',
      effort: 'medium',
      title: 'Pages missing structured data (JSON-LD)',
      whyItMatters:
        'Structured data helps AI systems understand exactly what your page represents — is it a product, an article, an FAQ? Without it, AI must guess.',
      recommendedFix:
        'Add JSON-LD structured data to key pages. Use Organization schema on your homepage, Product/SoftwareApplication on product pages, and Article on blog posts.',
      affectedUrls: pagesWithoutSchema.map((p) => p.url),
    });
  }

  const pagesWithoutH1 = scan.pages.filter((p) => !p.h1Text);
  if (pagesWithoutH1.length > 0) {
    recs.push({
      category: 'machine_readability',
      severity: 'low',
      effort: 'easy',
      title: 'Pages missing H1 headings',
      whyItMatters:
        'The H1 heading is a strong signal for page topic. Missing H1s make it harder for AI to determine what the page is about.',
      recommendedFix:
        'Add a single, clear H1 heading to each page that describes the main topic.',
      affectedUrls: pagesWithoutH1.map((p) => p.url),
    });
  }

  const thinPages = scan.pages.filter((p) => p.wordCount && p.wordCount < 100);
  if (thinPages.length > 0) {
    recs.push({
      category: 'machine_readability',
      severity: 'medium',
      effort: 'medium',
      title: 'Pages with very thin content',
      whyItMatters:
        'Pages with very little text give AI systems almost nothing to work with. These pages are unlikely to be referenced or recommended.',
      recommendedFix:
        'Add meaningful content that explains what the page offers. Even 200-300 words of clear copy helps AI understand the page.',
      affectedUrls: thinPages.map((p) => p.url),
    });
  }

  // --- COMMERCIAL CLARITY ---
  const pageTypes = scan.pages.map((p) => p.pageType);

  if (!pageTypes.includes('pricing')) {
    recs.push({
      category: 'commercial_clarity',
      severity: 'high',
      effort: 'medium',
      title: 'No pricing page found',
      whyItMatters:
        'When AI systems recommend tools, pricing information is critical. Without a discoverable pricing page, AI cannot answer "how much does X cost?" — and may recommend competitors instead.',
      recommendedFix:
        'Create a dedicated /pricing page linked from your homepage navigation. Even if pricing is "contact us," make the page exist with clear context.',
      affectedUrls: [],
    });
  }

  if (!pageTypes.includes('contact') && !pageTypes.includes('demo')) {
    recs.push({
      category: 'commercial_clarity',
      severity: 'high',
      effort: 'easy',
      title: 'No contact or demo page found',
      whyItMatters:
        'AI systems need a clear call-to-action to recommend to users. Without a contact/demo page, there is no obvious "next step" for someone referred by AI.',
      recommendedFix:
        'Create a /contact or /demo page with a clear form and value proposition. Link it prominently from your homepage.',
      affectedUrls: [],
    });
  }

  if (!pageTypes.includes('product')) {
    recs.push({
      category: 'commercial_clarity',
      severity: 'high',
      effort: 'harder',
      title: 'No dedicated product/solution pages found',
      whyItMatters:
        'Product pages are how AI systems understand what you actually do. Without clear product pages, AI cannot accurately describe or recommend your solution.',
      recommendedFix:
        'Create dedicated pages for your core products or solutions. Each should clearly describe what the product does, who it is for, and key features.',
      affectedUrls: [],
    });
  }

  // --- TRUST / SOURCE CLARITY ---
  const homepage = scan.pages.find((p) => p.pageType === 'homepage');
  if (homepage) {
    const hasOrgSchema = homepage.schemaTypes.some(
      (t) => t.includes('Organization') || t.includes('WebSite')
    );
    if (!hasOrgSchema) {
      recs.push({
        category: 'trust_clarity',
        severity: 'medium',
        effort: 'easy',
        title: 'Homepage missing Organization structured data',
        whyItMatters:
          'Organization schema tells AI systems who you are — your name, URL, logo, and description. This builds trust and accuracy when AI references you.',
        recommendedFix:
          'Add Organization JSON-LD to your homepage with your company name, URL, logo URL, and a brief description.',
        affectedUrls: [homepage.url],
      });
    }
  }

  if (!pageTypes.some((t) => t === 'blog' || t === 'resource' || t === 'docs')) {
    recs.push({
      category: 'trust_clarity',
      severity: 'low',
      effort: 'harder',
      title: 'No content/resource pages found',
      whyItMatters:
        'Blog posts, docs, and resource pages build topical authority. AI systems are more likely to reference companies that have rich, helpful content in their domain.',
      recommendedFix:
        'Consider creating a blog or resources section with helpful content related to your product category. Even 5-10 quality articles can boost AI visibility.',
      affectedUrls: [],
    });
  }

  // Performance issues
  const slowPages = scan.pages.filter((p) => p.loadTimeMs && p.loadTimeMs > 3000);
  if (slowPages.length > 0) {
    recs.push({
      category: 'trust_clarity',
      severity: 'low',
      effort: 'medium',
      title: 'Some pages load slowly',
      whyItMatters:
        'Slow pages may time out when AI crawlers try to fetch them, meaning the content never gets indexed.',
      recommendedFix:
        'Optimize slow pages by reducing image sizes, deferring non-critical scripts, and checking server response times.',
      affectedUrls: slowPages.map((p) => p.url),
    });
  }

  // Sort by priority: high severity first, then by effort (easy first)
  const severityOrder = { high: 0, medium: 1, low: 2 };
  const effortOrder = { easy: 0, medium: 1, harder: 2 };
  recs.sort(
    (a, b) =>
      severityOrder[a.severity] - severityOrder[b.severity] ||
      effortOrder[a.effort] - effortOrder[b.effort]
  );

  return recs;
}

// ============================================================
// Category scoring functions
// ============================================================
function scoreCrawlability(scan: ScanResult): CategoryScore {
  let score = 100;
  const issues: string[] = [];
  const positives: string[] = [];

  if (!scan.robotsTxt?.exists) {
    score -= 25;
    issues.push('No robots.txt file found');
  } else {
    positives.push('robots.txt file is present');
    if (scan.robotsTxt.blocksAI) {
      score -= 30;
      issues.push(`AI crawlers are blocked: ${scan.robotsTxt.blockedAgents.join(', ')}`);
    } else {
      positives.push('AI crawlers are not blocked');
    }
  }

  if (!scan.sitemap?.exists) {
    score -= 25;
    issues.push('No XML sitemap found');
  } else {
    positives.push('XML sitemap found');
    if (scan.sitemap.urlCount && scan.sitemap.urlCount < 5) {
      score -= 10;
      issues.push('Sitemap has very few URLs');
    }
  }

  if (scan.pages.length === 0) {
    score -= 30;
    issues.push('Could not access any pages');
  } else {
    const errorPages = scan.pages.filter((p) => p.statusCode && p.statusCode >= 400);
    if (errorPages.length > 0) {
      score -= errorPages.length * 5;
      issues.push(`${errorPages.length} page(s) returned error status codes`);
    }
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    maxScore: 100,
    explanation: 'How easily AI crawlers can access and navigate your site.',
    issues,
    positives,
  };
}

function scoreMachineReadability(scan: ScanResult): CategoryScore {
  let score = 100;
  const issues: string[] = [];
  const positives: string[] = [];

  if (scan.pages.length === 0) {
    return { score: 0, maxScore: 100, explanation: 'How well AI systems can understand your page content.', issues: ['No pages scanned'], positives: [] };
  }

  const totalPages = scan.pages.length;

  // Title tags
  const withTitle = scan.pages.filter((p) => p.title).length;
  if (withTitle === totalPages) positives.push('All pages have title tags');
  else {
    const pct = Math.round(((totalPages - withTitle) / totalPages) * 20);
    score -= pct;
    issues.push(`${totalPages - withTitle} of ${totalPages} pages missing title tags`);
  }

  // Meta descriptions
  const withMeta = scan.pages.filter((p) => p.metaDescription).length;
  if (withMeta === totalPages) positives.push('All pages have meta descriptions');
  else {
    const pct = Math.round(((totalPages - withMeta) / totalPages) * 15);
    score -= pct;
    issues.push(`${totalPages - withMeta} of ${totalPages} pages missing meta descriptions`);
  }

  // Canonical tags
  const withCanonical = scan.pages.filter((p) => p.canonicalUrl).length;
  if (withCanonical === totalPages) positives.push('All pages have canonical tags');
  else {
    const pct = Math.round(((totalPages - withCanonical) / totalPages) * 10);
    score -= pct;
    issues.push(`${totalPages - withCanonical} of ${totalPages} pages missing canonical tags`);
  }

  // Schema
  const withSchema = scan.pages.filter((p) => p.hasSchema).length;
  if (withSchema > 0) positives.push(`${withSchema} of ${totalPages} pages have structured data`);
  if (withSchema === 0) {
    score -= 20;
    issues.push('No pages have structured data (JSON-LD)');
  } else if (withSchema < totalPages / 2) {
    score -= 10;
    issues.push('Most pages lack structured data');
  }

  // H1 headings
  const withH1 = scan.pages.filter((p) => p.h1Text).length;
  if (withH1 < totalPages) {
    score -= Math.round(((totalPages - withH1) / totalPages) * 10);
    issues.push(`${totalPages - withH1} pages missing H1 headings`);
  }

  // Thin content
  const thin = scan.pages.filter((p) => p.wordCount && p.wordCount < 100).length;
  if (thin > 0) {
    score -= thin * 5;
    issues.push(`${thin} pages have very thin content`);
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    maxScore: 100,
    explanation: 'How well AI systems can understand your page content and structure.',
    issues,
    positives,
  };
}

function scoreCommercialClarity(scan: ScanResult): CategoryScore {
  let score = 100;
  const issues: string[] = [];
  const positives: string[] = [];

  const types = new Set(scan.pages.map((p) => p.pageType));

  if (types.has('pricing')) positives.push('Pricing page found');
  else { score -= 25; issues.push('No pricing page discoverable'); }

  if (types.has('contact') || types.has('demo')) positives.push('Contact/demo page found');
  else { score -= 25; issues.push('No contact or demo page discoverable'); }

  if (types.has('product')) positives.push('Product/solution pages found');
  else { score -= 20; issues.push('No dedicated product pages found'); }

  // Check if homepage has clear navigation
  const homepage = scan.pages.find((p) => p.pageType === 'homepage');
  if (homepage?.hasStructuredNav) positives.push('Homepage has structured navigation');
  else { score -= 10; issues.push('Homepage may lack clear navigation structure'); }

  // Check commercial pages have adequate content
  const commercialPages = scan.pages.filter((p) =>
    ['pricing', 'product', 'contact', 'demo'].includes(p.pageType)
  );
  const thinCommercial = commercialPages.filter((p) => p.wordCount && p.wordCount < 100);
  if (thinCommercial.length > 0) {
    score -= thinCommercial.length * 10;
    issues.push(`${thinCommercial.length} commercial pages have thin content`);
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    maxScore: 100,
    explanation: 'How clearly your key commercial pages are structured for AI discovery.',
    issues,
    positives,
  };
}

function scoreTrustClarity(scan: ScanResult): CategoryScore {
  let score = 100;
  const issues: string[] = [];
  const positives: string[] = [];

  const types = new Set(scan.pages.map((p) => p.pageType));

  // Content pages exist
  if (types.has('blog') || types.has('resource') || types.has('docs')) {
    positives.push('Content/resource pages found');
  } else {
    score -= 20;
    issues.push('No blog, docs, or resource content found');
  }

  // Organization schema
  const homepage = scan.pages.find((p) => p.pageType === 'homepage');
  if (homepage?.hasSchema) {
    const hasOrg = homepage.schemaTypes.some(
      (t) => t.includes('Organization') || t.includes('WebSite')
    );
    if (hasOrg) positives.push('Homepage has Organization/WebSite schema');
    else { score -= 15; issues.push('Homepage missing Organization schema'); }
  } else {
    score -= 15;
    issues.push('Homepage has no structured data');
  }

  // Performance
  const slowPages = scan.pages.filter((p) => p.loadTimeMs && p.loadTimeMs > 3000);
  if (slowPages.length > 0) {
    score -= slowPages.length * 5;
    issues.push(`${slowPages.length} slow-loading pages (>3s)`);
  } else {
    positives.push('All scanned pages loaded within 3 seconds');
  }

  // About/company page
  const hasAbout = scan.pages.some(
    (p) => p.url.includes('/about') || p.url.includes('/company') || p.url.includes('/team')
  );
  if (hasAbout) positives.push('About/company page found');
  else { score -= 10; issues.push('No about/company page found'); }

  return {
    score: Math.max(0, Math.min(100, score)),
    maxScore: 100,
    explanation: 'How well your site establishes trust and authority signals for AI systems.',
    issues,
    positives,
  };
}
