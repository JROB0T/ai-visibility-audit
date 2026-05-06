// ============================================================
// Email delivery via Resend.
//
// Three named senders, one per notification type. The spec calls out
// not making this a generic options-bag — each function knows its
// own subject, copy, and audience.
//
//   sendFreeSampleEmail   — free-scan delivery (Phase 4a, this file's
//                           reason to exist)
//   sendReportReadyEmail  — paid one-time / monthly scan complete
//                           (Phase 4b uses this; written now so all
//                           email logic stays in one file)
//   sendPastDueEmail      — subscription renewal failed
//                           (Phase 5 uses this)
//
// Failure semantics: every sender is best-effort. If RESEND_API_KEY is
// unset, or the API call throws, the function logs structured
// [EMAIL_ERROR] and returns { sent: false, reason }. Callers are
// expected to NOT roll back on email failure — the underlying work
// (scan, report) succeeded; the email is bonus delivery.
//
// From / reply-to: configured via EMAIL_FROM and EMAIL_REPLY_TO env
// vars. EMAIL_FROM must be a verified Resend sender (your verified
// domain) OR Resend's onboarding sender 'onboarding@resend.dev' for
// testing. Production should switch to a verified domain ASAP because
// onboarding-sender deliverability is mediocre.
// ============================================================

import { Resend } from 'resend';

export type EmailSendResult =
  | { sent: true; id: string }
  | { sent: false; reason: string };

interface ResendClient {
  emails: {
    send: (args: {
      from: string;
      to: string[];
      reply_to?: string;
      subject: string;
      html: string;
      text?: string;
    }) => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
  };
}

let cachedClient: ResendClient | null = null;
function getClient(): ResendClient | null {
  if (cachedClient) return cachedClient;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  cachedClient = new Resend(key) as unknown as ResendClient;
  return cachedClient;
}

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

async function send(args: SendArgs, label: string): Promise<EmailSendResult> {
  const client = getClient();
  const from = process.env.EMAIL_FROM;
  const replyTo = process.env.EMAIL_REPLY_TO;

  if (!client) {
    console.warn('[EMAIL_ERROR]', {
      label,
      reason: 'missing_resend_api_key',
      to: redactEmail(args.to),
    });
    return { sent: false, reason: 'missing_resend_api_key' };
  }
  if (!from) {
    console.warn('[EMAIL_ERROR]', {
      label,
      reason: 'missing_email_from',
      to: redactEmail(args.to),
    });
    return { sent: false, reason: 'missing_email_from' };
  }

  try {
    const res = await client.emails.send({
      from,
      to: [args.to],
      reply_to: replyTo,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    if (res.error) {
      console.error('[EMAIL_ERROR]', {
        label,
        reason: 'resend_error',
        message: res.error.message,
        to: redactEmail(args.to),
      });
      return { sent: false, reason: res.error.message };
    }
    if (!res.data?.id) {
      console.error('[EMAIL_ERROR]', {
        label,
        reason: 'no_message_id',
        to: redactEmail(args.to),
      });
      return { sent: false, reason: 'no_message_id' };
    }
    return { sent: true, id: res.data.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[EMAIL_ERROR]', {
      label,
      reason: 'thrown',
      message,
      to: redactEmail(args.to),
    });
    return { sent: false, reason: message };
  }
}

// Don't log full email addresses in error breadcrumbs.
function redactEmail(email: string): string {
  const at = email.indexOf('@');
  if (at < 1) return '***';
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

function appUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://example.com').replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : '/' + path}`;
}

// ------------------------------------------------------------
// Visual primitives. Inline CSS — every email client mangles <style>
// tags differently, but inline styles render reliably everywhere.
// ------------------------------------------------------------

function emailShell(args: { preheader: string; bodyHtml: string }): string {
  // Preheader: hidden span that controls the inbox preview snippet.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f5f3ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${esc(args.preheader)}</span>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f3ee;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e2e0d8;">
        <tr><td style="padding:32px 36px;">
          ${args.bodyHtml}
        </td></tr>
      </table>
      <p style="font-size:11px;color:#888;margin:16px 0 0 0;">
        AI Visibility Audit · See how AI assistants describe your business.
      </p>
    </td></tr>
  </table>
</body>
</html>`;
}

function ctaButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="background:#1a1a1a;border-radius:2px;">
      <a href="${esc(href)}" style="display:inline-block;padding:12px 22px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">${esc(label)} →</a>
    </td></tr>
  </table>`;
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================
// 1. sendFreeSampleEmail — free-scan delivery
// ============================================================

export interface SendFreeSampleEmailArgs {
  to: string;
  domain: string;
  shareUrl: string;            // path or absolute; absolutized via NEXT_PUBLIC_APP_URL
  businessName?: string | null;
}

export async function sendFreeSampleEmail(args: SendFreeSampleEmailArgs): Promise<EmailSendResult> {
  const subject = `Your AI Visibility Sample for ${args.domain}`;
  const url = args.shareUrl.startsWith('http') ? args.shareUrl : appUrl(args.shareUrl);
  const businessLine = args.businessName
    ? `for <strong>${esc(args.businessName)}</strong> (${esc(args.domain)})`
    : `for <strong>${esc(args.domain)}</strong>`;

  const bodyHtml = `
    <h1 style="font-family:Georgia,serif;font-weight:400;font-size:24px;line-height:1.3;margin:0 0 16px 0;color:#1a1a1a;">
      Your AI Visibility Sample is ready.
    </h1>
    <p style="font-size:15px;line-height:1.55;color:#333;margin:0 0 20px 0;">
      We tested how leading AI assistants answer buyer-intent questions ${businessLine}. Your 2-page sample shows the headline score, where you appear, and one example of where buyers are deciding without you.
    </p>
    ${ctaButton(url, 'Open my sample')}
    <p style="font-size:13px;line-height:1.6;color:#555;margin:24px 0 0 0;">
      This link is yours to share. It stays live so you can revisit or send it to your team.
    </p>
    <hr style="border:none;border-top:1px solid #e2e0d8;margin:28px 0;">
    <p style="font-size:13px;line-height:1.6;color:#555;margin:0 0 8px 0;">
      Want the full report? It includes every question we tested, who's being recommended instead of you, and a 30/60/90 plan to close the gaps.
    </p>
    <p style="font-size:13px;line-height:1.6;margin:0;">
      <a href="${esc(appUrl('/pricing'))}" style="color:#1a1a1a;">See pricing →</a>
    </p>
  `;

  const text = [
    `Your AI Visibility Sample is ready.`,
    ``,
    `We tested how leading AI assistants answer buyer-intent questions for ${args.domain}.`,
    ``,
    `Open your sample: ${url}`,
    ``,
    `Want the full report? See pricing: ${appUrl('/pricing')}`,
  ].join('\n');

  return send(
    {
      to: args.to,
      subject,
      html: emailShell({
        preheader: `Your 2-page AI visibility sample for ${args.domain} is ready to view.`,
        bodyHtml,
      }),
      text,
    },
    'sendFreeSampleEmail',
  );
}

// ============================================================
// 2. sendReportReadyEmail — paid scan complete (used in Phase 4b/5)
// ============================================================

export interface SendReportReadyEmailArgs {
  to: string;
  tier: 'tier_1' | 'tier_2';
  domain: string;
  reportUrl: string;           // path to /audit/[id] or /audit/[id]/report
  isMonthlyRerun?: boolean;
}

export async function sendReportReadyEmail(args: SendReportReadyEmailArgs): Promise<EmailSendResult> {
  const tierLabel = args.tier === 'tier_2' ? 'Tier 2' : 'Tier 1';
  const subject = args.isMonthlyRerun
    ? `${tierLabel} report refreshed for ${args.domain}`
    : `Your ${tierLabel} report is ready for ${args.domain}`;
  const url = args.reportUrl.startsWith('http') ? args.reportUrl : appUrl(args.reportUrl);

  const lede = args.isMonthlyRerun
    ? `Your monthly ${tierLabel} refresh for <strong>${esc(args.domain)}</strong> just completed. Open it to see what moved versus last month.`
    : `Your ${tierLabel} AI Visibility report for <strong>${esc(args.domain)}</strong> is ready to view.`;

  const bodyHtml = `
    <h1 style="font-family:Georgia,serif;font-weight:400;font-size:24px;line-height:1.3;margin:0 0 16px 0;color:#1a1a1a;">
      ${esc(args.isMonthlyRerun ? 'Refresh complete' : 'Your report is ready')}.
    </h1>
    <p style="font-size:15px;line-height:1.55;color:#333;margin:0 0 20px 0;">
      ${lede}
    </p>
    ${ctaButton(url, args.isMonthlyRerun ? 'Open the refresh' : 'Open the report')}
    <p style="font-size:13px;line-height:1.6;color:#555;margin:24px 0 0 0;">
      You can revisit, export, or share the report at any time from your dashboard.
    </p>
  `;

  const text = [
    args.isMonthlyRerun ? `Refresh complete.` : `Your ${tierLabel} report is ready.`,
    ``,
    args.isMonthlyRerun
      ? `Your monthly ${tierLabel} refresh for ${args.domain} just completed.`
      : `Your ${tierLabel} AI Visibility report for ${args.domain} is ready to view.`,
    ``,
    `Open it: ${url}`,
  ].join('\n');

  return send(
    {
      to: args.to,
      subject,
      html: emailShell({
        preheader: args.isMonthlyRerun
          ? `Your monthly ${tierLabel} refresh for ${args.domain} just completed.`
          : `Your ${tierLabel} AI Visibility report for ${args.domain} is ready.`,
        bodyHtml,
      }),
      text,
    },
    'sendReportReadyEmail',
  );
}

// ============================================================
// 3. sendPastDueEmail — subscription renewal failed (Phase 5)
// ============================================================

export interface SendPastDueEmailArgs {
  to: string;
  domain: string;
  billingPortalUrl: string;
}

export async function sendPastDueEmail(args: SendPastDueEmailArgs): Promise<EmailSendResult> {
  const subject = `Action needed: your AI Visibility Audit subscription`;
  const url = args.billingPortalUrl.startsWith('http')
    ? args.billingPortalUrl
    : appUrl(args.billingPortalUrl);

  const bodyHtml = `
    <h1 style="font-family:Georgia,serif;font-weight:400;font-size:24px;line-height:1.3;margin:0 0 16px 0;color:#1a1a1a;">
      Your subscription needs attention.
    </h1>
    <p style="font-size:15px;line-height:1.55;color:#333;margin:0 0 20px 0;">
      We weren't able to charge the card on file for your <strong>${esc(args.domain)}</strong> subscription. Until billing is fixed, your monthly refresh is paused.
    </p>
    ${ctaButton(url, 'Update billing')}
    <p style="font-size:13px;line-height:1.6;color:#555;margin:24px 0 0 0;">
      We'll automatically retry once your billing is updated. No further action needed after that.
    </p>
  `;

  const text = [
    `Your subscription needs attention.`,
    ``,
    `We weren't able to charge the card on file for your ${args.domain} subscription. Until billing is fixed, your monthly refresh is paused.`,
    ``,
    `Update billing: ${url}`,
  ].join('\n');

  return send(
    {
      to: args.to,
      subject,
      html: emailShell({
        preheader: `Update billing to resume your ${args.domain} monthly refresh.`,
        bodyHtml,
      }),
      text,
    },
    'sendPastDueEmail',
  );
}
