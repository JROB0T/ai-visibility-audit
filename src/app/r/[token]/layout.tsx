// ============================================================
// Layout for /r/[token] — exists for one reason: the page itself
// is a client component, so per-report <title>/<meta> for link
// previews has to come from a server segment. generateMetadata
// resolves the domain from the share token (best-effort; falls
// back to generic copy if the lookup fails — a preview should
// never break the page). The matching og:image comes from the
// sibling opengraph-image.tsx via file convention.
// ============================================================

import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { looksLikeShareToken } from '@/lib/shareTokens';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const fallback: Metadata = {
    title: 'AI Visibility Report',
    description:
      'See how AI assistants answer buyer questions about this business — scored and explained by Aivascan.',
    robots: { index: false, follow: false },
  };

  try {
    const { token } = await params;
    if (!looksLikeShareToken(token)) return fallback;
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data } = await admin
      .from('discovery_score_snapshots')
      .select('overall_score, sites(domain)')
      .eq('share_token', token)
      .maybeSingle();
    if (!data) return fallback;
    const site = Array.isArray(data.sites) ? data.sites[0] : data.sites;
    const domain = ((site as { domain?: string } | null)?.domain as string) || '';
    if (!domain) return fallback;
    return {
      title: `AI Visibility Report — ${domain}`,
      description:
        data.overall_score != null
          ? `${domain} scored ${Math.round(data.overall_score)}/100 on AI visibility. See exactly how AI assistants answer buyer questions about this business.`
          : fallback.description,
      robots: { index: false, follow: false },
    };
  } catch {
    return fallback;
  }
}

export default function ShareReportLayout({ children }: { children: React.ReactNode }) {
  return children;
}
