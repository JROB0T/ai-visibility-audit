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
  title: 'Free AI Visibility Sample — Aivascan',
  description:
    'Get a free sample report showing how AI assistants (ChatGPT, Claude, Perplexity, Gemini) describe your business — and what to fix first.',
  openGraph: {
    title: 'Free AI Visibility Sample — Aivascan',
    description:
      'See how AI assistants answer buyer-intent questions about your business. Free 2-page sample report.',
    type: 'website',
    siteName: 'Aivascan',
  },
};

export default function FreeScanLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return <>{children}</>;
}
