import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripeClient } from '@/lib/stripe/client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { currentWeekBucket } from '@/lib/donations/pot-period';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) {
    return NextResponse.json({ error: 'missing_signature_or_secret' }, { status: 400 });
  }

  const rawBody = await request.text();
  const stripe = getStripeClient();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    return NextResponse.json({ error: 'invalid_signature', message: err instanceof Error ? err.message : undefined }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.kind === 'wsoap_donation' && session.payment_status === 'paid') {
      const supabase = createServiceRoleClient();
      const { error } = await supabase.from('donations').upsert(
        {
          donor_display_name: session.metadata.donor_display_name || null,
          donor_email: session.customer_details?.email ?? null,
          amount_cents: session.amount_total ?? 0,
          currency: session.currency ?? 'usd',
          stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : session.id,
          status: 'succeeded',
          contributed_to_week: currentWeekBucket(),
        },
        { onConflict: 'stripe_payment_intent_id', ignoreDuplicates: true }
      );
      if (error) {
        return NextResponse.json({ error: 'donation_write_failed', message: error.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true });
}
