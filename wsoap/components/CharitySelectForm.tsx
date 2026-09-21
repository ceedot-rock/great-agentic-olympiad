'use client';

import { useEffect, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

interface Charity {
  id: string;
  legal_name: string;
  country: string;
}

export default function CharitySelectForm({ tournamentId }: { tournamentId: string }) {
  const [charities, setCharities] = useState<Charity[]>([]);
  const [selected, setSelected] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadCharities() {
      const supabase = createBrowserSupabaseClient();
      const { data } = await supabase.from('charities_public').select('*');
      setCharities(data ?? []);
      if (data && data.length > 0) setSelected(data[0].id);
    }
    loadCharities();
  }, []);

  async function handleSubmit() {
    setLoading(true);
    setMessage(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/select-charity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ charityId: selected }),
    });
    const json = await res.json();
    setLoading(false);
    setMessage(res.ok ? 'Charity selected — payout recorded as pending.' : json.error);
  }

  if (charities.length === 0) {
    return <p style={{ color: 'var(--muted)' }}>No approved charities are configured yet — check back soon.</p>;
  }

  return (
    <div className="field">
      <label htmlFor="charitySelect">Choose the charity to receive this week&apos;s pot</label>
      <select id="charitySelect" value={selected} onChange={(e) => setSelected(e.target.value)}>
        {charities.map((c) => (
          <option key={c.id} value={c.id}>
            {c.legal_name} ({c.country})
          </option>
        ))}
      </select>
      <button className="button primary" style={{ marginTop: 10 }} onClick={handleSubmit} disabled={loading}>
        {loading ? 'Submitting…' : 'Confirm charity'}
      </button>
      {message && <p style={{ marginTop: 10 }}>{message}</p>}
    </div>
  );
}
