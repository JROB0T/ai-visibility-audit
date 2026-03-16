import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Visibility Audit — Can AI systems find your site?',
  description:
    'Discover whether AI crawlers, AI search engines, and AI assistants can find, interpret, and recommend your key pages. Get actionable fixes.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col" style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        <nav className="border-b border-gray-200 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
                <path d="M11 8v6" />
                <path d="M8 11h6" />
              </svg>
              AI Visibility Audit
            </a>
            <div className="flex items-center gap-4">
              <a href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">
                Dashboard
              </a>
              <a href="/auth/login" className="text-sm text-gray-600 hover:text-gray-900">
                Sign in
              </a>
            </div>
          </div>
        </nav>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-gray-200 bg-white py-6 mt-auto">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center text-sm text-gray-500">
            AI Visibility Audit · Helping SaaS companies get found by AI systems
          </div>
        </footer>
      </body>
    </html>
  );
}
