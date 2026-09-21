import { NextResponse } from 'next/server';
import { start } from 'workflow/api';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { runTournamentWorkflow } from '@/lib/tournament/run-tournament-workflow';

export const dynamic = 'force-dynamic';

// Bearer-token auth (CRON_SECRET) rather than a user session — this is the
// non-interactive trigger path for automated/scheduled tournament starts
// (Vercel Cron, or manual ops calls), same pattern as the admin start route
// but without requiring a browser session. Exact same auth pattern as
// APParattus's app/api/cron/scrape-and-score/route.ts.
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error('Missing required environment variable: CRON_SECRET');
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id: tournamentId } = await params;

  const service = createServiceRoleClient();
  const { data: tournament, error } = await service.from('tournaments').select('id, status').eq('id', tournamentId).single();
  if (error || !tournament) return NextResponse.json({ error: 'tournament_not_found' }, { status: 404 });
  if (tournament.status !== 'registration_open' && tournament.status !== 'scheduled') {
    return NextResponse.json({ error: 'tournament_not_startable', status: tournament.status }, { status: 409 });
  }

  const run = await start(runTournamentWorkflow, [tournamentId]);
  await service.from('tournaments').update({ workflow_run_id: run.runId }).eq('id', tournamentId);

  return NextResponse.json({ runId: run.runId });
}
