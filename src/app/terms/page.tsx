// ============================================================
// /terms — Terms of Service
//
// Production copy. Owner must supply the {{FILL: …}} values
// (legal entity name, business address, refund policy,
// jurisdiction, support email, effective date) before launch.
// ============================================================

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — Aivascan',
};

export default function TermsPage(): React.ReactElement {
  return (
    <article className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
      <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Terms of Service</h1>
      <p className="text-sm mb-8" style={{ color: 'var(--text-tertiary)' }}>
        Last updated: {'{{FILL: effective date}}'}
      </p>

      <div className="prose prose-sm max-w-none" style={{ color: 'var(--text-secondary)' }}>
        <h2>1. Acceptance of Terms</h2>
        <p>
          By accessing or using Aivascan (the &ldquo;Service&rdquo;), operated by
          {' '}{'{{FILL: legal entity name}}'} (&ldquo;we,&rdquo; &ldquo;us&rdquo;),
          located at {'{{FILL: business address}}'}, you agree to be bound by
          these Terms of Service. If you do not agree, do not use the Service.
        </p>

        <h2>2. The Service</h2>
        <p>
          Aivascan generates AI-visibility audits for websites by querying
          third-party AI assistants and scoring the responses. Reports are
          informational only and do not constitute marketing, SEO, legal,
          or business advice.
        </p>

        <h2>3. Accounts</h2>
        <p>
          Certain features require an account. We use email-based
          authentication (magic link or password) and Google sign-in. You
          are responsible for safeguarding your sign-in credentials and for
          activity under your account. The Service is not intended for anyone
          under 16.
        </p>

        <h2>4. Subscriptions and Billing</h2>
        <p>
          Monthly subscriptions are billed in advance and automatically renew
          each month at the then-current price until you cancel. We charge the
          payment method on file at the start of each billing period. You may
          cancel at any time from your{' '}
          <a href="/dashboard/account">Account page</a>; cancellation stops
          future renewals and takes effect at the end of the current billing
          period. One-time audits are billed once at purchase. Prices are shown
          in USD at checkout and may change with notice. Refunds: {'{{FILL: refund policy — e.g. "14-day refund on first subscription charge; one-time audits non-refundable once the report is generated"}}'}.
        </p>

        <h2>5. Acceptable Use</h2>
        <p>
          You agree not to: (a) scan domains you do not own or lack
          authorization to test; (b) reverse-engineer, disrupt, or overload
          the Service; (c) use exported data in violation of applicable
          email-marketing or privacy laws (CAN-SPAM, GDPR, CASL).
        </p>

        <h2>6. AI-Generated Content &amp; No Guarantee of Results</h2>
        <p>
          Audit content is generated in part by querying third-party AI
          assistants and reflects their responses at the time of testing. AI
          responses are non-deterministic, vary between runs, and change over
          time, and may differ from what end users see in consumer AI products.
          Scores, grades, and findings are estimates provided for informational
          purposes only. We do not guarantee that any audit is complete,
          current, or accurate, or that following any recommendation will
          improve your AI visibility, search rankings, traffic, conversions, or
          any other business outcome. You are solely responsible for decisions
          made based on the reports.
        </p>

        <h2>7. Intellectual Property</h2>
        <p>
          The Service and its content (excluding your inputs) are owned by
          {' '}{'{{FILL: legal entity name}}'}. You retain ownership of data
          you provide.
        </p>

        <h2>8. Termination</h2>
        <p>
          We may suspend or terminate access for violations of these terms
          or for non-payment. You may delete your account at any time from
          your <a href="/dashboard/account">Account page</a> or by contacting
          support.
        </p>

        <h2>9. Disclaimers</h2>
        <p>
          THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; WITHOUT WARRANTY OF ANY
          KIND. TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE DISCLAIM ALL
          WARRANTIES, EXPRESS OR IMPLIED.
        </p>

        <h2>10. Limitation of Liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, Aivascan AND ITS OPERATORS
          ARE NOT LIABLE FOR INDIRECT, INCIDENTAL, OR CONSEQUENTIAL DAMAGES.
          OUR AGGREGATE LIABILITY IS LIMITED TO THE AMOUNTS PAID BY YOU
          IN THE 12 MONTHS PRECEDING THE CLAIM.
        </p>

        <h2>11. Governing Law</h2>
        <p>
          These terms are governed by the laws of {'{{FILL: jurisdiction — e.g. "the State of New Jersey, USA"}}'}.
        </p>

        <h2>12. Changes to These Terms</h2>
        <p>
          We may revise these terms periodically. Material changes will be
          notified by email or in-app notice.
        </p>

        <h2>13. Contact</h2>
        <p>
          Questions? Email {'{{FILL: support email}}'} or visit our
          {' '}<a href="/contact">contact page</a>.
        </p>
      </div>
    </article>
  );
}
