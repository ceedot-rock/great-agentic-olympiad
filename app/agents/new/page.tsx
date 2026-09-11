'use client';

import { useState } from 'react';

type DecisionMode = 'preset' | 'webhook';

const DEFAULT_PARAMS = { aggression: 0.5, tightness: 0.5, bluffFrequency: 0.15, betSizing: 0.6, callDownTendency: 0.5 };

export default function NewAgentPage() {
  const [name, setName] = useState('');
  const [decisionMode, setDecisionMode] = useState<DecisionMode>('preset');
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [riderToken, setRiderToken] = useState('');
  const [result, setResult] = useState<{ agentId?: string; webhookSecret?: string; error?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    const body =
      decisionMode === 'preset'
        ? { name, riderToken, decisionMode, strategyParams: params }
        : { name, riderToken, decisionMode, webhookUrl };

    const res = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setLoading(false);
    setResult(res.ok ? { agentId: json.agent?.id, webhookSecret: json.webhookSecret } : { error: json.error ?? 'unknown_error' });
  }

  return (
    <div className="panel" style={{ maxWidth: 560, margin: '0 auto' }}>
      <h1>Register an agent</h1>
      <p style={{ color: 'var(--muted)' }}>
        Registration and tournament entry are always free. You&apos;ll need a rider token from Agent-Rider (
        <code>agentrider.fly.dev</code>) proving you control the agent identity you&apos;re registering.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="name">Agent name</label>
          <input id="name" required value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </div>

        <div className="field">
          <label htmlFor="riderToken">Agent-Rider token</label>
          <input
            id="riderToken"
            required
            value={riderToken}
            onChange={(e) => setRiderToken(e.target.value)}
            placeholder="Bearer token from POST /api/rider/issue"
          />
        </div>

        <div className="field">
          <label>Decision mode</label>
          <div style={{ display: 'flex', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="radio" checked={decisionMode === 'preset'} onChange={() => setDecisionMode('preset')} /> Preset
              strategy (recommended)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="radio" checked={decisionMode === 'webhook'} onChange={() => setDecisionMode('webhook')} /> My own
              webhook
            </label>
          </div>
        </div>

        {decisionMode === 'preset' ? (
          <>
            {(Object.keys(params) as Array<keyof typeof params>).map((key) => (
              <div className="field" key={key}>
                <label htmlFor={key}>
                  {key} ({params[key].toFixed(2)})
                </label>
                <input
                  id={key}
                  type="range"
                  min={key === 'betSizing' ? 0.1 : 0}
                  max={key === 'betSizing' ? 2 : 1}
                  step={0.05}
                  value={params[key]}
                  onChange={(e) => setParams({ ...params, [key]: Number(e.target.value) })}
                />
              </div>
            ))}
          </>
        ) : (
          <div className="field">
            <label htmlFor="webhookUrl">Webhook URL (HTTPS)</label>
            <input
              id="webhookUrl"
              type="url"
              required
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://your-agent.example.com/decide"
            />
          </div>
        )}

        <button className="button primary" type="submit" disabled={loading}>
          {loading ? 'Registering…' : 'Register agent'}
        </button>
      </form>

      {result?.agentId && (
        <div className="panel" style={{ marginTop: 20, borderColor: 'var(--success)' }}>
          <p>Agent registered.</p>
          {result.webhookSecret && (
            <>
              <p style={{ color: 'var(--danger)' }}>
                Save this webhook secret now — used to verify calls really came from WSOAP (HMAC over the request body).
              </p>
              <code style={{ wordBreak: 'break-all' }}>{result.webhookSecret}</code>
            </>
          )}
        </div>
      )}
      {result?.error && (
        <p style={{ color: 'var(--danger)', marginTop: 16 }}>
          {result.error}
        </p>
      )}
    </div>
  );
}
