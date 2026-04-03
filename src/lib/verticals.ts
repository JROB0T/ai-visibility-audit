import type { VerticalType } from '@/lib/types';

export interface ExpectedPage {
  type: string;
  label: string;
  why: string;
}

export interface VerticalConfig {
  label: string;
  expectedPages: ExpectedPage[];
  recommendationPriorities: string[];
  messagingHints: {
    valueProposition: string;
    keyDifferentiators: string[];
    audienceTerms: string[];
  };
}

const VERTICAL_CONFIG: Record<VerticalType, VerticalConfig> = {
  saas: {
    label: 'SaaS',
    expectedPages: [
      { type: 'pricing', label: 'Pricing Page', why: 'AI assistants frequently compare SaaS pricing for users evaluating tools' },
      { type: 'product', label: 'Product / Features', why: 'Feature pages help AI understand and recommend your product for specific use cases' },
      { type: 'docs', label: 'Documentation', why: 'Technical docs establish authority and help AI provide accurate integration guidance' },
      { type: 'comparison', label: 'Comparison Pages', why: 'Direct comparisons help AI position your product against alternatives' },
      { type: 'integrations', label: 'Integrations', why: 'Integration pages help AI recommend your product in technology stack discussions' },
      { type: 'changelog', label: 'Changelog', why: 'Shows active development which AI uses as a trust signal' },
      { type: 'security', label: 'Security / Compliance', why: 'Enterprise buyers ask AI about security — having a page ensures accurate answers' },
    ],
    recommendationPriorities: ['structured_data', 'pricing_clarity', 'comparison_content', 'technical_documentation', 'integration_pages'],
    messagingHints: {
      valueProposition: 'Focus on measurable outcomes and ROI',
      keyDifferentiators: ['feature depth', 'integrations', 'pricing model', 'support quality'],
      audienceTerms: ['users', 'teams', 'companies', 'developers'],
    },
  },
  professional_services: {
    label: 'Professional Services',
    expectedPages: [
      { type: 'about', label: 'About / Team', why: 'AI cites expertise and credentials when recommending professional service providers' },
      { type: 'use-case', label: 'Service Pages', why: 'Detailed service descriptions help AI match your firm to specific client needs' },
      { type: 'blog', label: 'Thought Leadership', why: 'Published expertise helps AI establish your authority in your practice area' },
      { type: 'contact', label: 'Contact Page', why: 'Clear contact info with location helps AI recommend you for local/regional queries' },
      { type: 'resource', label: 'Case Studies', why: 'Case studies give AI concrete examples of your work to reference' },
    ],
    recommendationPriorities: ['expertise_signals', 'trust_clarity', 'local_seo', 'thought_leadership', 'case_studies'],
    messagingHints: {
      valueProposition: 'Emphasize expertise, track record, and client outcomes',
      keyDifferentiators: ['years of experience', 'specializations', 'notable clients', 'certifications'],
      audienceTerms: ['clients', 'businesses', 'organizations', 'firms'],
    },
  },
  local_service: {
    label: 'Local Service Business',
    expectedPages: [
      { type: 'contact', label: 'Contact / Location', why: 'AI needs address and service area to recommend local businesses' },
      { type: 'pricing', label: 'Pricing / Rates', why: 'Transparent pricing helps AI answer "how much does X cost" queries' },
      { type: 'about', label: 'About Us', why: 'Story and credentials help AI differentiate you from competitors' },
      { type: 'use-case', label: 'Services', why: 'Detailed service pages help AI match you to specific customer needs' },
      { type: 'resource', label: 'Reviews / Testimonials', why: 'Social proof helps AI recommend you with confidence' },
    ],
    recommendationPriorities: ['local_schema', 'review_signals', 'service_pages', 'contact_clarity', 'pricing_transparency'],
    messagingHints: {
      valueProposition: 'Highlight reliability, availability, and local expertise',
      keyDifferentiators: ['service area', 'response time', 'reviews', 'licensing'],
      audienceTerms: ['customers', 'homeowners', 'residents', 'businesses'],
    },
  },
  ecommerce: {
    label: 'E-commerce',
    expectedPages: [
      { type: 'product', label: 'Product Pages', why: 'Rich product data with schema helps AI recommend your products in shopping queries' },
      { type: 'pricing', label: 'Pricing / Deals', why: 'AI frequently compares prices and surfaces deals for shoppers' },
      { type: 'comparison', label: 'Category Pages', why: 'Category structure helps AI understand your product range' },
      { type: 'about', label: 'About / Brand Story', why: 'Brand identity helps AI differentiate you from marketplace sellers' },
      { type: 'privacy', label: 'Shipping & Returns', why: 'Policy pages help AI answer common pre-purchase questions' },
    ],
    recommendationPriorities: ['product_schema', 'pricing_markup', 'review_integration', 'inventory_signals', 'brand_clarity'],
    messagingHints: {
      valueProposition: 'Focus on product quality, value, and shopping experience',
      keyDifferentiators: ['product range', 'pricing', 'shipping', 'return policy'],
      audienceTerms: ['shoppers', 'customers', 'buyers'],
    },
  },
  healthcare: {
    label: 'Healthcare',
    expectedPages: [
      { type: 'about', label: 'Provider Profiles', why: 'Credentials and specialties help AI recommend the right provider' },
      { type: 'use-case', label: 'Services / Conditions', why: 'Condition-specific pages help AI match patients to appropriate care' },
      { type: 'contact', label: 'Locations / Hours', why: 'AI needs location data to recommend nearby healthcare providers' },
      { type: 'resource', label: 'Patient Resources', why: 'Educational content establishes medical authority for AI systems' },
      { type: 'privacy', label: 'Privacy / HIPAA', why: 'Compliance pages build trust and are expected by AI for healthcare sites' },
    ],
    recommendationPriorities: ['provider_schema', 'medical_credentials', 'location_data', 'patient_education', 'compliance_pages'],
    messagingHints: {
      valueProposition: 'Emphasize expertise, patient outcomes, and accessibility',
      keyDifferentiators: ['specialties', 'credentials', 'patient satisfaction', 'insurance accepted'],
      audienceTerms: ['patients', 'families', 'caregivers'],
    },
  },
  law_firm: {
    label: 'Law Firm',
    expectedPages: [
      { type: 'about', label: 'Attorney Profiles', why: 'Bar admissions and case experience help AI recommend appropriate counsel' },
      { type: 'use-case', label: 'Practice Areas', why: 'Detailed practice area pages help AI match clients to the right legal expertise' },
      { type: 'resource', label: 'Case Results', why: 'Track record gives AI evidence to support recommendations' },
      { type: 'blog', label: 'Legal Insights', why: 'Published analysis helps AI cite your firm as an authority' },
      { type: 'contact', label: 'Contact / Consultation', why: 'Clear intake process helps AI guide potential clients to you' },
    ],
    recommendationPriorities: ['attorney_schema', 'practice_area_depth', 'case_results', 'legal_authority', 'local_presence'],
    messagingHints: {
      valueProposition: 'Focus on expertise, results, and client advocacy',
      keyDifferentiators: ['practice areas', 'case results', 'bar admissions', 'peer recognition'],
      audienceTerms: ['clients', 'individuals', 'businesses', 'plaintiffs'],
    },
  },
  other: {
    label: 'Other',
    expectedPages: [
      { type: 'homepage', label: 'Homepage', why: 'Your homepage is the primary entry point for AI crawlers' },
      { type: 'about', label: 'About Page', why: 'Helps AI understand who you are and what you do' },
      { type: 'contact', label: 'Contact Page', why: 'Contact information helps AI provide complete recommendations' },
      { type: 'product', label: 'Products / Services', why: 'Core offering pages help AI understand and recommend your business' },
      { type: 'blog', label: 'Content / Blog', why: 'Regular content helps establish authority and provides AI with fresh material' },
    ],
    recommendationPriorities: ['structured_data', 'content_clarity', 'trust_signals', 'contact_information', 'regular_content'],
    messagingHints: {
      valueProposition: 'Clearly articulate what you do and for whom',
      keyDifferentiators: ['unique value', 'experience', 'approach', 'results'],
      audienceTerms: ['customers', 'users', 'clients'],
    },
  },
};

export function getVerticalConfig(vertical: VerticalType | string | null): VerticalConfig {
  if (vertical && vertical in VERTICAL_CONFIG) {
    return VERTICAL_CONFIG[vertical as VerticalType];
  }
  return VERTICAL_CONFIG.other;
}

export function getExpectedPages(vertical: VerticalType | string | null): ExpectedPage[] {
  return getVerticalConfig(vertical).expectedPages;
}
