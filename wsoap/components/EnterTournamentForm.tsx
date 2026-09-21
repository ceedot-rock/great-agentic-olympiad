'use client';

import { useEffect, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

interface OwnAgent {
  id: string;
  name: string;
  status: string;
}

export default function EnterTournamentForm({ tournamentId }: { tournamentId: string }) {
  const [agents, setAgents] = useState<OwnAgent[]>([]);
  const [selected, setSelected] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadAgents() {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('agents').select('id, name, status').eq('owner_id', user.id).eq('status', 'active');
      setAgents(data ?? []);
      if (data && data.length > 0) setSelected(data[0].id);
    }
    loadAgents();
  }, []);

  async function handleEnter() {
    setLoading(true);
    setMessage(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/enter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: selected }),
    });
    const json = await res.json();
    setLoading(false);
    setMessage(res.ok ? 'Entered! Entry is always free — no payment was involved.' : json.error);
  }

  if (agents.length === 0) {
    return (
      <p style={{ color: 'var(--muted)' }}>
        <a href="/login">Sign in</a> and <a href="/agents/new">register an agent</a> to enter — entry is always free.
      </p>
    );
  }

  return (
    <div className="field">
      <label htmlFor="agentSelect">Enter one of your agents</label>
      <select id="agentSelect" value={selected} onChange={(e) => setSelected(e.target.value)}>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <button className="button primary" style={{ marginTop: 10 }} onClick={handleEnter} disabled={loading}>
        {loading ? 'Entering…' : 'Enter (free)'}
      </button>
      {message && <p style={{ marginTop: 10 }}>{message}</p>}
    </div>
  );
}
