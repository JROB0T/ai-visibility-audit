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

    // Fetch previous audit data for delta comparison
    let previousAudit = null;
    if (audit.previous_audit_id) {
      const { data: prevAuditData } = await supabase
        .from('audits')
        .select('id, overall_score, crawlability_score, machine_readability_score, commercial_clarity_score, trust_clarity_score')
        .eq('id', audit.previous_audit_id)
        .single();

      if (prevAuditData) {
        const { data: prevFindings } = await supabase
          .from('audit_findings')
          .select('id, category, severity, title, description, affected_urls')
          .eq('audit_id', prevAuditData.id);

        const { data: prevPages } = await supabase
          .from('audit_pages')
          .select('url')
          .eq('audit_id', prevAuditData.id);

        previousAudit = {
          ...prevAuditData,
          findings: prevFindings || [],
          pages: prevPages || [],
        };
      }
    }

    // Check entitlements for this user + site
    const { data: { user } } = await supabase.auth.getUser();
    const ADMIN_EMAILS = ['demo@aivisibility.test', 'mikedaman@gmail.com'];
    const isAdmin = !!(user?.email && ADMIN_EMAILS.includes(user.email));
    let hasEntitlement = isAdmin;
    if (!hasEntitlement && user && audit.site_id) {
      const { data: entitlement } = await supabase
        .from('entitlements')
        .select('can_view_core')
        .eq('user_id', user.id)
        .eq('site_id', audit.site_id)
        .single();
      hasEntitlement = !!entitlement?.can_view_core;
    }

    if (hasEntitlement) {
      return NextResponse.json({
        audit,
        pages: pages || [],
        findings: findings || [],
        recommendations: recommendations || [],
        crawlerStatuses,
        keyPagesStatus,
        pagePreviews,
        perceptionData: audit.perception_data || null,
        growthData: audit.growth_data || null,
        previousAudit,
        hasEntitlement: true,
      });
    }

    // Free tier: limited response — enough to hook, not enough to act
    const limitedRecs = (recommendations || []).slice(0, 3);
    return NextResponse.json({
      audit,
      pages: [],
      findings: findings || [],
      recommendations: limitedRecs,
      totalRecommendationCount: (recommendations || []).length,
      crawlerStatuses,
      keyPagesStatus,
      pagePreviews: [],
      perceptionData: null,
      growthData: null,
      previousAudit: null,
      hasEntitlement: false,
    });
  } catch (error) {
    console.error('Fetch audit error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const supabase = await createServerSupabase();

    const updateData: Record<string, unknown> = {};
    if (body.userId) updateData.user_id = body.userId;
    if ('perceptionData' in body) updateData.perception_data = body.perceptionData;
    if ('growthData' in body) updateData.growth_data = body.growthData;

    if (Object.keys(updateData).length > 0) {
      await supabase.from('audits').update(updateData).eq('id', id);
    }

    // Also claim the site if userId is being set
    if (body.userId) {
      const { data: audit } = await supabase.from('audits').select('site_id').eq('id', id).single();
      if (audit) { await supabase.from('sites').update({ user_id: body.userId }).eq('id', audit.site_id).is('user_id', null); }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Patch audit error:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

function buildCrawlerStatusesFromFindings(findings: Record<string, unknown>[], recommendations: Record<string, unknown>[]) {
  const CRAWLERS = [
    { name: 'GPTBot', displayName: 'GPTBot', operator: 'OpenAI', visibilityValue: 'search_citation', visibilityLabel: 'Search & Citation', description: 'Helps your business show up when people ask ChatGPT questions.', focuses: ['structured_data', 'clear_content', 'product_pages'] },
    { name: 'ChatGPT-User', displayName: 'ChatGPT User', operator: 'OpenAI', visibilityValue: 'assistant_browsing', visibilityLabel: 'Assistant Browsing', description: 'Lets ChatGPT visit your site in real-time to answer user questions.', focuses: ['fast_loading', 'clear_content', 'pricing'] },
    { name: 'Google-Extended', displayName: 'Google AI', operator: 'Google', visibilityValue: 'search_citation', visibilityLabel: 'Search & Citation', description: 'Controls whether Google\'s AI features can reference your content.', focuses: ['structured_data', 'schema', 'open_graph'] },
    { name: 'ClaudeBot', displayName: 'ClaudeBot', operator: 'Anthropic', visibilityValue: 'search_citation', visibilityLabel: 'Search & Citation', description: 'Helps your business appear in Claude AI answers.', focuses: ['clear_content', 'trust_signals'] },
    { name: 'PerplexityBot', displayName: 'PerplexityBot', operator: 'Perplexity AI', visibilityValue: 'search_citation', visibilityLabel: 'Search & Citation', description: 'Gets your site cited in Perplexity search results.', focuses: ['clear_content', 'pricing', 'comparison'] },
    { name: 'Anthropic', displayName: 'Anthropic', operator: 'Anthropic', visibilityValue: 'training_corpus', visibilityLabel: 'Training & Corpus', description: 'Helps Claude learn about businesses like yours to give better recommendations.', focuses: ['clear_content', 'trust_signals'] },
    { name: 'CCBot', displayName: 'CCBot', operator: 'Common Crawl', visibilityValue: 'training_corpus', visibilityLabel: 'Training & Corpus', description: 'Builds a public web archive that many AI systems use to learn about businesses.', focuses: ['clear_content'] },
    { name: 'Amazonbot', displayName: 'Amazonbot', operator: 'Amazon', visibilityValue: 'assistant_browsing', visibilityLabel: 'Assistant Browsing', description: 'Powers Alexa AI and Amazon product recommendations.', focuses: ['product_pages', 'pricing'] },
    { name: 'Meta-ExternalAgent', displayName: 'Meta AI', operator: 'Meta', visibilityValue: 'search_citation', visibilityLabel: 'Search & Citation', description: 'Helps your business appear in Meta AI assistant answers across Facebook and Instagram.', focuses: ['open_graph', 'social_signals'] },
    { name: 'Bytespider', displayName: 'Bytespider', operator: 'ByteDance', visibilityValue: 'unknown', visibilityLabel: 'Unknown', description: 'Used by ByteDance for AI-powered content discovery.', focuses: ['clear_content'] },
  ];

  const allItems = [...findings, ...recommendations];
  const blockFinding = allItems.find((f) => (f.title as string)?.includes('blocked') || (f.title as string)?.includes('AI crawlers are blocked'));
  const blockedNames = blockFinding ? (blockFinding.title as string).replace(/.*blocked:\s*/, '').split(',').map((s: string) => s.trim().toLowerCase()) : [];
  const noRobots = allItems.some((f) => (f.title as string)?.includes('Add a robots.txt'));

  const findingTitles = findings.map(f => (f.title as string) || '');

  return CRAWLERS.map((meta) => {
    let status: string = 'no_rule';
    let statusBasis = 'default';
    let statusDetail = 'Allowed — no blocking rules found';

    if (noRobots) {
      statusDetail = 'Allowed — no robots.txt file found, so all AI systems can access your site';
    } else if (blockedNames.some((b: string) => meta.name.toLowerCase().includes(b) || b.includes(meta.name.toLowerCase()))) {
      status = 'blocked'; statusBasis = 'explicit_rule';
      statusDetail = `Blocked — your robots.txt file prevents ${meta.displayName} from accessing your site`;
    } else if (!blockFinding) {
      status = 'allowed'; statusBasis = 'default';
      statusDetail = 'Allowed — no blocking rules found';
    }

    // Map findings to barriers for this source
    const barriers: string[] = [];
    const sourceRecs: string[] = [];
    if (status === 'blocked') { barriers.push(`Your site blocks ${meta.displayName} from reading your pages`); sourceRecs.push(`Update your robots.txt to allow ${meta.displayName}`); }

    for (const focus of meta.focuses) {
      if (focus === 'structured_data' && findingTitles.some(t => t.includes('structured data'))) { barriers.push('Missing structured data that helps AI understand your pages'); sourceRecs.push('Add structured data (JSON-LD) to your key pages'); }
      if (focus === 'open_graph' && findingTitles.some(t => t.includes('Open Graph'))) { barriers.push('Missing social sharing tags that AI systems also use'); sourceRecs.push('Add social sharing tags (Open Graph) to your pages'); }
      if (focus === 'pricing' && findingTitles.some(t => t.includes('pricing'))) { barriers.push('No pricing page — AI can\'t answer "how much does it cost?"'); sourceRecs.push('Create a pricing page with clear plans and prices'); }
      if (focus === 'product_pages' && findingTitles.some(t => t.includes('product'))) { barriers.push('No product or service pages found'); sourceRecs.push('Create pages that explain what you offer'); }
      if (focus === 'trust_signals' && findingTitles.some(t => t.includes('social') || t.includes('review') || t.includes('customer'))) { barriers.push('Few trust signals like reviews or customer logos'); sourceRecs.push('Add customer logos, reviews, or testimonials to your site'); }
      if (focus === 'clear_content' && findingTitles.some(t => t.includes('thin content'))) { barriers.push('Some pages have too little content for AI to understand'); }
      if (focus === 'comparison' && findingTitles.some(t => t.includes('comparison'))) { barriers.push('No comparison content — competitors may win "vs" queries'); sourceRecs.push('Create pages comparing your business to alternatives'); }
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

