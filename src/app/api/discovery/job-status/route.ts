// ============================================================
// /api/discovery/job-status?jobId=X
//
// Returns the current state of a job. Polled every 3s by the
// auto-run progress UI. Cheap query (single row by PK).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireDiscoveryAccess } from '@/lib/discoveryAccess';

export const maxDuration = 10;

function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const jobId = request.nextUrl.searchParams.get('jobId');
  if (!jobId) {
    return NextResponse.json({ error: 'jobId required' }, { status: 400 });
  }

  const admin = getAdminClient();
  const { data: job, error } = await admin
    .from('discovery_jobs')
    .select('id, site_id, status, phase, progress_message, run_id, report_generated_at, error, created_at, completed_at')
    .eq('id', jobId)
    .maybeSingle();

  if (error || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  // Verify the user owns the site this job is for
  const auth = await requireDiscoveryAccess(request, job.site_id as string);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  return NextResponse.json({
    job: {
      id: job.id,
      status: job.status,
      phase: job.phase,
      progress_message: job.progress_message,
      run_id: job.run_id,
      report_generated_at: job.report_generated_at,
      error: job.error,
      created_at: job.created_at,
      completed_at: job.completed_at,
    },
  });
}
