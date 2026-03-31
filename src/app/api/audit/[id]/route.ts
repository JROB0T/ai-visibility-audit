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
  const CRAWLERS = [
    { name: 'GPTBot', displayName: 'GPTBot', operator: 'OpenAI', visibilityValue: 'search_citation', visibilityLabel: 'Search & Citation', description: 'OpenAI\'s web crawler that indexes content for ChatGPT and other OpenAI products.', focuses: ['structured_data', 'clear_content', 'product_pages'] },
    { name: 'ChatGPT-User', displayName: 'ChatGPT User', operator: 'OpenAI', visibilityValue: 'assistant_browsing', visibilityLabel: 'Assistant Browsing', description: 'Fetches pages in real-time when ChatGPT users browse the web.', focuses: ['fast_loading', 'clear_content', 'pricing'] },
    { name: 'Google-Extended', displayName: 'Google AI', operator: 'Google', visibilityValue: 'search_citation', visibilityLabel: 'Search & Citation', description: 'Google\'s crawler for AI products including Gemini.', focuses: ['structured_data', 'schema', 'open_graph'] },
    { name: 'ClaudeBot', displayName: 'ClaudeBot', operator: 'Anthropic', visibilityValue: 'search_citation', visibilityLabel: 'Search & Citation', description: 'Anthropic\'s web crawler used to help Claude access and reference web content.', focuses: ['clear_content', 'trust_signals'] },
    { name: 'PerplexityBot', displayName: 'PerplexityBot', operator: 'Perplexity AI', visibilityValue: 'search_citation', visibilityLabel: 'Search & Citation', description: 'Perplexity\'s crawler for its AI search engine. Directly cites sources in answers.', focuses: ['clear_content', 'pricing', 'comparison'] },
    { name: 'Anthropic', displayName: 'Anthropic', operator: 'Anthropic', visibilityValue: 'training_corpus', visibilityLabel: 'Training & Corpus', description: 'Anthropic\'s general crawler for building Claude\'s capabilities.', focuses: ['clear_content', 'trust_signals'] },
    { name: 'CCBot', displayName: 'CCBot', operator: 'Common Crawl', visibilityValue: 'training_corpus', visibilityLabel: 'Training & Corpus', description: 'Common Crawl\'s web crawler that builds a free, open web archive used by many AI companies.', focuses: ['clear_content'] },
    { name: 'Amazonbot', displayName: 'Amazonbot', operator: 'Amazon', visibilityValue: 'assistant_browsing', visibilityLabel: 'Assistant Browsing', description: 'Amazon\'s crawler for Alexa AI and product recommendation systems.', focuses: ['product_pages', 'pricing'] },
    { name: 'Meta-ExternalAgent', displayName: 'Meta AI', operator: 'Meta', visibilityValue: 'search_citation', visibilityLabel: 'Search & Citation', description: 'Meta\'s crawler for AI products including Meta AI assistant.', focuses: ['open_graph', 'social_signals'] },
    { name: 'Bytespider', displayName: 'Bytespider', operator: 'ByteDance', visibilityValue: 'unknown', visibilityLabel: 'Unknown', description: 'ByteDance\'s web crawler for various AI features.', focuses: ['clear_content'] },
  ];

  const allItems = [...findings, ...recommendations];
  const blockFinding = allItems.find((f) => (f.title as string)?.includes('blocked') || (f.title as string)?.includes('AI crawlers are blocked'));
  const blockedNames = blockFinding ? (blockFinding.title as string).replace(/.*blocked:\s*/, '').split(',').map((s: string) => s.trim().toLowerCase()) : [];
  const noRobots = allItems.some((f) => (f.title as string)?.includes('Add a robots.txt'));

  const findingTitles = findings.map(f => (f.title as string) || '');

  return CRAWLERS.map((meta) => {
    let status: string = 'no_rule';
    let statusBasis = 'default';
    let statusDetail = 'No specific rule found — allowed by default';

    if (noRobots) {
      statusDetail = 'No robots.txt found — all crawlers allowed by default';
    } else if (blockedNames.some((b: string) => meta.name.toLowerCase().includes(b) || b.includes(meta.name.toLowerCase()))) {
      status = 'blocked'; statusBasis = 'explicit_rule';
      statusDetail = `Blocked via robots.txt rule for ${meta.name}`;
    } else if (!blockFinding) {
      status = 'allowed'; statusBasis = 'default';
      statusDetail = 'No blocking rules found — allowed by default';
    }

    // Map findings to barriers for this source
    const barriers: string[] = [];
    const sourceRecs: string[] = [];
    if (status === 'blocked') { barriers.push('Crawler is blocked by robots.txt'); sourceRecs.push(`Allow ${meta.name} in your robots.txt`); }

    for (const focus of meta.focuses) {
      if (focus === 'structured_data' && findingTitles.some(t => t.includes('structured data'))) { barriers.push('Missing structured data'); sourceRecs.push('Add JSON-LD schema to key pages'); }
      if (focus === 'open_graph' && findingTitles.some(t => t.includes('Open Graph'))) { barriers.push('Missing Open Graph tags'); sourceRecs.push('Add og:title, og:description, og:image'); }
      if (focus === 'pricing' && findingTitles.some(t => t.includes('pricing'))) { barriers.push('No pricing page found'); sourceRecs.push('Create a pricing page with clear plans'); }
      if (focus === 'product_pages' && findingTitles.some(t => t.includes('product'))) { barriers.push('No product pages found'); sourceRecs.push('Create product/feature pages'); }
      if (focus === 'trust_signals' && findingTitles.some(t => t.includes('social') || t.includes('review') || t.includes('customer'))) { barriers.push('Weak trust signals'); sourceRecs.push('Add customer logos and review platform links'); }
      if (focus === 'clear_content' && findingTitles.some(t => t.includes('thin content'))) { barriers.push('Thin content on some pages'); }
      if (focus === 'comparison' && findingTitles.some(t => t.includes('comparison'))) { barriers.push('No comparison content'); sourceRecs.push('Create comparison pages for competitors'); }
    }

    // Compute readiness from barrier count
    let readinessScore = 100;
    if (status === 'blocked') readinessScore -= 40;
    readinessScore -= barriers.length * 8;
    readinessScore = Math.max(status === 'blocked' ? 10 : 25, Math.min(100, readinessScore));

    return {
      name: meta.name, displayName: meta.displayName, operator: meta.operator,
      status, statusBasis, statusDetail,
      visibilityValue: meta.visibilityValue, visibilityLabel: meta.visibilityLabel,
      description: meta.description,
      readinessScore,
      barriers: Array.from(new Set(barriers)).slice(0, 6),
      recommendations: Array.from(new Set(sourceRecs)).slice(0, 4),
      confidenceLevel: 'observed',
    };
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
