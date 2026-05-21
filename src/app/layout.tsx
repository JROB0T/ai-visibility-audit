import type { Metadata } from 'next';
import './globals.css';
import { ThemeWrapper } from '@/components/ThemeWrapper';

export const metadata: Metadata = {
  metadataBase: new URL('https://aivascan.com'),
  title: 'AIVA — See how AI describes your business',
  description: 'AIVA scans how AI assistants (ChatGPT, Claude, Perplexity, Gemini) answer buyer-intent questions about your business — and tells you what to fix.',
  openGraph: {
    title: 'AIVA — AI Visibility Audit',
    description: 'See how AI assistants describe your business — and what to fix first.',
    type: 'website',
    siteName: 'AIVA',
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
