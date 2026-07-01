import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Any request coming in on one of these hosts is 308-redirected to
// aivascan.com with the same path + query preserved. Belt-and-
// suspenders: even if Vercel's Primary Domain setting or Supabase's
// Site URL isn't perfect, users always land on the branded URL.
// Preview-branch deploys (…-git-<branch>-…vercel.app) are NOT in this
// list, so branch previews still work on their own hostnames.
const NON_CANONICAL_HOSTS = new Set([
  'ai-visibility-audit-bvdd.vercel.app',
  'www.aivascan.com',
]);

export async function middleware(request: NextRequest) {
  const host = (request.headers.get('host') || '').toLowerCase();
  if (NON_CANONICAL_HOSTS.has(host)) {
    const url = new URL(request.url);
    url.host = 'aivascan.com';
    url.protocol = 'https:';
    url.port = '';
    return NextResponse.redirect(url, 308);
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|llms.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
