// NOTE: Run this SQL before deploying:
// ALTER TABLE audits ADD COLUMN IF NOT EXISTS generated_fixes JSONB DEFAULT NULL;

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export const maxDuration = 60;

const ADMIN_EMAILS = ['demo@aivisibility.test', 'mikedaman@gmail.com'];

interface GeneratedFix {
  key: string;
  implementation: string;
  explanation: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { auditId, siteId, domain, vertical, homepageTitle, homepageH1, homepageDescription, businessDescription, recommendations, missingPages, existingPages } = body;

    if (!auditId || !domain) {
      return NextResponse.json({ error: 'auditId and domain are required' }, { status: 400 });
    }

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Admin bypass + entitlement check
    const isAdmin = !!(user.email && ADMIN_EMAILS.includes(user.email));
    if (!isAdmin && siteId) {
      const { data: entitlement } = await supabase
        .from('entitlements')
        .select('can_view_core')
        .eq('user_id', user.id)
        .eq('site_id', siteId)
        .single();
      if (!entitlement?.can_view_core) {
        return NextResponse.json({ error: 'Premium feature — purchase required' }, { status: 403 });
      }
    } else if (!isAdmin) {
      return NextResponse.json({ error: 'Premium feature — purchase required' }, { status: 403 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.log('generate-fixes: no ANTHROPIC_API_KEY');
      return NextResponse.json({ fixes: [] });
    }

    console.log('generate-fixes: starting for', domain, 'audit:', auditId, 'recs:', (recommendations || []).length);

    const recList = (recommendations || []).slice(0, 15).map((r: { title: string; category: string }) => `- [${r.category}] ${r.title}`).join('\n');
    const missingList = (missingPages || []).map((p: string) => `- ${p}`).join('\n');
    const existingList = (existingPages || []).slice(0, 10).map((p: { url: string; title: string; pageType: string }) => `- ${p.url} (${p.pageType}): "${p.title || 'untitled'}"`).join('\n');

    const verticalLabel = vertical || 'business';

    const prompt = `You are a web developer generating ready-to-implement code for a specific business. The business is ${domain}, a ${verticalLabel} business. Here is what we know about them:
- Homepage title: ${homepageTitle || 'unknown'}
- Homepage heading: ${homepageH1 || 'unknown'}
- Homepage description: ${homepageDescription || 'unknown'}
- Business description: ${(businessDescription || '').slice(0, 300)}
- Existing pages:
${existingList || '(none found)'}

For each of the following issues found on their site, generate the EXACT code they should implement. Not templates with placeholders — the actual finished code customized for this specific business. Use their real business name, their real domain (${domain}), their real content where possible.

Issues to fix:
${recList}

${missingList ? `Missing pages they need:\n${missingList}` : ''}

For each issue, return a JSON object with:
- "key": the exact issue title from above (so we can match it back)
- "implementation": the actual code/content to implement (HTML, JSON-LD, meta tags, robots.txt rules, page copy, etc.)
- "explanation": one sentence explaining what this code does and where to put it

Be specific. Use the business's actual name, actual domain, actual content. For meta descriptions, write the real description based on what you know about them. For schema markup, fill in real values. For page copy suggestions, write actual paragraphs.

Return ONLY a JSON array. No markdown, no backticks, no explanation outside the array.`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 4000, messages: [{ role: 'user', content: prompt }] }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        console.error('Generate fixes API error:', { status: res.status, body: errBody });
        return NextResponse.json({ fixes: [] });
      }

      const data = await res.json();
      const rawText = data.content?.[0]?.text || '';
      console.log('generate-fixes: Claude response length:', rawText.length, 'chars, first 200:', rawText.substring(0, 200));

      let fixes: GeneratedFix[] = [];
      try {
        const cleaned = rawText.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) {
          fixes = parsed.map((f: Record<string, unknown>) => ({
            key: String(f.key || ''),
            implementation: String(f.implementation || ''),
            explanation: String(f.explanation || ''),
          }));
          console.log('generate-fixes: parsed', fixes.length, 'fixes. Keys:', fixes.map(f => f.key).join(', '));
        } else {
          console.error('generate-fixes: parsed result is not an array, type:', typeof parsed);
        }
      } catch (parseErr) {
        console.error('generate-fixes: JSON parse failed:', parseErr instanceof Error ? parseErr.message : parseErr, 'raw start:', rawText.substring(0, 300));
      }

      // Save to database
      if (fixes.length > 0) {
        const { error: updateError } = await supabase.from('audits').update({ generated_fixes: fixes }).eq('id', auditId);
        if (updateError) {
          console.error('generate-fixes: DB save failed:', updateError.message, updateError.details, updateError.hint, '— Run: ALTER TABLE audits ADD COLUMN IF NOT EXISTS generated_fixes JSONB DEFAULT NULL');
        } else {
          console.log('generate-fixes: saved', fixes.length, 'fixes to audit', auditId);
        }
      } else {
        console.error('generate-fixes: 0 fixes generated — nothing to save');
      }

      return NextResponse.json({ fixes });
    } catch (fetchErr) {
      console.error('Generate fixes fetch error:', fetchErr instanceof Error ? fetchErr.message : fetchErr);
      return NextResponse.json({ fixes: [] });
    }
  } catch (error) {
    console.error('Generate fixes error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
