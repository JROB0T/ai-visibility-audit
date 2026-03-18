import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Visibility Audit â Can AI systems find your site?',
  description:
    'Discover whether AI crawlers, AI search engines, and AI assistants can find, interpret, and recommend your key pages. Get actionable fixes.',
  openGraph: {
    title: 'AI Visibility Audit',
    description: 'Find out if AI systems can discover your key pages â and what to fix first.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>ð</text></svg>" />
      </head>
      <body className="min-h-screen flex flex-col">
        <nav className="sticky top-0 z-50 border-b border-gray-200/80 bg-white/80 backdrop-blur-lg">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-sm shadow-blue-200">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              </div>
              <span className="text-[15px] font-semibold text-gray-900 tracking-tight">AI Visibility Audit</span>
            </a>
            <div className="flex items-center gap-2">
              <a href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                Dashboard
              </a>
              <a href="/auth/login" className="text-sm font-medium text-blue-600 hover:text-blue-700 px-3.5 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-50 transition-colors">
                Sign in
              </a>
            </div>
          </div>
        </nav>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-gray-200 bg-white py-8 mt-auto">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-gray-700">AI Visibility Audit</span>
              </div>
              <p className="text-sm text-gray-400">
                Helping SaaS companies get found by AI systems
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
