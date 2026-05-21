// ============================================================
// /privacy — Privacy Policy
//
// PLACEHOLDER. Generic SaaS scaffolding text. Before launch:
//   - Replace [TODO] sections
//   - Confirm what we collect, retain, and share with third parties
//     (Supabase, Stripe, Resend, Vercel, Anthropic, etc.)
//   - Add jurisdiction-specific clauses (GDPR if EU customers,
//     CCPA if California, etc.)
//   - Lawyer review or generate via Termly / Iubenda
// ============================================================

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — AIVA',
};

export default function PrivacyPage(): React.ReactElement {
  return (
    <article className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
      <div className="mb-8 p-3 rounded-md text-xs" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', color: '#F59E0B' }}>
        <strong>Draft / placeholder.</strong> This page contains generic
        scaffolding text only. Replace before public launch.
      </div>

      <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Privacy Policy</h1>
      <p className="text-sm mb-8" style={{ color: 'var(--text-tertiary)' }}>
        Last updated: <em>[TODO: insert date when finalized]</em>
      </p>

      <div className="prose prose-sm max-w-none" style={{ color: 'var(--text-secondary)' }}>
        <h2>1. Overview</h2>
        <p>
          AIVA (&ldquo;we&rdquo;, &ldquo;us&rdquo;) provides AI-visibility audits at
          aivascan.com. This policy explains what we collect, why, and your
          choices.
        </p>

        <h2>2. Information We Collect</h2>
        <ul>
          <li>
            <strong>Account information:</strong> Email address you use to
            sign up or that is captured during Stripe checkout.
          </li>
          <li>
            <strong>Website inputs:</strong> Domains you submit for scanning.
          </li>
          <li>
            <strong>Payment information:</strong> Processed by Stripe; we
            do not store full card numbers. Stripe gives us a customer ID,
            last4, and subscription metadata.
          </li>
          <li>
            <strong>Usage data:</strong> Standard server logs (IP, user-agent,
            timestamps) for security and debugging.
          </li>
          <li>
            <strong>Audit outputs:</strong> Generated reports, prompt
            responses from AI assistants, and derived scores.
          </li>
        </ul>

        <h2>3. How We Use Information</h2>
        <ul>
          <li>To deliver and improve the Service</li>
          <li>To send transactional email (report delivery, billing notices)</li>
          <li>To detect abuse and enforce our Terms of Service</li>
          <li>To comply with legal obligations</li>
        </ul>

        <h2>4. Third-Party Services</h2>
        <p>
          We share data with the following processors only as needed to
          operate the Service:
        </p>
        <ul>
          <li><strong>Supabase</strong> — database and authentication</li>
          <li><strong>Stripe</strong> — payment processing and billing</li>
          <li><strong>Resend</strong> — transactional email delivery</li>
          <li><strong>Vercel</strong> — hosting and edge infrastructure</li>
          <li><strong>Anthropic / other AI providers</strong> — generation of audit prompts and analysis</li>
        </ul>
        <p>
          <em>[TODO: confirm full list and add links to each processor&rsquo;s
          privacy policy.]</em>
        </p>

        <h2>5. Cookies and Tracking</h2>
        <p>
          We use first-party cookies for authentication and session
          management only. We do not currently use third-party analytics
          or advertising cookies. <em>[TODO: update if analytics is added
          before launch.]</em>
        </p>

        <h2>6. Data Retention</h2>
        <p>
          Account data is retained while your account is active. You can
          request deletion by emailing <em>[TODO: support email]</em>. Audit
          results may be retained in anonymized form for service-improvement
          purposes.
        </p>

        <h2>7. Security</h2>
        <p>
          We use industry-standard practices to protect your data,
          including encryption in transit (HTTPS) and at rest (Supabase),
          and hashed API keys. No system is perfectly secure; we do not
          guarantee absolute security.
        </p>

        <h2>8. Your Rights</h2>
        <p>
          Depending on your jurisdiction, you may have rights to access,
          correct, export, or delete your personal data. Email
          <em> [TODO: privacy@aivascan.com or similar]</em> to exercise
          these rights.
        </p>

        <h2>9. Children</h2>
        <p>
          The Service is not intended for users under 16. We do not
          knowingly collect data from children.
        </p>

        <h2>10. International Users</h2>
        <p>
          Your data may be processed in the United States or other countries
          where our processors operate. By using the Service you consent to
          such transfer.
        </p>

        <h2>11. Changes</h2>
        <p>
          We may update this policy. Material changes will be notified by
          email or in-app notice.
        </p>

        <h2>12. Contact</h2>
        <p>
          Questions about this policy? Email <em>[TODO: privacy@aivascan.com
          or similar]</em> or visit our <a href="/contact">contact page</a>.
        </p>
      </div>
    </article>
  );
}
