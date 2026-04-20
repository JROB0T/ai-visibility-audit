import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { isAdminAccount } from '@/lib/entitlements';
import { inferCompetitors, type CompetitorEstimate } from '@/lib/competitorInference';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { domain, vertical, h1, metaDescription, pageTypes, scores, recommendations, siteId } = body;
    if (!domain) return NextResponse.json({ error: 'Domain required' }, { status: 400 });
    const businessType = vertical || 'other';

    // Entitlement check (admin bypass first)
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    const isAdmin = isAdminAccount(user?.email);
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
    const competitorEstimates: CompetitorEstimate[] = await inferCompetitors({
      domain,
      businessType,
      h1,
      metaDescription,
      pageTypes,
      count: 2,
    });

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
