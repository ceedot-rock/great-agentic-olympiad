import Stripe from 'stripe';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(requireEnv('STRIPE_SECRET_KEY'));
  }
  return stripeClient;
}
