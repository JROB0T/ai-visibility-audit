// ============================================================
// Homepage (server half) — owns the page metadata: self-canonical,
// unique description, per-page OG/Twitter tags. The interactive
// marketing content lives in _HomeClient.tsx (a client component,
// which can't export `metadata`).
// ============================================================

import type { Metadata } from 'next';
import HomeClient from './_HomeClient';

export const metadata: Metadata = {
  description:
    'Aivascan scans how AI assistants answer buyer-intent questions about your business — and gives you a scored report with a prioritized fix plan. Free 6-prompt sample, no account.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Aivascan — See how AI describes your business',
    description:
      'Scored reports on how AI assistants answer buyer-intent questions about your business, with a prioritized fix plan. Free 6-prompt sample, no account.',
    type: 'website',
    siteName: 'Aivascan',
    url: '/',
  },
  twitter: {
    card: 'summary',
    title: 'Aivascan — See how AI describes your business',
    description:
      'Scored reports on how AI assistants answer buyer-intent questions about your business, with a prioritized fix plan. Free 6-prompt sample, no account.',
  },
};

export default function HomePage() {
  return <HomeClient />;
}
