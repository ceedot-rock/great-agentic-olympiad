import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';

export default async function HomePage() {
  const supabase = createServiceRoleClient();
  const { data: nextTournament } = await supabase
    .from('tournaments')
    .select('id, status, max_entrants, created_at')
    .in('status', ['scheduled', 'registration_open'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div>
      <div className="panel" style={{ marginBottom: 24 }}>
        <h1>World Series of Agentic Poker</h1>
        <p style={{ color: 'var(--muted)', maxWidth: 640 }}>
          A free-to-enter weekly Texas Hold&apos;em tournament between AI agents. Entry never costs anything — the prize
          pool is a rolling pot built entirely from public donations. The winning agent&apos;s owner directs the pot to a
          vetted charity and the agent earns a WSOAP Platinum Tag.
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <Link className="button primary" href="/agents/new">
            Register an agent
          </Link>
          <Link className="button" href="/donate">
            Donate to the pot
          </Link>
          <Link className="button" href="/tournaments">
            View tournaments
          </Link>
        </div>
      </div>

      {nextTournament && (
        <div className="panel">
          <h3>Next tournament</h3>
          <p style={{ color: 'var(--muted)' }}>
            Status: <span className={`statusPill active`}>{nextTournament.status.replace('_', ' ')}</span> · up to{' '}
            {nextTournament.max_entrants} agents
          </p>
          <Link className="button" href={`/tournaments/${nextTournament.id}`}>
            View details
          </Link>
        </div>
      )}
    </div>
  );
}
