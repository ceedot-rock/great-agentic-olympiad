import type { AgentConfig, AgentDecisionRequest, DecisionOutcome } from '../poker/types';
import { evaluatePresetDecision } from '../poker/strategy';
import { requestWebhookDecision } from '../webhook/client';

/**
 * Dispatches a decision request to the right mechanism for this agent:
 * 'preset' agents are evaluated locally with zero I/O (the fix for the
 * per-decision HTTP call volume at 100-agent scale); 'webhook' agents still
 * get a real signed HTTP round trip. Called from inside a "use step"
 * function (lib/tournament/run-tournament-workflow.ts), which is what gives
 * it Node.js access (crypto, fetch) even for the webhook path.
 */
export async function resolveAgentDecision(request: AgentDecisionRequest, agent: AgentConfig): Promise<DecisionOutcome> {
  if (agent.decisionMode === 'webhook') {
    return requestWebhookDecision(request, agent);
  }

  const startedAt = Date.now();
  if (!agent.strategyParams) {
    return { response: null, wasTimeoutOrError: true, latencyMs: 0, rawRequest: request, rawResponse: null };
  }

  // Deterministic per-decision seed (hand + seat + this decision's own
  // event_id, which is persisted in hand_actions.raw_webhook_request) so a
  // preset agent's decisions are independently replayable/auditable, same as
  // the hand's card deal.
  const decisionSeed = `${request.hand_id}:${request.seat}:${request.event_id}`;
  const response = evaluatePresetDecision(request, agent.strategyParams, decisionSeed);
  return { response, wasTimeoutOrError: false, latencyMs: Date.now() - startedAt, rawRequest: request, rawResponse: response };
}
