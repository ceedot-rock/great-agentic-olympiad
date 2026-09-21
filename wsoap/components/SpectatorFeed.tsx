'use client';

import { useEffect, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

interface ActionRow {
  id: string;
  agent_id: string;
  betting_round: string;
  action_type: string;
  amount: number | null;
  pot_after: number;
  created_at: string;
}

/**
 * Polls hand_actions_public rather than subscribing to Supabase Realtime.
 * hand_actions' base-table RLS is admin-only (raw_webhook_request/response
 * can carry an agent owner's own infra details — headers, error bodies —
 * that shouldn't go out to every spectator), but Realtime's postgres_changes
 * evaluates RLS on the base table, not the sanitized *_public view, so a
 * Realtime subscription here would either see nothing (correct RLS, wrong
 * UX) or require opening the base table to public reads (wrong: leaks the
 * columns the view exists to hide). Polling the already-safe public view
 * sidesteps the mismatch entirely — same tradeoff already made for
 * PotTicker's "real-time-ish" pot display.
 */
export default function SpectatorFeed({ tournamentId }: { tournamentId: string }) {
  const [actions, setActions] = useState<ActionRow[]>([]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let cancelled = false;

    async function poll() {
      const { data } = await supabase
        .from('hand_actions_public')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (!cancelled && data) setActions(data.reverse());
    }

    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [tournamentId]);

  return (
    <div className="actionLog">
      {actions.length === 0 && <p style={{ color: 'var(--muted)' }}>No action yet.</p>}
      {actions.map((a) => (
        <div className="row" key={a.id}>
          <span>
            {a.betting_round} · seat action: {a.action_type}
            {a.amount ? ` ${a.amount}` : ''}
          </span>
          <span style={{ color: 'var(--muted)' }}>pot {a.pot_after}</span>
        </div>
      ))}
    </div>
  );
}
