'use client';

import { useEffect, useState } from 'react';

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function PotTicker() {
  const [potCents, setPotCents] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch('/api/pot');
        const json = await res.json();
        if (!cancelled) setPotCents(json.potCents);
      } catch {
        // Silent — ticker just keeps showing its last known value.
      }
    }

    poll();
    const interval = setInterval(poll, 8000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return <span className="potTicker">{potCents === null ? 'Pot: …' : `Pot: ${formatCents(potCents)}`}</span>;
}
