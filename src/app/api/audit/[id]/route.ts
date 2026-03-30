import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabase();

    const { data: audit, error: auditError } = await supabase
      .from('audits')
      .select('*, site:sites(*)')
      .eq('id', id)
      .single();

    if (auditError || !audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }

    const { data: pages } = await supabase
      .from('audit_pages')
      .select('*')
      .eq('audit_id', id)
      .order('page_type');

    const { data: findings } = await supabase
      .from('audit_findings')
      .select('*')
      .eq('audit_id', id)
      .order('severity');

    const { data: recommendations } = await supabase
      .from('audit_recommendations')
      .select('*')
      .eq('audit_id', id)
      .order('priority_order');

    const crawlerStatuses = buildCrawlerStatusesFromFindings(findings || [], recommendations || []);
    const keyPagesStatus = buildKeyPagesFromPages(pages || []);
    const pagePreviews = (pages || []).map((p: Record<string, unknown>) => ({
      url: p.url,
      title: p.title || '(no title)',
      metaDescription: p.meta_description || '(no meta description)',
      h1: p.h1_text || '(no H1)',
      schemaTypes: (p.schema_types as string[]) || [],
      wordCount: p.word_count,
      hasSchema: p.has_schema,
    }));

    return NextResponse.json({
      audit,
      pages: pages || [],
      findings: findings || [],
      recommendations: recommendations || [],
      crawlerStatuses,
      keyPagesStatus,
      pagePreviews,
    });
  } catch (error) {
    console.error('Fetch audit error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function buildCrawlerStatusesFromFindings(findings: Record<string, unknown>[], recommendations: Record<string, unknown>[]) {
  const crawlers = [
    { name: 'GPTBot', displayName: 'GPTBot (OpenAI)' },
    { name: 'ChatGPT-User', displayName: 'ChatGPT User' },
    { name: 'Google-Extended', displayName: 'Google AI (Gemini)' },
    { name: 'ClaudeBot', displayName: 'ClaudeBot (Anthropic)' },
    { name: 'PerplexityBot', displayName: 'PerplexityBot' },
    { name: 'Amazonbot', displayName: 'Amazonbot' },
    { name: 'Meta-ExternalAgent', displayName: 'Meta AI' },
    { name: 'CCBot', displayName: 'CCBot (Common Crawl)' },
  ];

  const allItems = [...findings, ...recommendations];
  const blockFinding = allItems.find((f) =>
    (f.title as string)?.includes('blocked') || (f.title as string)?.includes('AI crawlers are blocked')
  );
  const blockedNames = blockFinding
    ? (blockFinding.title as string).replace(/.*blocked:\s*/, '').split(',').map((s: string) => s.trim().toLowerCase())
    : [];
  const noRobots = allItems.some((f) => (f.title as string)?.includes('Add a robots.txt'));

  return crawlers.map((c) => {
    if (noRobots) return { ...c, status: 'no_rule' };
    if (blockedNames.some((b: string) => c.name.toLowerCase().includes(b) || b.includes(c.name.toLowerCase()))) {
      return { ...c, status: 'blocked' };
    }
    if (!blockFinding) return { ...c, status: 'allowed' };
    return { ...c, status: 'no_rule' };
  });
}

function buildKeyPagesFromPages(pages: Record<string, unknown>[]) {
  const keyTypes = [
    { type: 'homepage', label: 'Homepage' },
    { type: 'pricing', label: 'Pricing Page' },
    { type: 'product', label: 'Product / Features' },
    { type: 'contact', label: 'Contact Page' },
    { type: 'demo', label: 'Demo / Trial' },
    { type: 'docs', label: 'Documentation' },
    { type: 'blog', label: 'Blog / Content' },
    { type: 'about', label: 'About / Team' },
    { type: 'security', label: 'Security / Compliance' },
    { type: 'privacy', label: 'Privacy Policy' },
    { type: 'comparison', label: 'Comparison Pages' },
    { type: 'integrations', label: 'Integrations' },
  ];
  return keyTypes.map((kt) => {
    const found = pages.find((p) => p.page_type === kt.type);
    return { type: kt.type, label: kt.label, found: !!found, url: (found?.url as string) || null };
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { userId } = await request.json();
    const supabase = await createServerSupabase();
    await supabase.from('audits').update({ user_id: userId }).eq('id', id).is('user_id', null);
    const { data: audit } = await supabase.from('audits').select('site_id').eq('id', id).single();
    if (audit) { await supabase.from('sites').update({ user_id: userId }).eq('id', audit.site_id).is('user_id', null); }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Claim audit error:', error);
    return NextResponse.json({ error: 'Failed to claim audit' }, { status: 500 });
  }
}
