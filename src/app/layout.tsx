import type { Metadata } from 'next';
import './globals.css';
import { ThemeWrapper } from '@/components/ThemeWrapper';
import { SCAN_PROMPT_COUNT, FREE_SCAN_PROMPT_COUNT } from '@/lib/productConstants';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://aivascan.com';

// NOTE: no `alternates.canonical` here — a canonical in the root layout
// is inherited by every page, which marks all subpages as duplicates of
// the homepage. Each public page declares its own self-canonical.
export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: 'Aivascan — See how AI describes your business',
    template: '%s · Aivascan',
  },
  description:
    'Aivascan scans how AI assistants answer buyer-intent questions about your business — and gives you a scored report with a prioritized fix plan.',
  openGraph: {
    title: 'Aivascan — AI Visibility Audit',
    description: 'See how AI assistants describe your business — and what to fix first.',
    type: 'website',
    siteName: 'Aivascan',
    url: BASE_URL,
  },
  twitter: {
    card: 'summary',
    title: 'Aivascan — AI Visibility Audit',
    description: 'See how AI assistants describe your business — and what to fix first.',
  },
  robots: { index: true, follow: true },
};

// ------------------------------------------------------------
// Site-wide structured data. Aivascan tells customers to add JSON-LD
// so AI systems can understand who they are — so Aivascan does too.
// Organization + WebSite + SoftwareApplication, rendered once in
// the root layout (server component → present in initial HTML).
// ------------------------------------------------------------
const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${BASE_URL}/#organization`,
      name: 'Aivascan',
      url: BASE_URL,
      email: 'team@aivascan.com',
      parentOrganization: {
        '@type': 'Organization',
        name: 'The Bergen Standard, LLC',
        address: {
          '@type': 'PostalAddress',
          addressRegion: 'NJ',
          addressCountry: 'US',
        },
      },
      description:
        'Aivascan audits how AI assistants describe and recommend businesses, and delivers scored reports with prioritized fix plans.',
    },
    {
      '@type': 'WebSite',
      '@id': `${BASE_URL}/#website`,
      name: 'Aivascan — AI Visibility Audit',
      url: BASE_URL,
      publisher: { '@id': `${BASE_URL}/#organization` },
    },
    {
      '@type': 'SoftwareApplication',
      name: 'Aivascan',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: BASE_URL,
      description:
        'Audits whether AI assistants recommend your business when buyers ask — with an AI Visibility Score, Site Readiness Score, competitor comparison, and a 30/60/90-day fix plan.',
      // Prices here are hardcoded like the homepage pricing section —
      // if PRICE_TIER_1_MONTHLY_DOLLARS changes, update this too.
      offers: [
        {
          '@type': 'Offer',
          name: 'Free Sample',
          price: '0',
          priceCurrency: 'USD',
          description: `${FREE_SCAN_PROMPT_COUNT}-prompt AI visibility scan with a 2-page summary report — no account or credit card required.`,
        },
        {
          '@type': 'Offer',
          name: 'Monthly',
          price: '29.99',
          priceCurrency: 'USD',
          description: `${SCAN_PROMPT_COUNT}-prompt scan, full strategic report, competitor analysis, 30/60/90 plan, refreshed monthly.`,
        },
      ],
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Favicons handled by Next.js conventions:
            src/app/icon.svg, src/app/apple-icon.png, src/app/favicon.ico
            are detected automatically — no <link> tags needed here. */}
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
        />
      </head>
      <body className="min-h-screen flex flex-col">
        <ThemeWrapper>{children}</ThemeWrapper>
      </body>
    </html>
  );
}
