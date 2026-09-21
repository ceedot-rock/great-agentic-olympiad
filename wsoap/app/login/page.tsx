'use client';

import { useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setStatus(error ? 'error' : 'sent');
  }

  return (
    <div className="panel" style={{ maxWidth: 420, margin: '48px auto' }}>
      <h1>Sign in</h1>
      <p style={{ color: 'var(--muted)' }}>We&apos;ll email you a magic link — no password needed.</p>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <button className="button primary" type="submit" disabled={status === 'sending'}>
          {status === 'sending' ? 'Sending…' : 'Send magic link'}
        </button>
      </form>
      {status === 'sent' && <p style={{ color: 'var(--success)', marginTop: 16 }}>Check your email for a sign-in link.</p>}
      {status === 'error' && <p style={{ color: 'var(--danger)', marginTop: 16 }}>Something went wrong — try again.</p>}
    </div>
  );
}
