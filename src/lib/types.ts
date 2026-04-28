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
  key_pages_status?: KeyPageStatus[] | null;
  home_evidence?: HomeEvidence | null;
  llms_txt?: LlmsTxtResult | null;
  scanner_summary?: ScannerSummary | null;
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
export interface LlmsTxtResult {
  exists: boolean;
  hasFullVersion: boolean;
  content?: string | null;
}

export interface ScannerSummary {
  pagesAttempted: number;
  pagesSucceeded: number;
  pagesFailed: number;
  failedUrls: string[];
  checksVerified: number;
  checksInferred: number;
  checksEstimated: number;
  confidencePercent: number;
}

export interface NapConsistency {
  nameInSchema?: string | null;
  phoneInSchema?: string | null;
  phoneInContent?: boolean;
  consistent: boolean;
  issues: string[];
}

export interface ScanResult {
  robotsTxt: RobotsTxtResult | null;
  sitemap: SitemapResult | null;
  llmsTxt?: LlmsTxtResult | null;
  pages: PageScanResult[];
  errors: string[];
  crawlerStatuses: CrawlerStatus[];
  keyPagesStatus: KeyPageStatus[];
  siteWideChecks: SiteWideChecks;
  detectedVertical: string;
  scannerSummary?: ScannerSummary;
  napConsistency?: NapConsistency;
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
  // Internal link analysis (Batch C)
  homepageLinksToKeyPages?: boolean;
  missingHomepageLinks?: string[];
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
  note?: string;
}

export interface HomeEvidence {
  hasBookDemoButton: boolean;
  hasRequestDemoButton: boolean;
  hasContactForm: boolean;
  hasContactEmail: boolean;
  hasPricingSection: boolean;
  hasIntegrationsSection: boolean;
  hasCustomerLogos: boolean;
  hasFundingAnnouncement: boolean;
  hasTestimonials: boolean;
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

  // Footer extraction
  footerLinks?: string[];
  footerText?: string | null;

  // Quality checks (Batch B)
  schemaMissingFields?: string[];
  metaDescriptionLength?: number | null;
  metaDescriptionDuplicatesTitle?: boolean;
  titleLength?: number | null;
  titleIsDomainOnly?: boolean;

  // Contact detection (Batch C)
  hasPhoneNumber?: boolean;
  hasEmailAddress?: boolean;
  hasPhysicalAddress?: boolean;

  // Above-the-fold analysis (Batch D)
  hasValueProposition?: boolean;
  hasTrustSignalsAboveFold?: boolean;

  // Homepage deep content evidence
  homeEvidence?: HomeEvidence;
  // CTA detection (all pages)
  hasDemoCTA?: boolean;
  hasContactCTA?: boolean;
  // Interstitial / bot-challenge detection (e.g. Cloudflare "Just a moment…").
  // When true, the scraped title is unreliable and must NOT be used as a business name.
  interstitialBlocked?: boolean;
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
  confidence?: 'verified' | 'inferred' | 'estimated';
}

// ============================================================
// Monetization & billing types
// ============================================================

export type RunType = 'free_preview' | 'paid_initial' | 'manual_paid_rescan' | 'monthly_auto_rerun';
export type RunScope = 'free' | 'core' | 'core_plus_premium';
export type PlanStatus = 'free' | 'core' | 'core_premium';
export type VerticalType = 'saas' | 'professional_services' | 'local_service' | 'ecommerce' | 'healthcare' | 'law_firm' | 'restaurant' | 'other';
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

export interface FindingLike {
  id: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  affected_urls: string[];
}

export interface AuditDelta {
  overallDelta: number;
  categoryDeltas: {
    crawlability: number;
    machine_readability: number;
    commercial_clarity: number;
    trust_clarity: number;
  };
  newFindings: FindingLike[];
  resolvedFindings: FindingLike[];
  regressedFindings: FindingLike[];
  ongoingFindings: FindingLike[];
  pagesAdded: string[];
  pagesRemoved: string[];
}

export interface MonthlyActions {
  quickWins: FindingLike[];
  mediumEffort: FindingLike[];
  strategic: FindingLike[];
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

// ============================================================
// AI Discovery Prompt Testing module
// ============================================================

export type DiscoveryCluster =
  | 'core'
  | 'problem'
  | 'comparison'
  | 'long_tail'
  | 'brand'
  | 'adjacent';

export type DiscoveryVisibilityStatus =
  | 'strong_presence'
  | 'partial_presence'
  | 'indirect_presence'
  | 'absent'
  | 'competitor_dominant'
  | 'directory_dominant'
  | 'unclear';

export type DiscoveryPositionType =
  | 'directly_recommended'
  | 'listed_among_options'
  | 'cited_as_source'
  | 'mentioned_without_preference'
  | 'implied_only'
  | 'not_present';

export type DiscoveryBusinessModel =
  | 'local_service'
  | 'ecommerce'
  | 'professional_services'
  | 'hybrid'
  | 'other';

export type DiscoveryOwnerType = 'developer' | 'marketer' | 'business_owner';

export type DiscoveryPriority = 'high' | 'medium' | 'low';

// Phase 1.5a: teaser tier killed in favor of immediate full discovery
// auto-run on first paid view. Type kept for migration safety —
// existing teaser snapshots in the DB still display correctly. No new
// teaser runs are ever created.
export type DiscoveryTier = 'full' | 'teaser_legacy';

export interface DiscoveryClusterWeights {
  core: number;
  problem: number;
  comparison: number;
  long_tail: number;
  brand: number;
  adjacent: number;
}

export interface DiscoveryProfile {
  id: string;
  site_id: string;
  business_name: string | null;
  domain: string | null;
  primary_category: string | null;
  service_area: string | null;
  // Ticket 7.6 — short anchors used by the prompt generator so local-intent
  // prompts get concrete geography instead of "near me".
  service_area_city: string | null;
  service_area_region: string | null;
  description: string | null;
  core_services: string[];
  secondary_services: string[];
  target_customers: string[];
  business_model: DiscoveryBusinessModel | null;
  priority_service_lines: string[];
  high_margin_services: string[];
  branded_terms: string[];
  cluster_weights: DiscoveryClusterWeights;
  created_at: string;
  updated_at: string;
}

export interface DiscoveryPrompt {
  id: string;
  site_id: string;
  prompt_text: string;
  cluster: DiscoveryCluster;
  priority: DiscoveryPriority;
  service_line_tag: string | null;
  importance_tag: string | null;
  active: boolean;
  last_tested_at: string | null;
  notes: string | null;
  source: 'generated' | 'custom' | 'edited';
  created_at: string;
  updated_at: string;
}

export interface DiscoveryCompetitor {
  id: string;
  site_id: string;
  name: string;
  domain: string | null;
  location: string | null;
  category: string | null;
  active: boolean;
  source: 'manual' | 'inferred' | 'growth_strategy';
  created_at: string;
  updated_at: string;
}

export interface DiscoveryResult {
  id: string;
  site_id: string;
  prompt_id: string | null;
  run_id: string;
  prompt_text: string;
  prompt_cluster: DiscoveryCluster | null;
  test_date: string;
  test_surface: string;
  business_mentioned: boolean;
  business_cited: boolean;
  business_domain_detected: boolean;
  business_page_detected: string | null;
  business_position_type: DiscoveryPositionType | null;
  competitor_mentioned: boolean;
  competitor_names_detected: string[];
  competitor_domains_detected: string[];
  directories_detected: string[];
  marketplaces_detected: string[];
  result_type_summary: string | null;
  visibility_status: DiscoveryVisibilityStatus | null;
  prompt_score: number | null;
  confidence_score: number | null;
  normalized_response_summary: string | null;
  raw_response_excerpt: string | null;
  recommendation_tags: string[];
  reviewed: boolean;
  suppressed: boolean;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DiscoveryInsight {
  id: string;
  site_id: string;
  run_id: string | null;
  category: 'wins' | 'gaps' | 'competitor_advantages' | 'content_issues' | 'opportunities';
  title: string;
  description: string | null;
  severity: DiscoveryPriority;
  linked_cluster: DiscoveryCluster | null;
  linked_competitor_id: string | null;
  created_at: string;
}

export interface DiscoveryRecommendation {
  id: string;
  site_id: string;
  run_id: string | null;
  title: string;
  description: string | null;
  why_it_matters: string | null;
  category: string | null;
  priority: DiscoveryPriority | null;
  owner_type: DiscoveryOwnerType | null;
  impact_estimate: DiscoveryPriority | null;
  difficulty_estimate: DiscoveryPriority | null;
  suggested_timeline: string | null;
  linked_prompt_clusters: DiscoveryCluster[];
  linked_competitor_ids: string[];
  edited_by_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface DiscoveryScoreSnapshot {
  id: string;
  site_id: string;
  run_id: string;
  overall_score: number | null;
  cluster_scores: Partial<Record<DiscoveryCluster, number>>;
  prompt_count: number;
  strong_count: number;
  partial_count: number;
  absent_count: number;
  competitor_dominant_count: number;
  snapshot_date: string;
}
