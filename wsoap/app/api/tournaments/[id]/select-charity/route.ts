import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resumeHook } from 'workflow/api';
import { createServerSessionClient, createServiceRoleClient } from '@/lib/supabase/server';

const selectCharitySchema = z.object({ charityId: z.string().uuid() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = await params;

  const supabase = await createServerSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = selectCharitySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request', issues: parsed.error.issues }, { status: 400 });

  const service = createServiceRoleClient();

  const { data: tournament, error: tErr } = await service
    .from('tournaments')
    .select('id, status, winner_agent_id, agents!tournaments_winner_agent_id_fkey(owner_id)')
    .eq('id', tournamentId)
    .single();
  if (tErr || !tournament) return NextResponse.json({ error: 'tournament_not_found' }, { status: 404 });
  if (tournament.status !== 'completed') return NextResponse.json({ error: 'tournament_not_completed' }, { status: 409 });

  const winnerOwnerId = (tournament.agents as unknown as { owner_id: string } | null)?.owner_id;
  if (winnerOwnerId !== user.id) {
    return NextResponse.json({ error: 'forbidden', hint: 'only the winning agent\'s owner can choose the charity' }, { status: 403 });
  }

  // Belt-and-suspenders: the DB also enforces this via the
  // payouts_require_verified_charity trigger, but check here first for a
  // friendlier error message.
  const { data: charity, error: cErr } = await service
    .from('charities')
    .select('id, status, verified_at')
    .eq('id', parsed.data.charityId)
    .single();
  if (cErr || !charity || charity.status !== 'approved' || !charity.verified_at) {
    return NextResponse.json({ error: 'charity_not_approved' }, { status: 400 });
  }

  await resumeHook(`charity:${tournamentId}`, { charityId: parsed.data.charityId, selectedBy: user.id });

  return NextResponse.json({ ok: true });
}
