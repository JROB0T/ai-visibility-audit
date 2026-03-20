import type { Metadata } from 'next';
import './globals.css';
import { ThemeWrapper } from '@/components/ThemeWrapper';

export const metadata: Metadata = {
  title: 'AI Visibility Audit — Can AI systems find your site?',
  description: 'Discover whether AI crawlers, AI search engines, and AI assistants can find, interpret, and recommend your key pages. Get actionable fixes.',
  openGraph: {
    title: 'AI Visibility Audit',
    description: 'Find out if AI systems can discover your key pages — and what to fix first.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🔍</text></svg>" />
      </head>
      <body className="min-h-screen flex flex-col">
        <ThemeWrapper>{children}</ThemeWrapper>
      </body>
    </html>
  );
}
