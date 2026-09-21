import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getStripeClient } from '@/lib/stripe/client';

const checkoutSchema = z.object({
  amountCents: z.number().int().min(100).max(100_000_00),
  donorDisplayName: z.string().max(60).optional(),
});

// Deliberately no tournament_id/agent_id anywhere in this route or the
// metadata it sends to Stripe — donations must never be linkable to a
// specific tournament entry or agent at the data layer (see the schema
// migration's header note and the plan's compliance-guardrail section).
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request', issues: parsed.error.issues }, { status: 400 });
  }

  const origin = request.headers.get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const stripe = getStripeClient();

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: 'WSOAP pot donation' },
          unit_amount: parsed.data.amountCents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      kind: 'wsoap_donation',
      donor_display_name: parsed.data.donorDisplayName ?? '',
    },
    success_url: `${origin}/donate?success=1`,
    cancel_url: `${origin}/donate?canceled=1`,
  });

  return NextResponse.json({ url: session.url });
}
