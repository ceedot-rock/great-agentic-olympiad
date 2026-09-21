import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSessionClient, createServiceRoleClient } from '@/lib/supabase/server';
import { checkUrlSafety } from '@/lib/webhook/ssrf-guard';
import { verifyRiderToken } from '@/lib/rider/verify';

const strategyParamsSchema = z.object({
  aggression: z.number().min(0).max(1),
  tightness: z.number().min(0).max(1),
  bluffFrequency: z.number().min(0).max(1),
  betSizing: z.number().min(0.1).max(2),
  callDownTendency: z.number().min(0).max(1),
});

const registerAgentSchema = z.discriminatedUnion('decisionMode', [
  z.object({
    name: z.string().min(2).max(40),
    avatarUrl: z.string().url().optional(),
    riderToken: z.string().min(10),
    decisionMode: z.literal('preset'),
    strategyParams: strategyParamsSchema,
  }),
  z.object({
    name: z.string().min(2).max(40),
    avatarUrl: z.string().url().optional(),
    riderToken: z.string().min(10),
    decisionMode: z.literal('webhook'),
    webhookUrl: z.string().url(),
  }),
]);

export async function POST(request: Request) {
  const supabase = await createServerSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'unauthenticated', hint: 'sign in first' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = registerAgentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request', issues: parsed.error.issues }, { status: 400 });
  }
  const input = parsed.data;

  // Rider verification proves the registrant actually controls the claimed
  // Agent-Rider agent_id/operator_id — an identity check done once here, not
  // per decision, so it doesn't scale with tournament size.
  const riderResult = await verifyRiderToken(input.riderToken);
  if (!riderResult.valid || !riderResult.rider) {
    return NextResponse.json({ error: 'invalid_rider_token', reason: riderResult.reason }, { status: 401 });
  }

  let webhookUrl: string | null = null;
  let webhookSecret: string | null = null;

  if (input.decisionMode === 'webhook') {
    const safety = await checkUrlSafety(input.webhookUrl);
    if (!safety.safe) {
      return NextResponse.json({ error: 'unsafe_webhook_url', reason: safety.reason }, { status: 400 });
    }
    webhookUrl = input.webhookUrl;
    webhookSecret = randomBytes(32).toString('hex');
  }

  const service = createServiceRoleClient();
  const { data: agent, error } = await service
    .from('agents')
    .insert({
      owner_id: user.id,
      name: input.name,
      avatar_url: input.avatarUrl ?? null,
      decision_mode: input.decisionMode,
      strategy_params: input.decisionMode === 'preset' ? input.strategyParams : null,
      webhook_url: webhookUrl,
      webhook_secret: webhookSecret,
      rider_agent_id: riderResult.rider.agent_id,
      rider_operator_id: riderResult.rider.operator_id,
      reputation_score: riderResult.rider.reputation_score ?? null,
    })
    .select('id, name, decision_mode, status, created_at')
    .single();

  if (error || !agent) {
    const status = error?.code === '23505' ? 409 : 500;
    return NextResponse.json({ error: 'agent_creation_failed', message: error?.message }, { status });
  }

  return NextResponse.json({
    agent,
    // Convenience: shown here at creation time so the owner can copy it
    // immediately. It's still recoverable later via their own authenticated
    // read of their own agents row (RLS: "agents: owner full read"), but it
    // never appears in agents_public or to any other user.
    webhookSecret: webhookSecret ?? undefined,
  });
}
