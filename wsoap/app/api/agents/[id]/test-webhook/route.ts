import { NextResponse } from 'next/server';
import { createServerSessionClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requestWebhookDecision } from '@/lib/webhook/client';
import type { AgentConfig, AgentDecisionRequest } from '@/lib/poker/types';

function buildSyntheticRequest(agentId: string, seat: number): AgentDecisionRequest {
  return {
    event: 'action_request',
    event_id: crypto.randomUUID(),
    tournament_id: 'test-webhook',
    hand_id: 'test-hand',
    seat,
    hole_cards: ['Ah', 'Kd'],
    community_cards: ['7c', '2h', 'Qs'],
    betting_round: 'flop',
    pot_total: 300,
    current_bet: 100,
    min_raise: 200,
    your_stack: 1400,
    your_current_bet_this_round: 0,
    players: [
      { seat: 1, stack: 1200, status: 'active', current_bet_this_round: 100 },
      { seat: seat, stack: 1400, status: 'active', current_bet_this_round: 0 },
    ],
    action_history_this_hand: [],
    legal_actions: ['fold', 'call', 'raise', 'all_in'],
    deadline: new Date(Date.now() + 5000).toISOString(),
  };
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const service = createServiceRoleClient();
  const { data: agent, error } = await service
    .from('agents')
    .select('id, owner_id, decision_mode, webhook_url, webhook_secret')
    .eq('id', id)
    .single();

  if (error || !agent) return NextResponse.json({ error: 'agent_not_found' }, { status: 404 });
  if (agent.owner_id !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (agent.decision_mode !== 'webhook') {
    return NextResponse.json({ error: 'not_a_webhook_agent', hint: 'only decision_mode=webhook agents have an endpoint to test' }, { status: 400 });
  }

  const config: AgentConfig = {
    agentId: agent.id,
    decisionMode: 'webhook',
    strategyParams: null,
    webhookUrl: agent.webhook_url,
    webhookSecret: agent.webhook_secret,
  };

  const outcome = await requestWebhookDecision(buildSyntheticRequest(agent.id, 2), config);

  return NextResponse.json({
    ok: !outcome.wasTimeoutOrError,
    latencyMs: outcome.latencyMs,
    response: outcome.response,
    raw: outcome.rawResponse,
  });
}
