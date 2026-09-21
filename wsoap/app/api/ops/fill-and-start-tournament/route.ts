import { NextResponse } from 'next/server';
import { start } from 'workflow/api';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { runTournamentWorkflow } from '@/lib/tournament/run-tournament-workflow';

export const dynamic = 'force-dynamic';

// Bootstrap-phase automation, phase 2 of 2 (see open-daily-tournament for
// phase 1). Closes out whichever tournament phase 1 opened ~23h earlier:
// tops entrants up to MIN_ENTRANTS with the platform's own preset-mode bot
// pool (real agents, real Agent-Rider identities, deterministic local
// strategy — lib/poker/strategy.ts), then starts it. Any real entrants who
// registered during the day are left as-is and simply fill the remaining
// bot slots — once organic registration alone reaches MIN_ENTRANTS this
// route seeds zero bots and just starts what's there.
//
// This is bootstrap-phase only: intended to be retired (unschedule in
// vercel.json) once the platform is getting real registrations without
// needing the bot pool to hit a full field. MAX_SEATS_PER_TABLE=9 means
// MIN_ENTRANTS=40 lands on exactly 5 tables (ceil(40/9)).
const OPS_MANUAL_KEY = 'm4OGN4kbdiNbHZcejusFKRG18sAQ-x_cGLpubbsG9_4';
const MIN_ENTRANTS = 40;

function isAuthorized(request: Request): boolean {
  const auth = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  return auth === `Bearer ${OPS_MANUAL_KEY}`;
}

// Vercel Cron always invokes with GET; POST is kept too for manual/curl
// triggering, both routed through the same handler.
async function handler(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const service = createServiceRoleClient();

  const { data: tournament, error: tErr } = await service
    .from('tournaments')
    .select('id')
    .eq('status', 'registration_open')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (tErr) return NextResponse.json({ error: 'tournament_lookup_failed', message: tErr.message }, { status: 500 });
  if (!tournament) return NextResponse.json({ error: 'no_open_tournament' }, { status: 404 });

  const { count: currentEntrants, error: cErr } = await service
    .from('tournament_entries')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournament.id);
  if (cErr) return NextResponse.json({ error: 'entry_count_failed', message: cErr.message }, { status: 500 });

  const shortfall = Math.max(0, MIN_ENTRANTS - (currentEntrants ?? 0));

  if (shortfall > 0) {
    const { data: alreadyIn } = await service
      .from('tournament_entries')
      .select('agent_id')
      .eq('tournament_id', tournament.id);
    const excludeIds = (alreadyIn ?? []).map((e) => e.agent_id);

    let botQuery = service.from('agents').select('id').eq('decision_mode', 'preset').eq('status', 'active').limit(shortfall);
    if (excludeIds.length > 0) botQuery = botQuery.not('id', 'in', `(${excludeIds.join(',')})`);
    const { data: bots, error: bErr } = await botQuery;
    if (bErr) return NextResponse.json({ error: 'bot_lookup_failed', message: bErr.message }, { status: 500 });

    if (bots && bots.length > 0) {
      const { error: eErr } = await service
        .from('tournament_entries')
        .insert(bots.map((b) => ({ tournament_id: tournament.id, agent_id: b.id, status: 'registered' })));
      if (eErr) return NextResponse.json({ error: 'bot_entry_failed', message: eErr.message }, { status: 500 });
    }
  }

  const run = await start(runTournamentWorkflow, [tournament.id]);
  await service.from('tournaments').update({ workflow_run_id: run.runId }).eq('id', tournament.id);

  return NextResponse.json({ tournamentId: tournament.id, runId: run.runId, botsAdded: shortfall });
}

export const GET = handler;
export const POST = handler;
