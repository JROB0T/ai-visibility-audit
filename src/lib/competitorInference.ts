// ============================================================
// Competitor inference — shared helper used by:
//   - /api/growth-strategy (existing behavior unchanged)
//   - /api/discovery/competitors/infer (new)
// ============================================================

import { normalizeDomain } from '@/lib/discovery';

export interface CompetitorEstimate {
  domain: string;
  overall: number;
  crawl: number;
  read: number;
  commercial: number;
  trust: number;
  rationale: string;
}

export interface InferCompetitorsInput {
  domain: string;
  businessType: string; // vertical slug
  h1?: string | null;
  metaDescription?: string | null;
  pageTypes?: string[];
  /**
   * How many competitors to return. Growth strategy uses 2;
   * discovery inference uses 5. Default is 2 to preserve existing behavior.
   */
  count?: number;
}

const VERTICAL_HINTS: Record<string, string> = {
  restaurant: 'This is a RESTAURANT/food service business. Competitors must be other restaurants, cafes, or food businesses — NOT retail stores or tech companies.',
  saas: 'This is a SOFTWARE/SaaS company. Competitors must be other software companies in the same category.',
  ecommerce: 'This is an E-COMMERCE/retail business. Competitors must be other online retailers in the same product category.',
  healthcare: 'This is a HEALTHCARE business. Competitors must be other healthcare providers or clinics.',
  law_firm: 'This is a LAW FIRM. Competitors must be other law firms or legal service providers.',
  professional_services: 'This is a PROFESSIONAL SERVICES firm. Competitors must be other firms in the same industry.',
  local_service: 'This is a LOCAL SERVICE business. Competitors must be other local service providers in the same trade.',
};

/**
 * Calls Claude Haiku to identify likely competitors and estimate their AI visibility.
 * Returns [] on any failure (never throws) so callers can degrade gracefully.
 */
export async function inferCompetitors(input: InferCompetitorsInput): Promise<CompetitorEstimate[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];

  const count = Math.max(1, Math.min(10, input.count ?? 2));
  const businessType = input.businessType || 'other';
  const verticalHint = VERTICAL_HINTS[businessType] || 'Pick competitors in the same industry as this business.';

  const prompt = `Based on this website info, identify exactly ${count} likely direct competitors. For each competitor, estimate their AI visibility scores based on your knowledge of their web presence.

Business type: ${businessType}
Domain: ${input.domain}
Homepage heading: "${input.h1 || 'unknown'}"
Meta description: "${input.metaDescription || 'unknown'}"
Page types found: ${(input.pageTypes || []).join(', ')}

${verticalHint}

Return ONLY a JSON array of ${count} objects, each with these fields:
- "domain": the competitor's domain name
- "overall": estimated AI visibility score 0-100
- "crawl": estimated crawlability score 0-100
- "read": estimated machine readability score 0-100
- "commercial": estimated commercial clarity score 0-100
- "trust": estimated trust score 0-100
- "rationale": one sentence explaining why you picked this competitor and how you estimated their scores

Rules:
- Competitors MUST be in the same business category (${businessType})
- Pick real businesses that are actual competitors, not tangentially related companies
- A restaurant's competitors are other restaurants, not retail stores
- Base scores on what you know about their website structure, content quality, and AI readiness
- No markdown, no backticks, just the JSON array`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 800, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) {
      const errorBody = await res.text();
      console.error('inferCompetitors API failed:', { status: res.status, body: errorBody });
      return [];
    }
    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, count).map((c: Record<string, unknown>) => ({
      domain: normalizeDomain(String(c.domain || '')),
      overall: Number(c.overall) || 0,
      crawl: Number(c.crawl) || 0,
      read: Number(c.read) || 0,
      commercial: Number(c.commercial) || 0,
      trust: Number(c.trust) || 0,
      rationale: String(c.rationale || ''),
    })).filter((c: CompetitorEstimate) => c.domain.length > 0);
  } catch (err) {
    console.error('inferCompetitors error:', err instanceof Error ? err.message : err);
    return [];
  }
}
