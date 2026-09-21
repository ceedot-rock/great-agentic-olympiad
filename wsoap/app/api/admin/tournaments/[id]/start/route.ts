import { NextResponse } from 'next/server';
import { start } from 'workflow/api';
import { createServerSessionClient, createServiceRoleClient } from '@/lib/supabase/server';
import { runTournamentWorkflow } from '@/lib/tournament/run-tournament-workflow';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = await params;

  const supabase = await createServerSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

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
