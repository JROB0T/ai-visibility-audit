// ============================================================
// /privacy — Privacy Policy
//
// Finalized 2026-06-26 for The Bergen Standard, LLC d/b/a Aivascan.
// Effective date, business entity, processor links, and contact
// email are all baked in. Re-review before any material change to
// data handling, processors, or pricing.
// ============================================================

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — Aivascan',
};

export default function PrivacyPage(): React.ReactElement {
  return (
    <article className="max-w-2xl mx-auto px-4 py-12 sm:py-16">
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3" style={{ color: 'var(--text-primary)' }}>Privacy Policy</h1>
      <p className="text-sm mb-10" style={{ color: 'var(--text-tertiary)' }}>
        Last updated: June 26, 2026
      </p>

      <div className="legal-doc">
        <h2>1. Overview</h2>
        <p>
          Aivascan (&ldquo;we,&rdquo; &ldquo;us&rdquo;) is a service of
          The Bergen Standard, LLC, a New Jersey limited liability company.
          We provide AI-visibility audits. This policy explains what we
          collect, why, and your choices.
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
          <li>
            <strong>Supabase</strong> — database and authentication
            (<a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer">privacy policy</a>)
          </li>
          <li>
            <strong>Stripe</strong> — payment processing and billing
            (<a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">privacy policy</a>)
          </li>
          <li>
            <strong>Resend</strong> — transactional email delivery
            (<a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">privacy policy</a>)
          </li>
          <li>
            <strong>Vercel</strong> — hosting and edge infrastructure
            (<a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">privacy policy</a>)
          </li>
          <li>
            <strong>Anthropic</strong> — generation of audit prompts and analysis
            (<a href="https://www.anthropic.com/legal/privacy" target="_blank" rel="noopener noreferrer">privacy policy</a>)
          </li>
          <li>
            <strong>Google</strong> — sign-in via Google OAuth (if you use it)
            (<a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">privacy policy</a>)
          </li>
        </ul>

        <h2>5. Cookies and Tracking</h2>
        <p>
          We use first-party cookies for authentication and session
          management only. We do not currently use third-party analytics or
          advertising cookies.
        </p>

        <h2>6. Data Retention</h2>
        <p>
          Account data is retained while your account is active. You can
          request deletion by emailing{' '}
          <a href="mailto:team@aivascan.com">team@aivascan.com</a>.
          After a deletion request, we remove personal data within 30 days,
          subject to legal retention requirements and backups that age out
          on a rolling basis. Audit results may be retained in anonymized
          form for service improvement.
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
          correct, export, or delete your personal data. California
          residents have additional rights under the CCPA/CPRA, including
          the right to know what categories of personal information we
          collect, to request deletion, and to opt out of any sale or
          sharing of personal information. We do not sell personal
          information. To exercise any of these rights, email{' '}
          <a href="mailto:team@aivascan.com">team@aivascan.com</a>; we
          will respond within the timeframe required by applicable law.
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
          Questions? Email{' '}
          <a href="mailto:team@aivascan.com">team@aivascan.com</a> or visit
          our <a href="/contact">contact page</a>. Postal correspondence:
          The Bergen Standard, LLC, Jersey City, New Jersey, USA.
        </p>
      </div>
    </article>
  );
}
