// ============================================================
// /contact — Contact page
//
// Finalized 2026-06-30. Shows team@aivascan.com (Squarespace
// forwarding rule, lands in the owner's Gmail) plus quick links.
// No form yet — email-only contact keeps the page honest about
// how the team actually responds.
// ============================================================

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact — Aivascan',
};

export default function ContactPage(): React.ReactElement {
  return (
    <article className="max-w-2xl mx-auto px-4 py-12 sm:py-16">
      <h1 className="text-3xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Contact</h1>
      <p className="text-sm mb-8" style={{ color: 'var(--text-tertiary)' }}>
        We&rsquo;re a small team. Email is the fastest way to reach us.
      </p>

      <div className="card p-6 mb-6">
        <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Support and general inquiries</p>
        <p className="text-base font-medium">
          <a href="mailto:team@aivascan.com" style={{ color: 'var(--accent)' }}>
            team@aivascan.com
          </a>
        </p>
        <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
          We try to respond within one business day.
        </p>
      </div>

      <div className="card p-6">
        <p className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>Quick links</p>
        <ul className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <li>· <a href="/pricing" className="underline">Plans &amp; pricing</a></li>
          <li>· <a href="/free-scan" className="underline">Get a free sample report</a></li>
          <li>· <a href="/dashboard/account" className="underline">Manage your subscription</a></li>
          <li>· <a href="/terms" className="underline">Terms of Service</a></li>
          <li>· <a href="/privacy" className="underline">Privacy Policy</a></li>
        </ul>
      </div>
    </article>
  );
}
