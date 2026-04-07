import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export const maxDuration = 60;

interface CompetitorEstimate {
  domain: string;
  overall: number;
  crawl: number;
  read: number;
  commercial: number;
  trust: number;
  rationale: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { domain, vertical, h1, metaDescription, pageTypes, scores, recommendations, siteId } = body;
    if (!domain) return NextResponse.json({ error: 'Domain required' }, { status: 400 });
    const businessType = vertical || 'other';

    // Entitlement check (admin bypass first)
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    const ADMIN_EMAILS = ['demo@aivisibility.test', 'mikedaman@gmail.com'];
    const isAdmin = !!(user?.email && ADMIN_EMAILS.includes(user.email));
    if (!isAdmin) {
      if (user && siteId) {
        const { data: entitlement } = await supabase
          .from('entitlements')
          .select('can_view_growth_strategy')
          .eq('user_id', user.id)
          .eq('site_id', siteId)
          .single();
        if (!entitlement?.can_view_growth_strategy) {
          return NextResponse.json({ error: 'Premium feature — purchase required' }, { status: 403 });
        }
      } else {
        return NextResponse.json({ error: 'Premium feature — purchase required' }, { status: 403 });
      }
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const name = domain.replace(/\.(com|io|co|org|net)$/, '').replace(/^www\./, '');

    // Step 1: Identify competitors + estimate their AI visibility via AI
    let competitorEstimates: CompetitorEstimate[] = [];
    if (apiKey) {
      try {
        const verticalHints: Record<string, string> = {
          restaurant: 'This is a RESTAURANT/food service business. Competitors must be other restaurants, cafes, or food businesses — NOT retail stores or tech companies.',
          saas: 'This is a SOFTWARE/SaaS company. Competitors must be other software companies in the same category.',
          ecommerce: 'This is an E-COMMERCE/retail business. Competitors must be other online retailers in the same product category.',
          healthcare: 'This is a HEALTHCARE business. Competitors must be other healthcare providers or clinics.',
          law_firm: 'This is a LAW FIRM. Competitors must be other law firms or legal service providers.',
          professional_services: 'This is a PROFESSIONAL SERVICES firm. Competitors must be other firms in the same industry.',
          local_service: 'This is a LOCAL SERVICE business. Competitors must be other local service providers in the same trade.',
        };
        const verticalHint = verticalHints[businessType] || 'Pick competitors in the same industry as this business.';

        const compPrompt = `Based on this website info, identify exactly 2 likely direct competitors. For each competitor, estimate their AI visibility scores based on your knowledge of their web presence.

Business type: ${businessType}
Domain: ${domain}
Homepage heading: "${h1 || 'unknown'}"
Meta description: "${metaDescription || 'unknown'}"
Page types found: ${(pageTypes || []).join(', ')}

${verticalHint}

Return ONLY a JSON array of 2 objects, each with these fields:
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

        console.log('Growth strategy: requesting competitor estimates for', domain);
        const compRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 500, messages: [{ role: 'user', content: compPrompt }] }),
        });

        if (!compRes.ok) {
          const errorBody = await compRes.text();
          console.error('Competitor API failed:', { status: compRes.status, body: errorBody });
        } else {
          const compData = await compRes.json();
          const compText = compData.content?.[0]?.text || '';
          console.log('Competitor API raw response:', compText);
          try {
            const cleaned = compText.replace(/```json|```/g, '').trim();
            const parsed = JSON.parse(cleaned);
            if (Array.isArray(parsed)) {
              competitorEstimates = parsed.slice(0, 2).map((c: Record<string, unknown>) => ({
                domain: String(c.domain || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, ''),
                overall: Number(c.overall) || 0,
                crawl: Number(c.crawl) || 0,
                read: Number(c.read) || 0,
                commercial: Number(c.commercial) || 0,
                trust: Number(c.trust) || 0,
                rationale: String(c.rationale || ''),
              }));
              console.log('Parsed competitor estimates:', competitorEstimates.map(c => c.domain));
            } else {
              console.error('Competitor response not an array:', typeof parsed);
            }
          } catch (parseErr) {
            console.error('Failed to parse competitor response:', { text: compText.substring(0, 300), error: parseErr instanceof Error ? parseErr.message : parseErr });
          }
        }
      } catch (fetchErr) {
        console.error('Competitor fetch error:', fetchErr instanceof Error ? fetchErr.message : fetchErr);
      }
    }

    // Step 2: Generate marketing strategy via AI
    let marketingStrategy = null;
    if (apiKey) {
      try {
        const highRecs = (recommendations || []).filter((r: { severity: string }) => r.severity === 'high').slice(0, 5);
        const compContext = competitorEstimates.length > 0
          ? `Competitors (AI-estimated): ${competitorEstimates.map(c => `${c.domain} (${c.overall}/100)`).join(', ')}`
          : '';

        const stratPrompt = `You are an AI visibility marketing strategist. Based on this scan data, generate a marketing strategy.

Site: ${domain}
Homepage: "${h1 || 'unknown'}"
Description: "${metaDescription || 'unknown'}"
Overall grade: ${scores?.overall || 'unknown'}/100
Scores: Crawl ${scores?.crawl || '?'}, Read ${scores?.read || '?'}, Commercial ${scores?.commercial || '?'}, Trust ${scores?.trust || '?'}
Page types found: ${(pageTypes || []).join(', ')}
Top issues: ${highRecs.map((r: { title: string }) => r.title).join('; ')}
${compContext}

Return ONLY a JSON object with these fields:
{
  "queries": [5 specific queries people would type into ChatGPT/Perplexity about this type of product — make them realistic buyer queries],
  "pages_to_create": [3-4 specific pages they should create, each with "title" and "why" fields],
  "content_to_optimize": [2-3 existing page improvements, each with "page" and "action" fields],
  "schema_actions": [2 specific schema/structured data actions, each with "action" and "impact" fields],
  "trust_actions": [2-3 trust-building actions, each with "action" and "impact" fields]
}

Make queries specific to their business category. Make recommendations actionable and specific.
No markdown, no backticks, just the JSON.`;

        console.log('Growth strategy: requesting marketing strategy for', domain);
        const stratRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1000, messages: [{ role: 'user', content: stratPrompt }] }),
        });
        if (!stratRes.ok) {
          const errorBody = await stratRes.text();
          console.error('Strategy API failed:', { status: stratRes.status, body: errorBody });
        } else {
          const stratData = await stratRes.json();
          const stratText = stratData.content?.[0]?.text || '';
          try {
            marketingStrategy = JSON.parse(stratText.replace(/```json|```/g, '').trim());
          } catch (parseErr) {
            console.error('Failed to parse strategy response:', { text: stratText.substring(0, 200), error: parseErr instanceof Error ? parseErr.message : parseErr });
          }
        }
      } catch (fetchErr) {
        console.error('Strategy fetch error:', fetchErr instanceof Error ? fetchErr.message : fetchErr);
      }
    }

    // Fallback marketing strategy if API unavailable
    if (!marketingStrategy) {
      marketingStrategy = {
        queries: [
          `What is the best ${h1?.toLowerCase().includes('project') ? 'project management' : h1?.toLowerCase().includes('analytic') ? 'analytics' : 'software'} tool?`,
          `${name} review — is it worth it?`,
          `${name} vs alternatives`,
          `How to ${h1?.toLowerCase().includes('manage') ? 'manage projects' : 'solve problems'} with AI tools`,
          `Best tools for ${h1?.toLowerCase().includes('team') ? 'team collaboration' : 'small businesses'} in 2025`,
        ],
        pages_to_create: (pageTypes || []).includes('comparison') ? [] : [
          { title: `${name} vs [Top Competitor] — Comparison`, why: 'Captures AI-driven comparison queries' },
          { title: `How ${name} Works — Getting Started Guide`, why: 'Helps AI answer "how do I use this?" questions' },
          { title: `${name} for [Industry/Use Case]`, why: 'Targets specific audience segments in AI queries' },
        ],
        content_to_optimize: [
          { page: 'Homepage', action: 'Add a clear first paragraph explaining what you do, for whom, and the key benefit' },
          { page: 'Product page', action: 'Add specific feature descriptions with use cases, not just feature names' },
        ],
        schema_actions: [
          { action: 'Add FAQ schema to homepage with 5 common buyer questions', impact: 'Enables AI to directly answer questions from your content' },
          { action: 'Add Organization schema with sameAs links to social profiles', impact: 'Helps AI verify your identity across platforms' },
        ],
        trust_actions: [
          { action: 'Get listed on G2 and Capterra with at least 10 reviews', impact: 'AI systems reference third-party review data heavily' },
          { action: 'Add 3-5 customer case studies with specific metrics', impact: 'Gives AI concrete evidence to cite when recommending you' },
        ],
      };
    }

    return NextResponse.json({
      competitors: competitorEstimates,
      yourScores: scores || { overall: 0, crawl: 0, read: 0, commercial: 0, trust: 0 },
      marketingStrategy,
    });
  } catch (error) {
    console.error('Growth strategy error:', error);
    return NextResponse.json({ error: 'Failed to generate growth strategy' }, { status: 500 });
  }
}
