import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Bootstrap-phase automation, phase 1 of 2: opens a fresh daily tournament
// with registration_open and zero entrants. Runs once a day via Vercel Cron
// (see vercel.json), ~23h before fill-and-start-tournament closes it out —
// that gap is a real registration window so an organic entrant who finds
// the site today lands in today's tournament alongside the bot pool, not
// after it's already started. See fill-and-start-tournament/route.ts for
// phase 2 and MIN_ENTRANTS.
//
// Two valid callers: Vercel's own Cron dispatcher (auto-sends
// `Authorization: Bearer $CRON_SECRET`, matching every route under
// app/api/cron/**), or a manual ops trigger using OPS_MANUAL_KEY for
// one-off runs without needing the CRON_SECRET value.
const OPS_MANUAL_KEY = 'm4OGN4kbdiNbHZcejusFKRG18sAQ-x_cGLpubbsG9_4';

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

  const { data: tournament, error } = await service
    .from('tournaments')
    .insert({ status: 'registration_open' })
    .select('id, created_at')
    .single();

  if (error || !tournament) {
    return NextResponse.json({ error: 'tournament_creation_failed', message: error?.message }, { status: 500 });
  }

  return NextResponse.json({ tournamentId: tournament.id, status: 'registration_open' });
}

export const GET = handler;
export const POST = handler;
