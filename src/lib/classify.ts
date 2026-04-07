const VALID_VERTICALS = ['restaurant', 'saas', 'ecommerce', 'healthcare', 'law_firm', 'professional_services', 'local_service', 'other'];

interface ClassifyInput {
  domain: string;
  title: string | null;
  h1: string | null;
  metaDescription: string | null;
  bodySnippet: string | null;
  pageUrls: string[];
  schemaTypes: string[];
}

export async function classifyBusiness(input: ClassifyInput): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('classifyBusiness: no ANTHROPIC_API_KEY, returning other');
    return 'other';
  }

  const urlPaths = input.pageUrls
    .slice(0, 30)
    .map(u => { try { return new URL(u).pathname; } catch { return u; } })
    .join(', ');

  const prompt = `Based on the following website information, classify this business into exactly ONE of these categories. Return ONLY the category slug, nothing else.

Categories:
- restaurant (restaurants, cafes, bars, bakeries, food trucks, catering, any food service business)
- saas (software companies, tech platforms, SaaS products, developer tools, apps)
- ecommerce (online stores, retail shops, product sellers — NOT restaurants even if they sell merchandise)
- healthcare (doctors, dentists, clinics, hospitals, therapists, mental health, wellness centers)
- law_firm (attorneys, legal services, law practices)
- professional_services (consulting, accounting, financial advisors, marketing agencies, real estate agents)
- local_service (plumbers, electricians, HVAC, cleaning, landscaping, contractors, auto repair)
- other (anything that doesn't clearly fit above)

Website info:
Domain: ${input.domain}
Title: ${input.title || 'unknown'}
Main heading: ${input.h1 || 'unknown'}
Description: ${input.metaDescription || 'unknown'}
Schema types found: ${input.schemaTypes.length > 0 ? input.schemaTypes.join(', ') : 'none'}
Page content preview: ${(input.bodySnippet || '').slice(0, 500)}
Pages found: ${urlPaths}

IMPORTANT: A business that serves food (restaurant, cafe, bar, bakery, catering) is ALWAYS "restaurant", even if it has an online ordering system. Only classify as "ecommerce" if it primarily sells physical products that are shipped. Only classify as "saas" if it is a software product.

Return ONLY the slug (e.g., "restaurant" or "saas"), no explanation.`;

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
