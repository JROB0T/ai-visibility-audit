// ============================================================
// /terms — Terms of Service
//
// PLACEHOLDER. The text below is generic SaaS scaffolding only.
// Before any real launch:
//   - Replace placeholder sections marked [TODO]
//   - Have an attorney review or generate via Termly / Iubenda
//   - Confirm specifics around AI-generated reports, refunds,
//     subscription auto-renewal, and data-processing
// ============================================================

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — AIVA',
};

export default function TermsPage(): React.ReactElement {
  return (
    <article className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
      <div className="mb-8 p-3 rounded-md text-xs" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', color: '#F59E0B' }}>
        <strong>Draft / placeholder.</strong> This page contains generic
        scaffolding text only. Replace before public launch.
      </div>

      <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Terms of Service</h1>
      <p className="text-sm mb-8" style={{ color: 'var(--text-tertiary)' }}>
        Last updated: <em>[TODO: insert date when finalized]</em>
      </p>

      <div className="prose prose-sm max-w-none" style={{ color: 'var(--text-secondary)' }}>
        <h2>1. Acceptance of Terms</h2>
        <p>
          By accessing or using AIVA (the &ldquo;Service&rdquo;), operated by
          <em> [TODO: legal entity name and address]</em>, you agree to be
          bound by these Terms of Service. If you do not agree, do not use
          the Service.
        </p>

        <h2>2. The Service</h2>
        <p>
          AIVA generates AI-visibility audits for websites by querying
          third-party AI assistants and scoring the responses. Reports are
          informational only and do not constitute marketing, SEO, legal,
          or business advice.
        </p>

        <h2>3. Accounts</h2>
        <p>
          You may need an account to access certain features. You are
          responsible for safeguarding your sign-in credentials. We use
          email-based authentication (magic links or passwords) and do
          not share credentials with third parties.
        </p>

        <h2>4. Subscriptions and Billing</h2>
        <p>
          Paid subscriptions (Monthly) renew automatically until canceled.
          You can cancel at any time from your <a href="/dashboard/account">account page</a>.
          Refund policy: <em>[TODO: define refund window and conditions]</em>.
          Pricing is shown in USD and may change with notice.
        </p>

        <h2>5. Acceptable Use</h2>
        <p>
          You agree not to: (a) use the Service to scan domains you do not
          own or have authorization to test, (b) attempt to reverse-engineer
          or disrupt the Service, (c) use exported data in violation of
          applicable email-marketing or privacy laws (CAN-SPAM, GDPR,
          CASL).
        </p>

        <h2>6. AI-Generated Content</h2>
        <p>
          Audit content is generated in part by third-party AI assistants
          and may contain inaccuracies. AIVA makes no warranty that the
          reports are complete, current, or fit for any particular purpose.
        </p>

        <h2>7. Intellectual Property</h2>
        <p>
          The Service and its content (excluding your inputs) are owned by
          <em> [TODO: legal entity name]</em>. You retain ownership of any
          data you provide.
        </p>

        <h2>8. Termination</h2>
        <p>
          We may suspend or terminate access for violations of these terms
          or for non-payment. You may delete your account at any time by
          contacting <a href="/contact">support</a>.
        </p>

        <h2>9. Disclaimers</h2>
        <p>
          THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; WITHOUT WARRANTY OF ANY
          KIND. TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE DISCLAIM ALL
          WARRANTIES, EXPRESS OR IMPLIED.
        </p>

        <h2>10. Limitation of Liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, AIVA AND ITS OPERATORS
          ARE NOT LIABLE FOR INDIRECT, INCIDENTAL, OR CONSEQUENTIAL DAMAGES.
          OUR AGGREGATE LIABILITY IS LIMITED TO THE AMOUNTS PAID BY YOU
          IN THE 12 MONTHS PRECEDING THE CLAIM.
        </p>

        <h2>11. Governing Law</h2>
        <p>
          These terms are governed by the laws of <em>[TODO: jurisdiction]</em>.
        </p>

        <h2>12. Changes to These Terms</h2>
        <p>
          We may revise these terms periodically. Material changes will be
          notified by email or in-app notice.
        </p>

        <h2>13. Contact</h2>
        <p>
          Questions? Email <em>[TODO: support@aivascan.com or similar]</em> or
          visit our <a href="/contact">contact page</a>.
        </p>
      </div>
    </article>
  );
}
