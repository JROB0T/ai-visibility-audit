import type { Metadata } from 'next';
import './globals.css';
import { ThemeWrapper } from '@/components/ThemeWrapper';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://aivascan.com';

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: 'Aivascan — See how AI describes your business',
    template: '%s · Aivascan',
  },
  description:
    'Aivascan scans how AI assistants (ChatGPT, Claude, Perplexity, Gemini) answer buyer-intent questions about your business — and tells you what to fix.',
  keywords: [
    'AI visibility',
    'AI search optimization',
    'answer engine optimization',
    'AEO',
    'generative engine optimization',
    'GEO',
    'ChatGPT visibility',
    'AI SEO audit',
  ],
  alternates: { canonical: '/' },
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
      description:
        'Aivascan (AI Visibility Audit) scores how well businesses appear in AI-assistant search results and provides prioritized fix plans.',
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
        'Audits whether AI assistants like ChatGPT, Claude, Perplexity, and Gemini recommend your business when buyers ask — with an AI Visibility Score, Site Readiness Score, competitor comparison, and a 30/60/90-day fix plan.',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        description: 'Free 6-prompt sample report — no account or credit card required.',
      },
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
