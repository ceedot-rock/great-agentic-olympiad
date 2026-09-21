import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser client for Client Components — used for Supabase Realtime
 * subscriptions on the spectator page. APParattus doesn't have this file
 * since it has no client-side Supabase usage; this is a genuine addition
 * for WSOAP, not a mirror of an existing pattern.
 */
export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
