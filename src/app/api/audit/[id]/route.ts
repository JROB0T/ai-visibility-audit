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

    // Build crawler statuses from the audit data
    // We reconstruct this from pages and findings since we don't store it separately
    const crawlerStatuses = buildCrawlerStatusesFromFindings(findings || []);

    // Build key pages status from scanned pages
    const keyPagesStatus = buildKeyPagesFromPages(pages || []);

    // Build raw HTML previews from page data
    const pagePreview = (pages || []).map((p: Record<string, unknown>) => ({
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
      pagePreviews: pagePreview,
    });
  } catch (error) {
    console.error('Fetch audit error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function buildCrawlerStatusesFromFindings(findings: Record<string, unknown>[]) {
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

  // Check if there's a finding about blocked crawlers
  const blockFinding = findings.find((f) =>
    (f.title as string)?.includes('blocked') || (f.title as string)?.includes('AI crawlers are blocked')
  );

  const blockedNames = blockFinding
    ? (blockFinding.title as string).replace(/.*blocked:\s*/, '').split(',').map((s: string) => s.trim().toLowerCase())
    : [];

  const noRobots = findings.some((f) => (f.title as string)?.includes('robots.txt'));

  return crawlers.map((c) => {
    if (noRobots && (blockFinding?.title as string)?.includes('robots.txt')) {
      return { ...c, status: 'no_rule' };
    }
    if (blockedNames.some((b: string) => c.name.toLowerCase().includes(b) || b.includes(c.name.toLowerCase()))) {
      return { ...c, status: 'blocked' };
    }
    // If no block finding exists and robots.txt exists, assume allowed
    if (!blockFinding && !noRobots) {
      return { ...c, status: 'allowed' };
    }
    return { ...c, status: 'no_rule' };
  });
}

function buildKeyPagesFromPages(pages: Record<string, unknown>[]) {
  const keyTypes = [
    { type: 'homepage', label: 'Homepage' },
    { type: 'pricing', label: 'Pricing Page' },
    { type: 'product', label: 'Product / Features Page' },
    { type: 'contact', label: 'Contact Page' },
    { type: 'demo', label: 'Demo / Trial Page' },
    { type: 'docs', label: 'Documentation' },
    { type: 'blog', label: 'Blog / Resources' },
  ];

  return keyTypes.map((kt) => {
    const found = pages.find((p) => p.page_type === kt.type);
    return {
      type: kt.type,
      label: kt.label,
      found: !!found,
      url: (found?.url as string) || null,
    };
  });
}

// Claim an anonymous audit after user signs up
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { userId } = await request.json();
    const supabase = await createServerSupabase();

    await supabase
      .from('audits')
      .update({ user_id: userId })
      .eq('id', id)
      .is('user_id', null);

    const { data: audit } = await supabase
      .from('audits')
      .select('site_id')
      .eq('id', id)
      .single();

    if (audit) {
      await supabase
        .from('sites')
        .update({ user_id: userId })
        .eq('id', audit.site_id)
        .is('user_id', null);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Claim audit error:', error);
    return NextResponse.json({ error: 'Failed to claim audit' }, { status: 500 });
  }
}
