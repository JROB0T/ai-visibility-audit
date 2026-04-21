import { claudeFetchWithRetry } from '@/lib/claudeRetry';

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
    const res = await claudeFetchWithRetry(
      () => fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 20, messages: [{ role: 'user', content: prompt }] }),
      }),
      { label: 'classifyBusiness' },
    );

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

// ============================================================
// Ticket 7.6 — rich business-profile enrichment via tool_use.
//
// Used during discovery bootstrap to fill in ALL profile context
// (name, primary_category, service_area, core_services, etc.) in one
// call — not just the vertical slug. Web search is enabled so Haiku
// can look up real businesses and return concrete, verifiable facts.
// ============================================================

export interface EnrichedBusinessProfile {
  business_name: string | null;
  primary_category: string | null;    // broader than vertical — e.g. 'hvac', 'dental'
  service_area: string | null;         // free-form sentence
  service_area_city: string | null;    // short "Belford NJ" label
  service_area_region: string | null;  // broader "Central New Jersey" label
  description: string | null;          // 1-2 sentences
  core_services: string[];             // 3-8 specific services
  target_customer: 'residential' | 'commercial' | 'both' | null;
  branded_terms: string[];             // monitored brand variants (usually [name])
}

export interface EnrichInput {
  domain: string;
  /** Scraped homepage title, if any. May be null or garbage for interstitial sites. */
  scrapedTitle?: string | null;
  scrapedH1?: string | null;
  scrapedDescription?: string | null;
  scrapedBodySnippet?: string | null;
  pageUrls?: string[];
  schemaTypes?: string[];
  interstitialBlocked?: boolean;
}

const RECORD_BUSINESS_PROFILE_TOOL = {
  name: 'record_business_profile',
  description: 'Record the structured business profile. Fill in every field you are confident about. Return null for a field only when you cannot verify it from scraped content, the domain, or your training-data knowledge of the business.',
  input_schema: {
    type: 'object',
    required: [
      'business_name',
      'primary_category',
      'service_area',
      'service_area_city',
      'service_area_region',
      'description',
      'core_services',
      'target_customer',
      'branded_terms',
    ],
    properties: {
      business_name: {
        type: ['string', 'null'],
        description: 'Full business name as it appears on the site or in directories (e.g. "C&C Air Conditioning & Heating"). Expand common abbreviations (ac→AC, hvac→HVAC). Preserve ampersands.',
      },
      primary_category: {
        type: ['string', 'null'],
        description: 'Specific industry category (e.g. "hvac", "plumbing", "dental", "family_law", "italian_restaurant"). Prefer specificity over the generic slug "other".',
      },
      service_area: {
        type: ['string', 'null'],
        description: 'Free-form sentence describing geographic service area (e.g. "Belford, NJ and Central New Jersey (Monmouth, Ocean, Middlesex counties)"). Null if genuinely undeterminable.',
      },
      service_area_city: {
        type: ['string', 'null'],
        description: 'Short city/metro label for prompt anchoring (e.g. "Belford NJ", "Austin TX"). Null if unknown.',
      },
      service_area_region: {
        type: ['string', 'null'],
        description: 'Broader region label (e.g. "Central New Jersey", "Monmouth County NJ", "Bay Area"). Null if unknown.',
      },
      description: {
        type: ['string', 'null'],
        description: '1-2 sentence summary of what the business does.',
      },
      core_services: {
        type: 'array',
        items: { type: 'string' },
        description: '3-8 specific services (e.g. ["HVAC repair", "AC installation", "emergency plumbing"]). Empty array if truly unknown.',
      },
      target_customer: {
        type: ['string', 'null'],
        enum: ['residential', 'commercial', 'both', null],
        description: 'Primary customer type.',
      },
      branded_terms: {
        type: 'array',
        items: { type: 'string' },
        description: 'Brand names / variants to monitor in AI answers. Usually just the business name + common short forms.',
      },
    },
  },
};

/**
 * Enrich a business profile using Claude Haiku 4.5 with web search.
 *
 * Returns null only when the API key isn't configured — otherwise returns a
 * populated struct (individual fields may be null when Haiku can't verify).
 * Never throws; errors are logged and we return null.
 */
export async function enrichBusinessProfile(input: EnrichInput): Promise<EnrichedBusinessProfile | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !input.domain) return null;

  const scrapeStatus = input.interstitialBlocked
    ? 'The site was blocked by a bot-challenge (Cloudflare/captcha). Scraped fields are unreliable — rely primarily on web search and your own knowledge of the business.'
    : 'Scraped fields below may be thin. Use web search and your knowledge of the business to fill in what the scrape missed.';

  const systemPrompt = `You are enriching a business profile so a downstream AI-discovery test can be generated. Be concrete, accurate, and conservative.

${scrapeStatus}

You have access to web_search. Use it if the scraped data is thin or uncertain (up to 2 searches). Then call the record_business_profile tool EXACTLY ONCE with your best structured answer.

Key rules:
- Never guess. If you cannot verify a field from the scraped content, the domain, OR your training-data knowledge of the business, return null for that field. For arrays, return an empty array rather than inventing entries.
- For well-known local businesses you recognize (e.g. "candcair.com" → C&C Air in New Jersey), your training data is a valid source — use it. But stay conservative: if you're not sure it's the same business, return null.
- service_area_city should be short (e.g. "Belford NJ" or "Austin TX"), not a full address.
- service_area_region should be the broader region the business plausibly serves (e.g. "Central New Jersey", "Monmouth County NJ").
- primary_category should be specific (e.g. "hvac", "plumbing", "dental", "personal_injury_law") rather than the generic "local_service" or "other".
- branded_terms: include the business name plus one or two common variants (e.g. ["C&C Air", "C&C Air Conditioning"]). Do not include the domain.

You MUST call record_business_profile. Do not answer in plain text.`;

  const userMessage = `Enrich the profile for this business.

Domain: ${input.domain}
Scraped title: ${input.scrapedTitle || '(none)'}
Scraped H1: ${input.scrapedH1 || '(none)'}
Scraped meta description: ${input.scrapedDescription || '(none)'}
Scraped body preview: ${(input.scrapedBodySnippet || '').slice(0, 400) || '(none)'}
Schema types detected: ${(input.schemaTypes || []).join(', ') || '(none)'}
Example URLs: ${(input.pageUrls || []).slice(0, 8).join(', ') || '(none)'}`;

  try {
    const res = await claudeFetchWithRetry(
      () => fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1500,
          temperature: 0,
          system: systemPrompt,
          tools: [
            { type: 'web_search_20250305', name: 'web_search', max_uses: 2 },
            RECORD_BUSINESS_PROFILE_TOOL,
          ],
          tool_choice: { type: 'auto' },
          messages: [{ role: 'user', content: userMessage }],
        }),
      }),
      { label: 'enrichBusinessProfile:turn1' },
    );
    if (!res.ok) {
      const body = await res.text();
      console.error('[enrichBusinessProfile] API error:', { status: res.status, body: body.slice(0, 300) });
      return null;
    }
    const data = await res.json();

    // Find the record_business_profile tool_use block
    let toolInput: Record<string, unknown> | null = null;
    if (Array.isArray(data.content)) {
      for (const block of data.content) {
        if (block?.type === 'tool_use' && block.name === 'record_business_profile' && block.input && typeof block.input === 'object') {
          toolInput = block.input as Record<string, unknown>;
          break;
        }
      }
    }

    // If Claude skipped the tool, force it with a second turn.
    if (!toolInput) {
      console.warn('[enrichBusinessProfile] tool_use missing on turn 1, forcing turn 2');
      const turn2 = await claudeFetchWithRetry(
        () => fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1500,
            temperature: 0,
            system: systemPrompt,
            tools: [RECORD_BUSINESS_PROFILE_TOOL],
            tool_choice: { type: 'tool', name: 'record_business_profile' },
            messages: [
              { role: 'user', content: userMessage },
              { role: 'assistant', content: data.content },
              { role: 'user', content: 'Please call record_business_profile now with your best structured profile. Use null for fields you cannot verify.' },
            ],
          }),
        }),
        { label: 'enrichBusinessProfile:turn2' },
      );
      if (!turn2.ok) {
        const body = await turn2.text();
        console.error('[enrichBusinessProfile] turn 2 API error:', { status: turn2.status, body: body.slice(0, 300) });
        return null;
      }
      const turn2Data = await turn2.json();
      if (Array.isArray(turn2Data.content)) {
        for (const block of turn2Data.content) {
          if (block?.type === 'tool_use' && block.name === 'record_business_profile' && block.input && typeof block.input === 'object') {
            toolInput = block.input as Record<string, unknown>;
            break;
          }
        }
      }
    }

    if (!toolInput) {
      console.error('[enrichBusinessProfile] tool_use still missing after forcing turn');
      return null;
    }

    const toStringOrNull = (v: unknown): string | null => {
      if (v === null || v === undefined) return null;
      const s = String(v).trim();
      return s.length > 0 ? s : null;
    };
    const toStringArray = (v: unknown): string[] => {
      if (!Array.isArray(v)) return [];
      return v.map(x => String(x || '').trim()).filter(x => x.length > 0);
    };
    const targetRaw = toStringOrNull(toolInput.target_customer);
    const target: EnrichedBusinessProfile['target_customer'] =
      targetRaw === 'residential' || targetRaw === 'commercial' || targetRaw === 'both' ? targetRaw : null;

    return {
      business_name: toStringOrNull(toolInput.business_name),
      primary_category: toStringOrNull(toolInput.primary_category),
      service_area: toStringOrNull(toolInput.service_area),
      service_area_city: toStringOrNull(toolInput.service_area_city),
      service_area_region: toStringOrNull(toolInput.service_area_region),
      description: toStringOrNull(toolInput.description),
      core_services: toStringArray(toolInput.core_services),
      target_customer: target,
      branded_terms: toStringArray(toolInput.branded_terms),
    };
  } catch (err) {
    console.error('[enrichBusinessProfile] fetch error:', err instanceof Error ? err.message : err);
    return null;
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
    const res = await claudeFetchWithRetry(
      () => fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 40, messages: [{ role: 'user', content: prompt }] }),
      }),
      { label: 'inferBusinessNameFromDomain' },
    );
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
