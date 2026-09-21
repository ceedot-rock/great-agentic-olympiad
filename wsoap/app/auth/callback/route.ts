import { NextResponse } from 'next/server';
import { createServerSessionClient } from '@/lib/supabase/server';

// Standard Supabase SSR magic-link callback: exchanges the emailed code for
// a session cookie, then redirects home.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const supabase = await createServerSessionClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}/`);
}
