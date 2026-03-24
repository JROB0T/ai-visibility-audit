import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { domain, siteName } = await request.json();

    if (!domain) {
      return NextResponse.json({ error: 'Domain required' }, { status: 400 });
    }

    const prompt = `I'm going to ask you about a company/product. Please answer honestly based on what you know. If you don't know much about them, say so clearly.

What is ${siteName || domain}? What do they do? Would you recommend their product to someone looking for a solution in their category? What are their main strengths and weaknesses based on what you know?

Be concise — 3-4 sentences max. If you have very limited knowledge about this company, say "I have limited information about ${domain}" and explain what you can gather from the domain name alone.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', errText);
      return NextResponse.json({ 
        perception: `We couldn't check AI perception for ${domain} at this time. This feature requires an API key to be configured.`,
        error: true 
      });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || 'No response received.';

    return NextResponse.json({ perception: text, error: false });
  } catch (error) {
    console.error('AI perception error:', error);
    return NextResponse.json({ 
      perception: 'AI perception check is currently unavailable.',
      error: true 
    });
  }
}
