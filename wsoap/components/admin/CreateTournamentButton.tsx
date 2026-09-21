'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function CreateTournamentButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setLoading(true);
    setError(null);
    const res = await fetch('/api/admin/tournaments', { method: 'POST' });
    const json = await res.json();
    setLoading(false);
    if (res.ok) router.push(`/admin/tournaments/${json.tournament.id}`);
    else setError(json.error ?? 'failed');
  }

  return (
    <div>
      <button className="button primary" onClick={handleCreate} disabled={loading}>
        {loading ? 'Creating…' : 'Create new tournament'}
      </button>
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
    </div>
  );
}
