import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { domain, homepageH1, homepageDescription, pageTypes, hasSchema, hasPricing, hasComparison, industryHints } = await request.json();

    if (!domain) {
      return NextResponse.json({ error: 'Domain required' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // No API key — return fallback dynamic questions based on scan data
      return NextResponse.json({ questions: generateFallbackQuestions(domain, homepageH1, pageTypes) });
    }

    const siteContext = [
      `Domain: ${domain}`,
      homepageH1 ? `Homepage heading: "${homepageH1}"` : '',
      homepageDescription ? `Homepage meta description: "${homepageDescription}"` : '',
      `Page types found: ${(pageTypes || []).join(', ')}`,
      hasSchema ? 'Has structured data' : 'No structured data',
      hasPricing ? 'Has pricing page' : 'No pricing page',
      hasComparison ? 'Has comparison content' : 'No comparison content',
      industryHints ? `Industry hints: ${industryHints}` : '',
    ].filter(Boolean).join('\n');

    const prompt = `You are helping analyze a website's AI visibility. Based on this site context, generate exactly 3 specific questions that a potential buyer or user would likely ask an AI assistant (like ChatGPT, Perplexity, or Claude) about this specific type of product or business.

Site context:
${siteContext}

Rules:
- Questions should be specific to what this company appears to do, not generic
- Questions should reflect what real buyers ask AI assistants
- Include one question about the company's category/space (e.g., "What are the best [category] tools?")
- Include one question about a specific capability or use case
- Include one question related to current industry trends or buyer concerns for this type of product
- Each question should feel like something typed into ChatGPT or Perplexity
- Do NOT include questions about pricing, contact, trust, or comparisons — those are covered separately

Respond ONLY with a JSON array of exactly 3 objects, each with:
- "question": the question text
- "intent": one of "discovery", "evaluation", "use_case"  
- "what_ai_needs": a brief explanation of what content the site needs for AI to answer this well

No markdown, no backticks, just the JSON array.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error('Anthropic API error:', await response.text());
      return NextResponse.json({ questions: generateFallbackQuestions(domain, homepageH1, pageTypes) });
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || '';

    try {
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
      if (Array.isArray(parsed) && parsed.length > 0) {
        return NextResponse.json({ questions: parsed.slice(0, 3), source: 'ai_generated' });
      }
    } catch {
      console.error('Failed to parse AI response:', text);
    }

    return NextResponse.json({ questions: generateFallbackQuestions(domain, homepageH1, pageTypes) });
  } catch (error) {
    console.error('AI perception error:', error);
    return NextResponse.json({ questions: [], error: true });
  }
}

function generateFallbackQuestions(domain: string, h1: string | null, pageTypes: string[]) {
  const name = domain.replace(/\.(com|io|co|org|net)$/, '').replace(/^www\./, '');
  const questions = [];

  // Try to infer category from H1
  const h1Lower = (h1 || '').toLowerCase();
  if (h1Lower.includes('project') || h1Lower.includes('manage')) {
    questions.push({ question: `What are the best project management tools for small teams?`, intent: 'discovery', what_ai_needs: 'Clear product description, feature list, and target audience on the homepage and product pages' });
  } else if (h1Lower.includes('analytic') || h1Lower.includes('data')) {
    questions.push({ question: `What analytics platforms work best for growing startups?`, intent: 'discovery', what_ai_needs: 'Clear positioning as an analytics tool with specific use cases and differentiators' });
  } else if (h1Lower.includes('market') || h1Lower.includes('email') || h1Lower.includes('campaign')) {
    questions.push({ question: `What are the best email marketing tools with automation?`, intent: 'discovery', what_ai_needs: 'Feature pages covering automation capabilities, integration list, and pricing tiers' });
  } else {
    questions.push({ question: `What does ${name} do and is it worth trying?`, intent: 'discovery', what_ai_needs: 'A clear homepage description, social proof, and a visible free trial or demo path' });
  }

  if (pageTypes.includes('docs') || pageTypes.includes('blog')) {
    questions.push({ question: `How do I get started with ${name}?`, intent: 'use_case', what_ai_needs: 'Getting started documentation, onboarding guides, or tutorial blog posts that AI can reference' });
  } else {
    questions.push({ question: `What features does ${name} have?`, intent: 'evaluation', what_ai_needs: 'A dedicated features or product page with specific, detailed feature descriptions' });
  }

  questions.push({ question: `Is ${name} good for enterprise use?`, intent: 'evaluation', what_ai_needs: 'Security/compliance page, enterprise plan details, customer logos from recognizable companies' });

  return questions;
}
