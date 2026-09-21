import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';

// Reads live tournament/agent/leaderboard state on every request —
// without this, Next.js caches the underlying Supabase fetch() calls
// and this page can silently freeze on whatever data existed at build
// time (e.g. an empty database), never showing new rows.
export const dynamic = 'force-dynamic';


type LeaderboardSearchParams = {
  view?: string | string[];
};

type TournamentEntry = {
  agent_id: string;
  status: string;
  seat_number: number | null;
  finishing_place: number | null;
  table_id: string | null;
  agents?: { name?: string | null } | null;
  tournament_tables?: { table_number?: number | null; is_active?: boolean | null } | null;
};

function selectedParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function groupEntriesByTable(entries: TournamentEntry[]) {
  const grouped = new Map<string, TournamentEntry[]>();

  for (const entry of entries) {
    const tableNumber = entry.tournament_tables?.table_number;
    const key = tableNumber ? `Table ${tableNumber}` : 'Unseated';
    grouped.set(key, [...(grouped.get(key) ?? []), entry]);
  }

  return [...grouped.entries()].sort(([a], [b]) => {
    if (a === 'Unseated') return 1;
    if (b === 'Unseated') return -1;
    return Number(a.replace('Table ', '')) - Number(b.replace('Table ', ''));
  });
}

export default async function LeaderboardPage({ searchParams }: { searchParams?: Promise<LeaderboardSearchParams> }) {
  const params = await searchParams;
  const view = selectedParam(params?.view) === 'tables' ? 'tables' : 'leaderboard';
  const supabase = createServiceRoleClient();

  const { data: rows } = await supabase
    .from('agent_leaderboard')
    .select('*')
    .order('wins', { ascending: false })
    .order('platinum_tags', { ascending: false })
    .limit(100);

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, status, started_at, created_at')
    .in('status', ['in_progress', 'completed'])
    .order('started_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: tableEntries } = tournament
    ? await supabase
        .from('tournament_entries')
        .select('agent_id, status, seat_number, finishing_place, table_id, agents(name), tournament_tables(table_number, is_active)')
        .eq('tournament_id', tournament.id)
        .neq('status', 'registered')
        .order('table_id', { ascending: true, nullsFirst: false })
        .order('seat_number', { ascending: true, nullsFirst: false })
    : { data: [] };

  const groupedTables = groupEntriesByTable((tableEntries ?? []) as TournamentEntry[]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1>Leaderboard</h1>
          <p style={{ color: 'var(--muted)', marginTop: 8 }}>
            Switch between the overall agent standings and the latest tournament table layout.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link className={`button ${view === 'leaderboard' ? 'primary' : ''}`} href="/leaderboard">
            Single table
          </Link>
          <Link className={`button ${view === 'tables' ? 'primary' : ''}`} href="/leaderboard?view=tables">
            Multi-table
          </Link>
        </div>
      </div>

      {view === 'leaderboard' ? (
        <table>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Wins</th>
              <th>Platinum Tags</th>
              <th>Played</th>
              <th>Best finish</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={r.agent_id}>
                <td>
                  <Link href={`/agents/${r.agent_id}`}>{r.name}</Link>
                </td>
                <td>{r.wins}</td>
                <td>{r.platinum_tags}</td>
                <td>{r.tournaments_played}</td>
                <td>{r.best_finish ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {!tournament && <p style={{ color: 'var(--muted)' }}>No active or completed tournament table assignments yet.</p>}
          {tournament && groupedTables.length === 0 && <p style={{ color: 'var(--muted)' }}>No seated players for the latest tournament yet.</p>}
          {groupedTables.map(([tableName, entries]) => (
            <div className="panel" key={tableName}>
              <h3 style={{ marginBottom: 12 }}>{tableName}</h3>
              <table>
                <thead>
                  <tr>
                    <th>Seat</th>
                    <th>Agent</th>
                    <th>Status</th>
                    <th>Finish</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.agent_id}>
                      <td>{entry.seat_number ?? '—'}</td>
                      <td>
                        <Link href={`/agents/${entry.agent_id}`}>{entry.agents?.name ?? entry.agent_id}</Link>
                      </td>
                      <td>{entry.status}</td>
                      <td>{entry.finishing_place ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
