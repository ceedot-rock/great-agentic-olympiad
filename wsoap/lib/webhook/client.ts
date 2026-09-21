import { fetch as undiciFetch } from 'undici';
import type { AgentConfig, AgentDecisionRequest, DecisionOutcome } from '../poker/types';
import { checkUrlSafety, createPinnedDispatcher } from './ssrf-guard';
import { signWebhookPayload } from './signing';
import { agentDecisionResponseSchema, DECISION_TIMEOUT_MS, MAX_RESPONSE_BYTES } from './contract';

async function readBodyCapped(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return response.text();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error('response_too_large');
      }
      chunks.push(value);
    }
  }

  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf-8');
}

/**
 * DecisionProvider implementation for `decision_mode = 'webhook'` agents.
 * Every call: re-resolves + re-validates the URL (defeats DNS rebinding
 * between registration-time and call-time checks), pins the TCP connection
 * to that resolved IP, signs the request, enforces a hard timeout, and caps
 * the response body size. Any failure of any kind resolves to
 * `wasTimeoutOrError: true` — the caller (lib/poker/dealer.ts) always falls
 * back to check-if-legal-else-fold, never an auto-bet/raise.
 */
export async function requestWebhookDecision(request: AgentDecisionRequest, agent: AgentConfig): Promise<DecisionOutcome> {
  const startedAt = Date.now();
  const rawRequest = request;

  if (!agent.webhookUrl || !agent.webhookSecret) {
    return { response: null, wasTimeoutOrError: true, latencyMs: 0, rawRequest, rawResponse: null };
  }

  const safety = await checkUrlSafety(agent.webhookUrl);
  if (!safety.safe || !safety.resolved) {
    return { response: null, wasTimeoutOrError: true, latencyMs: Date.now() - startedAt, rawRequest, rawResponse: { error: `ssrf_guard:${safety.reason}` } };
  }

  const dispatcher = createPinnedDispatcher(safety.resolved);
  const body = JSON.stringify(request);
  const timestamp = Date.now().toString();
  const signature = signWebhookPayload(agent.webhookSecret, timestamp, request.event_id, body);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DECISION_TIMEOUT_MS);

  try {
    const response = await undiciFetch(agent.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-WSOAP-Signature': signature,
        'X-WSOAP-Timestamp': timestamp,
      },
      body,
      redirect: 'manual',
      dispatcher,
      signal: controller.signal,
    });

    if (response.status < 200 || response.status >= 300) {
      return { response: null, wasTimeoutOrError: true, latencyMs: Date.now() - startedAt, rawRequest, rawResponse: { httpStatus: response.status } };
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return { response: null, wasTimeoutOrError: true, latencyMs: Date.now() - startedAt, rawRequest, rawResponse: { error: 'non_json_content_type' } };
    }

    const text = await readBodyCapped(response as unknown as globalThis.Response, MAX_RESPONSE_BYTES);
    const json = JSON.parse(text);
    const parsed = agentDecisionResponseSchema.safeParse(json);

    if (!parsed.success) {
      return { response: null, wasTimeoutOrError: true, latencyMs: Date.now() - startedAt, rawRequest, rawResponse: json };
    }

    return { response: parsed.data, wasTimeoutOrError: false, latencyMs: Date.now() - startedAt, rawRequest, rawResponse: json };
  } catch (err) {
    return {
      response: null,
      wasTimeoutOrError: true,
      latencyMs: Date.now() - startedAt,
      rawRequest,
      rawResponse: { error: err instanceof Error ? err.message : 'unknown_error' },
    };
  } finally {
    clearTimeout(timeout);
  }
}
