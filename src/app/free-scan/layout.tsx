// ============================================================
// /free-scan layout
//
// The page itself is a client component (interactive form), so it
// can't export `metadata`. This server-component layout supplies the
// page-specific title/description + Open Graph tags. Layout adds no
// markup — it just renders its children — so the visual design is
// unchanged.
// ============================================================

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Free AI Visibility Sample',
  description:
    'Enter your email and website — we run a 6-prompt scan and email you a 2-page report showing where AI recommends you, where it doesn’t, and who it names instead. No account, no card.',
  alternates: { canonical: '/free-scan' },
  openGraph: {
    title: 'Free AI Visibility Sample · Aivascan',
    description:
      'See how AI assistants answer buyer-intent questions about your business. Free 2-page sample report — no account, no card.',
    type: 'website',
    siteName: 'Aivascan',
    url: '/free-scan',
  },
  twitter: {
    card: 'summary',
    title: 'Free AI Visibility Sample · Aivascan',
    description:
      'See how AI assistants answer buyer-intent questions about your business. Free 2-page sample report — no account, no card.',
  },
};

export default function FreeScanLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return <>{children}</>;
}
