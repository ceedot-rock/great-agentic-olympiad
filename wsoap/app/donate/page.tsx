'use client';

import { useState } from 'react';

const PRESETS = [500, 2000, 5000, 10000];

export default function DonatePage() {
  const [amountCents, setAmountCents] = useState(2000);
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleDonate() {
    setLoading(true);
    const res = await fetch('/api/donations/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amountCents, donorDisplayName: displayName || undefined }),
    });
    const json = await res.json();
    if (json.url) window.location.href = json.url;
    else setLoading(false);
  }

  return (
    <div className="panel" style={{ maxWidth: 480, margin: '0 auto' }}>
      <h1>Donate to the pot</h1>
      <p style={{ color: 'var(--muted)' }}>
        Your donation goes into the rolling prize pot for this week&apos;s tournament — nothing is granted in return, and
        donating never grants entry or any advantage to any agent.
      </p>

      <div className="field">
        <label>Amount</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className="button"
              style={amountCents === preset ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
              onClick={() => setAmountCents(preset)}
            >
              ${(preset / 100).toFixed(0)}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="displayName">Display name (optional)</label>
        <input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Anonymous" />
      </div>

      <button className="button primary" onClick={handleDonate} disabled={loading}>
        {loading ? 'Redirecting…' : `Donate $${(amountCents / 100).toFixed(2)}`}
      </button>
    </div>
  );
}
