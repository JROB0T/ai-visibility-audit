// ============================================================
// Shared cold-outreach email composer.
//
// Single source of truth for the subject + body the operator
// uses when emailing a sample report. Two consumers:
//   - /api/audit/[id]/outreach-email          (single audit, owner UI)
//   - /api/audits/export                      (bulk CSV, batch outreach)
//
// Keeping the composition here means the on-screen preview and
// the exported CSV body can never drift apart. Inputs are plain
// values (no DB clients) so callers fetch what they need and
// hand it in.
// ============================================================

export interface OutreachEmailInputs {
  businessName: string;
  score: number;
  grade: string;
  shareUrl: string;        // empty string if not minted
  pricingUrl: string;      // absolute
  monthlyPrice: string;    // already formatted, e.g. "$29.99"
  oneTimePrice: string;    // already formatted, e.g. "$39.99"
  topMissingQuery1: string;
  topMissingQuery2: string;
}

export interface OutreachEmailOutput {
  subject: string;
  body: string;
}

export function buildOutreachEmail(inputs: OutreachEmailInputs): OutreachEmailOutput {
  const {
    businessName,
    score,
    grade,
    shareUrl,
    pricingUrl,
    monthlyPrice,
    oneTimePrice,
    topMissingQuery1,
    topMissingQuery2,
  } = inputs;

  const subject = `${businessName}'s AI visibility score: ${score}/100`;

  // First-name merge tag uses Liquid syntax so common cold-email
  // tools (Instantly, Smartlead, Lemlist, Apollo) fill it in.
  const greeting = `Hey {{firstName | there}},`;

  const missingLine = topMissingQuery1 && topMissingQuery2
    ? `You're missing from buyer-intent searches like "${topMissingQuery1}" and "${topMissingQuery2}". Competitors are getting recommended in your place.`
    : topMissingQuery1
    ? `You're missing from buyer-intent searches like "${topMissingQuery1}" — exactly the kind that drives real customer decisions.`
    : `Across the buyer-intent searches we tested, your visibility was inconsistent — competitors were getting recommended for searches you should be winning.`;

  const sampleLine = shareUrl
    ? `Your sample (2 pages, takes a minute): ${shareUrl}`
    : `Happy to send the sample report over when you have a moment.`;

  const fullLine = `Full report — who's being recommended instead of you, every question we tested, and a 30/60/90 plan to fix it:`;
  const ctaLine = `→ ${pricingUrl}  (${monthlyPrice}/mo or ${oneTimePrice} one-time)`;

  const signoff = `{{senderName | -- }}`;

  const body = [
    greeting,
    '',
    `I ran ${businessName} through our AI visibility checker — you scored ${score}/100 (grade ${grade || '—'}).`,
    '',
    missingLine,
    '',
    sampleLine,
    '',
    fullLine,
    ctaLine,
    '',
    signoff,
  ].join('\n');

  return { subject, body };
}
