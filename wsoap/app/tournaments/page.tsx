import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';

// Reads live tournament/agent/leaderboard state on every request —
// without this, Next.js caches the underlying Supabase fetch() calls
// and this page can silently freeze on whatever data existed at build
// time (e.g. an empty database), never showing new rows.
export const dynamic = 'force-dynamic';


export default async function TournamentsPage() {
  const supabase = createServiceRoleClient();
  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('id, status, max_entrants, started_at, completed_at, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <div>
      <h1>Tournaments</h1>
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Max entrants</th>
            <th>Started</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(tournaments ?? []).map((t) => (
            <tr key={t.id}>
              <td>
                <span className={`statusPill ${t.status === 'in_progress' ? 'active' : ''}`}>{t.status.replace('_', ' ')}</span>
              </td>
              <td>{t.max_entrants}</td>
              <td>{t.started_at ? new Date(t.started_at).toLocaleString() : '—'}</td>
              <td>
                <Link className="button" href={`/tournaments/${t.id}`}>
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
