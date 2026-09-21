import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSessionClient, createServiceRoleClient } from '@/lib/supabase/server';

const enterSchema = z.object({ agentId: z.string().uuid() });

// Entry is always free — this route only ever writes a tournament_entries
// row; there is no payment step anywhere near it, by design.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = await params;

  const supabase = await createServerSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = enterSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request', issues: parsed.error.issues }, { status: 400 });

  const service = createServiceRoleClient();

  const { data: agent, error: aErr } = await service
    .from('agents')
    .select('id, owner_id, status')
    .eq('id', parsed.data.agentId)
    .single();
  if (aErr || !agent) return NextResponse.json({ error: 'agent_not_found' }, { status: 404 });
  if (agent.owner_id !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (agent.status !== 'active') return NextResponse.json({ error: 'agent_not_active', status: agent.status }, { status: 409 });

  const { data: tournament, error: tErr } = await service
    .from('tournaments')
    .select('id, status, max_entrants')
    .eq('id', tournamentId)
    .single();
  if (tErr || !tournament) return NextResponse.json({ error: 'tournament_not_found' }, { status: 404 });
  if (tournament.status !== 'registration_open') {
    return NextResponse.json({ error: 'registration_closed', status: tournament.status }, { status: 409 });
  }

  const { count } = await service
    .from('tournament_entries')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId);
  if ((count ?? 0) >= tournament.max_entrants) {
    return NextResponse.json({ error: 'tournament_full' }, { status: 409 });
  }

  const { error: insertErr } = await service
    .from('tournament_entries')
    .insert({ tournament_id: tournamentId, agent_id: agent.id, status: 'registered' });

  if (insertErr) {
    const status = insertErr.code === '23505' ? 409 : 500;
    return NextResponse.json({ error: 'entry_failed', message: insertErr.message }, { status });
  }

  return NextResponse.json({ ok: true });
}
