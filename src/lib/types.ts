// ============================================================
// Core types for AI Visibility Audit
// ============================================================

export interface Site {
  id: string;
  user_id: string | null;
  domain: string;
  url: string;
  created_at: string;
}

export interface Audit {
  id: string;
  site_id: string;
  user_id: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  overall_score: number | null;
  crawlability_score: number | null;
  machine_readability_score: number | null;
  commercial_clarity_score: number | null;
  trust_clarity_score: number | null;
  pages_scanned: number;
  summary: string | null;
  created_at: string;
  completed_at: string | null;
  site?: Site;
}

export interface AuditPage {
  id: string;
  audit_id: string;
  url: string;
  page_type: PageType;
  title: string | null;
  meta_description: string | null;
  canonical_url: string | null;
  has_schema: boolean;
  schema_types: string[];
  h1_text: string | null;
  word_count: number | null;
  load_time_ms: number | null;
  status_code: number | null;
  issues: string[];
  created_at: string;
}

export type PageType = 'homepage' | 'pricing' | 'contact' | 'demo' | 'product' | 'docs' | 'blog' | 'resource' | 'about' | 'security' | 'privacy' | 'terms' | 'careers' | 'integrations' | 'comparison' | 'use-case' | 'changelog' | 'status' | 'other';

export interface AuditFinding {
  id: string;
  audit_id: string;
  category: 'crawlability' | 'machine_readability' | 'commercial_clarity' | 'trust_clarity';
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  affected_urls: string[];
  created_at: string;
}

export interface AuditRecommendation {
  id: string;
  audit_id: string;
  finding_id: string | null;
  category: 'crawlability' | 'machine_readability' | 'commercial_clarity' | 'trust_clarity';
  severity: 'high' | 'medium' | 'low';
  effort: 'easy' | 'medium' | 'harder';
  title: string;
  why_it_matters: string;
  recommended_fix: string;
  code_snippet: string | null;
  priority_order: number;
  created_at: string;
}

// Scanner internal types
export interface ScanResult {
  robotsTxt: RobotsTxtResult | null;
  sitemap: SitemapResult | null;
  pages: PageScanResult[];
  errors: string[];
  crawlerStatuses: CrawlerStatus[];
  keyPagesStatus: KeyPageStatus[];
  siteWideChecks: SiteWideChecks;
}

export interface SiteWideChecks {
  usesHttps: boolean;
  hasNoindexOnKeyPages: boolean;
  noindexPages: string[];
  hasNofollowOnKeyLinks: boolean;
  nofollowLinks: string[];
  hasRedirectChains: boolean;
  redirectChainUrls: string[];
  hasBrokenLinks: boolean;
  brokenLinks: string[];
  hasPrivacyPolicy: boolean;
  hasTermsOfService: boolean;
  hasSocialLinks: boolean;
  socialLinks: string[];
  hasCustomerLogos: boolean;
  hasTestimonials: boolean;
  hasReviewPlatformLinks: boolean;
  reviewPlatformLinks: string[];
  navigationLinksToKeyPages: boolean;
  missingNavLinks: string[];
}

export interface CrawlerStatus {
  name: string;
  displayName: string;
  operator: string;
  status: 'allowed' | 'blocked' | 'no_rule';
  statusBasis: 'explicit_rule' | 'wildcard_rule' | 'default';
  statusDetail: string;
  visibilityValue: 'search_citation' | 'assistant_browsing' | 'training_corpus' | 'unknown';
  visibilityLabel: string;
  description: string;
  readinessScore: number;
  barriers: string[];
  recommendations: string[];
  confidenceLevel: 'observed' | 'inferred' | 'not_measured';
}

export interface KeyPageStatus {
  type: string;
  label: string;
  found: boolean;
  url: string | null;
}

export interface RobotsTxtResult {
  exists: boolean;
  content: string | null;
  blocksAI: boolean;
  blockedAgents: string[];
  allowsSitemap: boolean;
  sitemapUrls: string[];
}

export interface SitemapResult {
  exists: boolean;
  url: string | null;
  urlCount: number | null;
  isAccessible: boolean;
}

export interface PageScanResult {
  url: string;
  pageType: PageType;
  statusCode: number | null;
  title: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  hasSchema: boolean;
  schemaTypes: string[];
  h1Text: string | null;
  wordCount: number | null;
  loadTimeMs: number | null;
  headings: { level: number; text: string }[];
  hasStructuredNav: boolean;
  internalLinks: string[];
  issues: string[];
  rawHtmlPreview: string | null;

  // New P0 checks
  hasNoindex: boolean;
  usesHttps: boolean;
  hasOpenGraph: boolean;
  ogTags: { title: string | null; description: string | null; image: string | null };
  imagesWithoutAlt: number;
  totalImages: number;
  hasPricingContent: boolean;
  hasCtaButton: boolean;
  firstParagraphText: string | null;
  hasCustomerLogos: boolean;
  hasTestimonials: boolean;
  hasReviewLinks: boolean;
  reviewPlatformUrls: string[];
  hasSocialLinks: boolean;
  socialLinkUrls: string[];
  hasPrivacyLink: boolean;
  hasTermsLink: boolean;
  navLinks: string[];

  // New P1 checks
  headingHierarchyValid: boolean;
  headingIssues: string[];
  hasLangAttribute: boolean;
  langValue: string | null;
  hasBreadcrumbs: boolean;
  hasFaqSchema: boolean;
  hasPricingSchema: boolean;
  hasArticleDates: boolean;
  hasAuthorInfo: boolean;
  hasNofollowIssues: boolean;
  nofollowInternalLinks: string[];
  duplicateContentHash: string | null;
  anchorTextIssues: string[];
  hasComparisonContent: boolean;
  hasUseCaseContent: boolean;
  hasSecurityPage: boolean;
  hasFreeTrial: boolean;
  hasTeamInfo: boolean;

  // New P2 checks
  hasTwitterCard: boolean;
  hasTableHeaders: boolean;
  usesSemanticLists: boolean;
  hasViewportMeta: boolean;
  hasAddressInfo: boolean;
}

export interface ScoreResult {
  overall: number;
  crawlability: CategoryScore;
  machineReadability: CategoryScore;
  commercialClarity: CategoryScore;
  trustClarity: CategoryScore;
}

export interface CategoryScore {
  score: number;
  maxScore: number;
  explanation: string;
  issues: string[];
  positives: string[];
}

export interface RecommendationInput {
  category: AuditFinding['category'];
  severity: AuditFinding['severity'];
  effort: AuditRecommendation['effort'];
  title: string;
  whyItMatters: string;
  recommendedFix: string;
  codeSnippet: string | null;
  affectedUrls: string[];
}

// ============================================================
// Monetization & billing types
// ============================================================

export type RunType = 'free_preview' | 'paid_initial' | 'manual_paid_rescan' | 'monthly_auto_rerun';
export type RunScope = 'free' | 'core' | 'core_plus_premium';
export type PlanStatus = 'free' | 'core' | 'core_premium';
export type VerticalType = 'saas' | 'professional_services' | 'local_service' | 'ecommerce' | 'healthcare' | 'law_firm' | 'other';
export type FindingState = 'new' | 'ongoing' | 'resolved' | 'regressed';
export type BillingEventType = 'initial_scan' | 'premium_addon' | 'bundle' | 'manual_rescan' | 'monthly_subscription' | 'monthly_renewal';

export interface Entitlement {
  id: string;
  user_id: string;
  site_id: string;
  can_view_core: boolean;
  can_view_growth_strategy: boolean;
  can_view_marketing_perception: boolean;
  can_export: boolean;
  has_monthly_monitoring: boolean;
  monthly_scope: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BillingEvent {
  id: string;
  user_id: string;
  site_id: string | null;
  audit_id: string | null;
  event_type: BillingEventType;
  stripe_session_id: string | null;
  stripe_invoice_id: string | null;
  amount_cents: number;
  created_at: string;
}

export interface AuditDelta {
  overallDelta: number;
  categoryDeltas: {
    crawlability: number;
    machine_readability: number;
    commercial_clarity: number;
    trust_clarity: number;
  };
  newFindings: AuditFinding[];
  resolvedFindings: AuditFinding[];
  regressedFindings: AuditFinding[];
  ongoingFindings: AuditFinding[];
  pagesAdded: string[];
  pagesRemoved: string[];
}

export interface MonthlyActions {
  quickWins: AuditFinding[];
  mediumEffort: AuditFinding[];
  strategic: AuditFinding[];
}

export interface BotActivityData {
  sources: {
    name: string;
    lastSeen: string | null;
    frequency: 'daily' | 'weekly' | 'monthly' | 'rare' | 'never';
    pagesIndexed: number;
    trend: 'increasing' | 'stable' | 'decreasing' | 'unknown';
  }[];
  totalCrawlsLast30Days: number;
  mostActiveCrawler: string | null;
  dataAsOf: string;
}
