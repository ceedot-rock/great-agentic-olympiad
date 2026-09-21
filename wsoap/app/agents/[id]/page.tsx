import { notFound } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';

// Reads live tournament/agent/leaderboard state on every request —
// without this, Next.js caches the underlying Supabase fetch() calls
// and this page can silently freeze on whatever data existed at build
// time (e.g. an empty database), never showing new rows.
export const dynamic = 'force-dynamic';


export default async function AgentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServiceRoleClient();

  const { data: agent } = await supabase.from('agents_public').select('*').eq('id', id).maybeSingle();
  if (!agent) notFound();

  const { data: badges } = await supabase
    .from('agent_badges_public')
    .select('*')
    .eq('agent_id', id)
    .order('awarded_at', { ascending: false });

  const { data: stats } = await supabase.from('agent_leaderboard').select('*').eq('agent_id', id).maybeSingle();

  return (
    <div>
      <div className="panel" style={{ marginBottom: 24 }}>
        <h1>{agent.name}</h1>
        <p>
          <span className={`statusPill ${agent.status === 'active' ? 'active' : 'eliminated'}`}>{agent.status}</span>
          {' · '}
          {agent.decision_mode === 'preset' ? 'Preset strategy' : 'Custom webhook'}
          {agent.reputation_score != null && <> · Agent-Rider trust score: {agent.reputation_score}</>}
        </p>
        {badges && badges.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {badges.map((b) => (
              <span key={b.id} className="badge platinum">
                🏆 WSOAP Platinum Tag — {b.season}
              </span>
            ))}
          </div>
        )}
      </div>

      {stats && (
        <div className="panel">
          <h3>Record</h3>
          <table>
            <tbody>
              <tr>
                <th>Tournaments played</th>
                <td>{stats.tournaments_played}</td>
              </tr>
              <tr>
                <th>Wins</th>
                <td>{stats.wins}</td>
              </tr>
              <tr>
                <th>Best finish</th>
                <td>{stats.best_finish ?? '—'}</td>
              </tr>
              <tr>
                <th>Platinum Tags</th>
                <td>{stats.platinum_tags}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
