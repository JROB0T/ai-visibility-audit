import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export const maxDuration = 120; // Fix generation can take a while

const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabase();

    // Check auth — fix packages require authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Sign in to generate a fix package' },
        { status: 401 }
      );
    }

    // Check if fix package already exists for this audit
    const { data: existing } = await supabase
      .from('fix_packages')
      .select('*')
      .eq('audit_id', id)
      .eq('status', 'completed')
      .single();

    if (existing) {
      return NextResponse.json({ fixPackage: existing });
    }

    // Fetch audit data
    const { data: audit, error: auditError } = await supabase
      .from('audits')
      .select('*, site:sites(*)')
      .eq('id', id)
      .single();

    if (auditError || !audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }

    // Fetch pages, findings, recommendations
    const [{ data: pages }, { data: findings }, { data: recommendations }] = await Promise.all([
      supabase.from('audit_pages').select('*').eq('audit_id', id),
      supabase.from('audit_findings').select('*').eq('audit_id', id),
      supabase.from('audit_recommendations').select('*').eq('audit_id', id).order('priority_order'),
    ]);

    // Create pending record
    const { data: fixRecord, error: createError } = await supabase
      .from('fix_packages')
      .insert({
        audit_id: id,
        user_id: user.id,
        status: 'generating',
      })
      .select()
      .single();

    if (createError) {
      console.error('Fix package creation error:', createError);
      return NextResponse.json({ error: 'Failed to create fix package record' }, { status: 500 });
    }

    // Build context from real audit data
    const domain = audit.site?.domain || 'unknown';
    const siteUrl = audit.site?.url || '';
    const pageList = (pages || []).map((p: { url: string; page_type: string; title: string | null; has_schema: boolean; issues: string[]; word_count: number | null }) =>
      `- ${p.url} (${p.page_type}) title="${p.title || 'MISSING'}" schema=${p.has_schema} issues=[${p.issues.join('; ')}] words=${p.word_count || 0}`
    ).join('\n');
    const findingsList = (findings || []).map((f: { category: string; severity: string; title: string; description: string }) =>
      `- [${f.severity.toUpperCase()}] ${f.category}: ${f.title} — ${f.description}`
    ).join('\n');
    const recsList = (recommendations || []).map((r: { category: string; severity: string; title: string; recommended_fix: string }) =>
      `- [${r.severity}] ${r.category}: ${r.title} → Fix: ${r.recommended_fix}`
    ).join('\n');

    const prompt = `You are a GEO (Generative Engine Optimization) remediation expert. Given REAL audit data from an actual site scan, generate a complete, ready-to-implement fix package.

AUDIT DATA:
Domain: ${domain}
URL: ${siteUrl}
Overall Score: ${audit.overall_score}/100
Crawlability: ${audit.crawlability_score}/100
Machine Readability: ${audit.machine_readability_score}/100
Commercial Clarity: ${audit.commercial_clarity_score}/100
Trust & Authority: ${audit.trust_clarity_score}/100
Pages Scanned: ${audit.pages_scanned}
Summary: ${audit.summary}

PAGES SCANNED:
${pageList}

FINDINGS:
${findingsList}

RECOMMENDATIONS:
${recsList}

Generate a complete fix package. Return ONLY valid JSON (no markdown, no backticks, no preamble):

{
  "contentRewrites": [
    {
      "page": "<specific page from scan, e.g. Homepage, Pricing, etc>",
      "targetUrl": "<actual URL from the scan>",
      "problem": "<specific problem found in the audit for this page>",
      "rewrite": "<full 150-200 word AI-optimized content block with Q&A headers, semantic structure, and clear claims. Must reference the actual business name and services.>",
      "impact": "<1 sentence: why this rewrite improves AI visibility>"
    }
  ],
  "schemaMarkup": [
    {
      "type": "Organization",
      "targetUrl": "<homepage URL>",
      "purpose": "<why this schema is needed based on audit findings>",
      "code": "<complete JSON-LD script tag using the REAL business name, URL, and domain>"
    },
    {
      "type": "FAQPage",
      "targetUrl": "<best page for FAQs>",
      "purpose": "<why needed>",
      "code": "<complete JSON-LD with 4-5 FAQs specific to this business's industry and services>"
    },
    {
      "type": "<third relevant schema type based on their industry>",
      "targetUrl": "<relevant page>",
      "purpose": "<why needed>",
      "code": "<complete JSON-LD>"
    }
  ],
  "robotsTxt": {
    "currentIssue": "<what the audit found wrong with robots.txt, or 'No robots.txt found'>",
    "fixedContent": "<complete corrected robots.txt that allows GPTBot, ClaudeBot, Anthropic-ai, PerplexityBot, Google-Extended, with sitemap reference>"
  },
  "metaTags": [
    {
      "page": "<page name>",
      "targetUrl": "<actual URL>",
      "currentTitle": "<current title from scan or 'MISSING'>",
      "newTitle": "<optimized title under 60 chars>",
      "currentDescription": "<current meta desc from scan or 'MISSING'>",
      "newDescription": "<optimized description under 155 chars, written as a direct answer>"
    }
  ],
  "citationPlan": [
    {
      "platform": "<specific platform relevant to their industry>",
      "action": "<specific, actionable step>",
      "priority": "high|medium|low",
      "timeframe": "<estimated time to complete>",
      "expectedImpact": "<what this achieves>"
    }
  ],
  "autoFixScripts": {
    "gtmSchemaSnippet": "<complete Google Tag Manager Custom HTML tag that injects Organization and FAQ schema on page load — must use their real business name and URL>",
    "wpFunctionsSnippet": "<complete WordPress functions.php snippet using wp_head hook to add all schema markup — must use their real business name and URL>",
    "metaTagHtml": "<complete HTML head block with all optimized meta tags for their key pages>"
  },
  "actionPlan": [
    {"week": "Week 1", "tasks": [{"task": "<task>", "effort": "low|medium|high", "impact": "high|medium|low", "details": "<1-2 sentence how-to>"}]},
    {"week": "Week 2", "tasks": [{"task": "<task>", "effort": "low|medium|high", "impact": "high|medium|low", "details": "<how-to>"}]},
    {"week": "Week 3-4", "tasks": [{"task": "<task>", "effort": "medium|high", "impact": "high|medium", "details": "<how-to>"}]},
    {"week": "Month 2+", "tasks": [{"task": "<task>", "effort": "medium|high", "impact": "high|medium", "details": "<how-to>"}]}
  ]
}

CRITICAL: Use the REAL business name (${domain}), REAL URLs from the scan, and reference REAL issues found. Do not use placeholder text. Generate 3 content rewrites, 3 schema blocks, 4-5 meta tag rewrites, 5-6 citation actions, and 2-3 tasks per week in the action plan. All schema JSON-LD must be valid and use the actual domain.`;

    // Call Claude API
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      await supabase.from('fix_packages').update({ status: 'failed' }).eq('id', fixRecord.id);
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error('Claude API error:', errText);
      await supabase.from('fix_packages').update({ status: 'failed' }).eq('id', fixRecord.id);
      return NextResponse.json({ error: 'Fix generation failed' }, { status: 500 });
    }

    const claudeData = await claudeRes.json();
    const text = claudeData.content
      .map((c: { type: string; text?: string }) => (c.type === 'text' ? c.text : ''))
      .join('');
    const cleaned = text.replace(/```json|```/g, '').trim();

    let fixData;
    try {
      fixData = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr);
      await supabase.from('fix_packages').update({ status: 'failed' }).eq('id', fixRecord.id);
      return NextResponse.json({ error: 'Failed to parse fix package' }, { status: 500 });
    }

    // Save to Supabase
    const { error: updateError } = await supabase
      .from('fix_packages')
      .update({
        status: 'completed',
        content_rewrites: fixData.contentRewrites || [],
        schema_markup: fixData.schemaMarkup || [],
        robots_txt: fixData.robotsTxt || {},
        meta_tags: fixData.metaTags || [],
        citation_plan: fixData.citationPlan || [],
        auto_fix_scripts: fixData.autoFixScripts || {},
        action_plan: fixData.actionPlan || [],
        completed_at: new Date().toISOString(),
      })
      .eq('id', fixRecord.id);

    if (updateError) {
      console.error('Fix package save error:', updateError);
    }

    // Return the complete fix package
    const { data: savedPackage } = await supabase
      .from('fix_packages')
      .select('*')
      .eq('id', fixRecord.id)
      .single();

    return NextResponse.json({ fixPackage: savedPackage });
  } catch (error) {
    console.error('Fix package API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET — retrieve existing fix package for an audit
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabase();

    const { data: fixPackage } = await supabase
      .from('fix_packages')
      .select('*')
      .eq('audit_id', id)
      .eq('status', 'completed')
      .single();

    if (!fixPackage) {
      return NextResponse.json({ fixPackage: null });
    }

    return NextResponse.json({ fixPackage });
  } catch (error) {
    console.error('Get fix package error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
