'use client';

import { useState } from 'react';

export default function StartTournamentButton({ tournamentId }: { tournamentId: string }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleStart() {
    setLoading(true);
    setMessage(null);
    const res = await fetch(`/api/admin/tournaments/${tournamentId}/start`, { method: 'POST' });
    const json = await res.json();
    setLoading(false);
    setMessage(res.ok ? `Started — workflow run ${json.runId}` : json.error);
  }

  return (
    <div>
      <button className="button primary" onClick={handleStart} disabled={loading}>
        {loading ? 'Starting…' : 'Start tournament'}
      </button>
      {message && <p style={{ marginTop: 10 }}>{message}</p>}
    </div>
  );
}
