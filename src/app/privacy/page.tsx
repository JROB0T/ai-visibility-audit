// ============================================================
// /privacy — Privacy Policy
//
// Production copy. Owner must supply the {{FILL: …}} values
// (effective date, support/privacy email, optional processor
// policy links) before launch.
// ============================================================

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — AIVA',
};

export default function PrivacyPage(): React.ReactElement {
  return (
    <article className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
      <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Privacy Policy</h1>
      <p className="text-sm mb-8" style={{ color: 'var(--text-tertiary)' }}>
        Last updated: {'{{FILL: effective date}}'}
      </p>

      <div className="prose prose-sm max-w-none" style={{ color: 'var(--text-secondary)' }}>
        <h2>1. Overview</h2>
        <p>
          AIVA (&ldquo;we,&rdquo; &ldquo;us&rdquo;) provides AI-visibility
          audits. This policy explains what we collect, why, and your choices.
        </p>

        <h2>2. Information We Collect</h2>
        <ul>
          <li>
            <strong>Account information:</strong> email used to sign up or
            captured during Stripe checkout.
          </li>
          <li>
            <strong>Website inputs:</strong> domains you submit.
          </li>
          <li>
            <strong>Payment information:</strong> processed by Stripe — we
            never store full card numbers; we receive a customer ID, card
            last4, and subscription metadata.
          </li>
          <li>
            <strong>Usage data:</strong> standard server logs (IP, user-agent,
            timestamps) for security and debugging.
          </li>
          <li>
            <strong>Audit outputs:</strong> generated reports, AI prompt
            responses, and derived scores.
          </li>
        </ul>

        <h2>3. How We Use Information</h2>
        <ul>
          <li>To deliver and improve the Service</li>
          <li>To send transactional email (report delivery, billing notices)</li>
          <li>To detect abuse and enforce our Terms</li>
          <li>To comply with legal obligations</li>
        </ul>

        <h2>4. Third-Party Processors</h2>
        <p>
          We share data with these processors only as needed to operate the
          Service:
        </p>
        <ul>
          <li><strong>Supabase</strong> — database and authentication</li>
          <li><strong>Stripe</strong> — payment processing and billing</li>
          <li><strong>Resend</strong> — transactional email delivery</li>
          <li><strong>Vercel</strong> — hosting and edge infrastructure</li>
          <li><strong>Anthropic</strong> — generation of audit prompts and analysis</li>
        </ul>
        <p>{'{{FILL: optional — add links to each processor\'s privacy policy}}'}</p>

        <h2>5. Cookies and Tracking</h2>
        <p>
          We use first-party cookies for authentication and session
          management only. We do not currently use third-party analytics or
          advertising cookies.
        </p>

        <h2>6. Data Retention</h2>
        <p>
          Account data is retained while your account is active. You can
          request deletion by emailing {'{{FILL: support/privacy email}}'}.
          Audit results may be retained in anonymized form for service
          improvement.
        </p>

        <h2>7. Security</h2>
        <p>
          We use industry-standard protections including encryption in transit
          (HTTPS) and at rest, and hashed API keys. No system is perfectly
          secure; we do not guarantee absolute security.
        </p>

        <h2>8. Your Rights</h2>
        <p>
          Depending on your jurisdiction, you may have rights to access,
          correct, export, or delete your personal data. Email
          {' '}{'{{FILL: support/privacy email}}'} to exercise them.
        </p>

        <h2>9. Children</h2>
        <p>
          The Service is not intended for users under 16; we do not knowingly
          collect their data.
        </p>

        <h2>10. International Users</h2>
        <p>
          Your data may be processed in the United States or other countries
          where our processors operate. By using the Service you consent to
          such transfer.
        </p>

        <h2>11. Changes</h2>
        <p>
          We may update this policy; material changes will be notified by
          email or in-app notice.
        </p>

        <h2>12. Contact</h2>
        <p>
          Questions? Email {'{{FILL: support/privacy email}}'} or visit our
          {' '}<a href="/contact">contact page</a>.
        </p>
      </div>
    </article>
  );
}
