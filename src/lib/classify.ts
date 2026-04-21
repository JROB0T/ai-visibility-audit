const VALID_VERTICALS = ['restaurant', 'saas', 'ecommerce', 'healthcare', 'law_firm', 'professional_services', 'local_service', 'other'];

const RESTAURANT_URL_SIGNALS = ['/menu', '/dinner', '/lunch', '/brunch', '/wine', '/drinks', '/reservations', '/reserve', '/opentable', '/catering', '/private-dining', '/specials', '/happy-hour', '/bar'];
const RESTAURANT_DOMAIN_SIGNALS = ['bistro', 'grill', 'kitchen', 'tavern', 'cafe', 'bakery', 'pizz', 'sushi', 'ramen', 'steakhouse', 'diner', 'eatery', 'trattoria', 'brasserie', 'faubourg', 'patisserie', 'creperie', 'taqueria', 'cantina', 'pub', 'brewery'];

interface ClassifyInput {
  domain: string;
  title: string | null;
  h1: string | null;
  metaDescription: string | null;
  bodySnippet: string | null;
  pageUrls: string[];
  schemaTypes: string[];
  /** When true, the scraper was blocked (Cloudflare / captcha / etc.)
   * and scraped fields like title/h1 are garbage. Classifier should
   * lean entirely on the domain. */
  interstitialBlocked?: boolean;
}

export async function classifyBusiness(input: ClassifyInput): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('classifyBusiness: no ANTHROPIC_API_KEY, returning other');
    return 'other';
  }

  // Pre-analyze signals to include in the prompt
  const urlPaths = input.pageUrls
    .slice(0, 30)
    .map(u => { try { return new URL(u).pathname; } catch { return u; } });

  const restaurantUrlMatches = urlPaths.filter(p => RESTAURANT_URL_SIGNALS.some(s => p.toLowerCase().includes(s)));
  const domainLower = input.domain.toLowerCase();
  const restaurantDomainMatch = RESTAURANT_DOMAIN_SIGNALS.some(s => domainLower.includes(s));

  const signalNotes: string[] = [];
  if (restaurantUrlMatches.length > 0) signalNotes.push(`STRONG RESTAURANT SIGNAL: URLs found containing dining keywords: ${restaurantUrlMatches.join(', ')}`);
  if (restaurantDomainMatch) signalNotes.push(`STRONG RESTAURANT SIGNAL: Domain name "${input.domain}" suggests a food/dining establishment`);

  const prompt = `Classify this business into exactly ONE category. Return ONLY the category slug.

Categories:
- restaurant (restaurants, cafes, bars, bistros, bakeries, food trucks, catering, breweries, wineries, ANY business that serves food or drinks to customers)
- saas (software companies, tech platforms, SaaS products, developer tools, apps)
- ecommerce (online stores, retail shops, product sellers that SHIP physical goods — NOT restaurants)
- healthcare (doctors, dentists, clinics, hospitals, therapists, wellness centers)
- law_firm (attorneys, legal services, law practices)
- professional_services (consulting, accounting, financial advisors, marketing agencies)
- local_service (plumbers, electricians, HVAC, cleaning, landscaping, contractors, auto repair)
- other (anything that doesn't clearly fit above)

${input.interstitialBlocked ? `Website info (SCRAPE BLOCKED BY INTERSTITIAL/CAPTCHA — infer from domain alone):
Domain: ${input.domain}
Note: The site returned a bot-challenge page (e.g. Cloudflare). Title, heading,
description, and body text below are unreliable. Lean primarily on the domain
name and any URL path hints when classifying.` : `Website info:`}
Domain: ${input.domain}
Title: ${input.title || 'unknown'}
Main heading: ${input.h1 || 'unknown'}
Description: ${input.metaDescription || 'unknown'}
Schema types: ${input.schemaTypes.length > 0 ? input.schemaTypes.join(', ') : 'none'}
Content preview: ${(input.bodySnippet || '').slice(0, 500)}
Page URLs: ${urlPaths.join(', ')}
${signalNotes.length > 0 ? '\n' + signalNotes.join('\n') : ''}

CRITICAL RULES:
1. ANY business that serves food or drinks (restaurant, cafe, bar, bistro, bakery, brewery, winery, catering, food truck) = "restaurant". This includes French restaurants, sushi bars, pizza shops, bakeries, wine bars, etc.
2. If the domain name contains words like bistro, grill, kitchen, tavern, cafe, bakery, pizz, sushi, pub, brewery, brasserie, trattoria = almost certainly "restaurant"
3. If URLs contain /menu, /reservations, /dinner, /lunch, /brunch, /wine, /drinks = "restaurant"
4. When in doubt between "restaurant" and "local_service", if there are ANY food/dining signals, choose "restaurant"
5. "ecommerce" is ONLY for businesses that sell and ship physical products. NOT restaurants with online ordering.
6. "local_service" is for trade workers (plumbers, electricians, etc.) — NOT food businesses.

Return ONLY the slug.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 20, messages: [{ role: 'user', content: prompt }] }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('classifyBusiness API error:', { status: res.status, body: errBody });
      return 'other';
    }

    const data = await res.json();
    const raw = (data.content?.[0]?.text || '').trim().toLowerCase().replace(/[^a-z_]/g, '');
    console.log('classifyBusiness result:', raw, 'for', input.domain);

    if (VALID_VERTICALS.includes(raw)) return raw;
    return 'other';
  } catch (err) {
    console.error('classifyBusiness fetch error:', err instanceof Error ? err.message : err);
    return 'other';
  }
}

/**
 * Infer a plausible business name from a domain alone. Used as a fallback
 * when the scraper was blocked by an interstitial / bot challenge and the
 * scraped page title is garbage.
 *
 * Returns a plain string (e.g. "C&C Air") or null if Claude isn't available
 * or the response is unusable. Caller should apply its own sanity check
 * on the result before persisting.
 */
export async function inferBusinessNameFromDomain(domain: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !domain) return null;

  const prompt = `Given only a domain name, infer the most likely business name as it would appear on their website or in directories.

Domain: ${domain}

Rules:
- Return ONLY the business name, nothing else. No explanation, no quotes, no markdown.
- Expand abbreviations if they're clearly short for a common word (e.g. "ac" → "AC", "hvac" → "HVAC").
- Preserve ampersands if implied (e.g. "candcair" → "C&C Air").
- Title-case normal words.
- Keep it under 60 characters.
- If the domain is unrecognizable, return a simple title-cased form of the domain root (e.g. "example" → "Example").`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 40, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = (data.content?.[0]?.text || '').trim();
    // Strip accidental quotes/markdown
    const cleaned = raw.replace(/^["'`]|["'`]$/g, '').replace(/^#+\s*/, '').trim();
    if (!cleaned || cleaned.length > 60) return null;
    return cleaned;
  } catch (err) {
    console.error('inferBusinessNameFromDomain fetch error:', err instanceof Error ? err.message : err);
    return null;
  }
}
