import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient as createSSRClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Service-role client: bypasses RLS entirely. Only for trusted server-only
 * code paths (cron jobs, Stripe webhook, workflow steps) that never run on
 * behalf of a specific browser session.
 */
export function createServiceRoleClient(): SupabaseClient {
  return createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  );
}

/**
 * Cookie-aware client for use in Server Components / Route Handlers that
 * need to read the signed-in user's session. Respects RLS.
 */
export async function createServerSessionClient() {
  const cookieStore = await cookies();

  return createSSRClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component without a mutable response —
            // safe to ignore as long as middleware.ts refreshes sessions.
          }
        },
      },
    },
  );
}
