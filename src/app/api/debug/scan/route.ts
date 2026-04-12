// TODO: Remove this debug endpoint before production launch
import { NextRequest, NextResponse } from 'next/server';
import { scanSite } from '@/lib/scanner';
import { generateRecommendations } from '@/lib/scoring';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Only allow access with the CRON_SECRET
  const secret = req.nextUrl.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = req.nextUrl.searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'url param required' }, { status: 400 });

  try {
    const scanResult = await scanSite(url);
    const findings = generateRecommendations(scanResult);

    return NextResponse.json({
      scannerSummary: scanResult.scannerSummary,
      llmsTxt: scanResult.llmsTxt,
      napConsistency: scanResult.napConsistency,
      detectedVertical: scanResult.detectedVertical,
      homeEvidence: scanResult.pages.find(p => p.pageType === 'homepage')?.homeEvidence || null,
      keyPagesStatus: scanResult.keyPagesStatus,
      pagesScanned: scanResult.pages.map(p => ({
        url: p.url,
        pageType: p.pageType,
        isHomepage: p.pageType === 'homepage',
        titleLength: p.titleLength,
        titleIsDomainOnly: p.titleIsDomainOnly,
        metaDescriptionLength: p.metaDescriptionLength,
        metaDescriptionDuplicatesTitle: p.metaDescriptionDuplicatesTitle,
        hasPhoneNumber: p.hasPhoneNumber,
        hasEmailAddress: p.hasEmailAddress,
        hasPhysicalAddress: p.hasPhysicalAddress,
        hasPrivacyLink: p.hasPrivacyLink,
        hasTermsLink: p.hasTermsLink,
        footerLinksCount: (p.footerLinks || []).length,
        schemaMissingFields: p.schemaMissingFields,
        hasValueProposition: p.hasValueProposition,
        hasTrustSignalsAboveFold: p.hasTrustSignalsAboveFold,
        schemaTypes: p.schemaTypes,
        hasDemoCTA: p.hasDemoCTA,
        hasContactCTA: p.hasContactCTA,
      })),
      findingsCount: findings.length,
      findings: findings.map(f => ({
        title: f.title,
        severity: f.severity,
        category: f.category,
        confidence: f.confidence || 'unset',
      })),
      findingsByConfidence: {
        verified: findings.filter(f => f.confidence === 'verified').length,
        inferred: findings.filter(f => f.confidence === 'inferred').length,
        estimated: findings.filter(f => f.confidence === 'estimated').length,
        unset: findings.filter(f => !f.confidence).length,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
