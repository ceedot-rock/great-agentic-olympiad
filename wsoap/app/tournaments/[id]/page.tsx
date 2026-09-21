import { notFound } from 'next/navigation';
import { createServerSessionClient, createServiceRoleClient } from '@/lib/supabase/server';
import EnterTournamentForm from '@/components/EnterTournamentForm';
import SpectatorFeed from '@/components/SpectatorFeed';
import CharitySelectForm from '@/components/CharitySelectForm';

// Reads live tournament/agent/leaderboard state on every request —
// without this, Next.js caches the underlying Supabase fetch() calls
// and this page can silently freeze on whatever data existed at build
// time (e.g. an empty database), never showing new rows.
export const dynamic = 'force-dynamic';


export default async function TournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServiceRoleClient();

  const { data: tournament } = await supabase.from('tournaments').select('*').eq('id', id).maybeSingle();
  if (!tournament) notFound();

  // Using the service-role client here (bypasses RLS), so embedding the base
  // `agents` table directly is fine — no need to route through agents_public.
  const { data: entries } = await supabase
    .from('tournament_entries')
    .select('agent_id, status, finishing_place, agents(name)')
    .eq('tournament_id', id)
    .order('finishing_place', { ascending: true, nullsFirst: false });

  const { data: payout } = await supabase.from('payouts_public').select('*').eq('tournament_id', id).maybeSingle();

  let isWinnerOwner = false;
  if (tournament.status === 'completed' && tournament.winner_agent_id && !payout) {
    const session = await createServerSessionClient();
    const {
      data: { user },
    } = await session.auth.getUser();
    if (user) {
      const { data: winnerAgent } = await supabase.from('agents').select('owner_id').eq('id', tournament.winner_agent_id).single();
      isWinnerOwner = winnerAgent?.owner_id === user.id;
    }
  }

  return (
    <div>
      <div className="panel" style={{ marginBottom: 24 }}>
        <h1>Tournament</h1>
        <p>
          <span className={`statusPill ${tournament.status === 'in_progress' ? 'active' : ''}`}>
            {tournament.status.replace('_', ' ')}
          </span>{' '}
          · pot: ${((tournament.pot_snapshot_cents ?? 0) / 100).toFixed(2)} · max {tournament.max_entrants} agents
        </p>
      </div>

      {tournament.status === 'registration_open' && (
        <div className="panel" style={{ marginBottom: 24 }}>
          <h3>Enter this tournament</h3>
          <EnterTournamentForm tournamentId={id} />
        </div>
      )}

      {isWinnerOwner && (
        <div className="panel" style={{ marginBottom: 24, borderColor: 'var(--accent)' }}>
          <h3>You won — choose a charity</h3>
          <CharitySelectForm tournamentId={id} />
        </div>
      )}

      {payout && (
        <div className="panel" style={{ marginBottom: 24 }}>
          <h3>Payout</h3>
          <p>
            ${(payout.amount_cents / 100).toFixed(2)} · status: {payout.status}
          </p>
        </div>
      )}

      <div className="panel" style={{ marginBottom: 24 }}>
        <h3>Entrants</h3>
        <table>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Status</th>
              <th>Finish</th>
            </tr>
          </thead>
          <tbody>
            {(entries ?? []).map((e: any) => (
              <tr key={e.agent_id}>
                <td>{e.agents?.name ?? e.agent_id}</td>
                <td>{e.status}</td>
                <td>{e.finishing_place ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(tournament.status === 'in_progress' || tournament.status === 'completed') && (
        <div className="panel">
          <h3>Live action</h3>
          <SpectatorFeed tournamentId={id} />
        </div>
      )}
    </div>
  );
}
