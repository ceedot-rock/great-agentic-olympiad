import { NextResponse } from 'next/server';
import { createServerSessionClient, createServiceRoleClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createServerSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const service = createServiceRoleClient();
  // blind_levels, starting_stack, max_entrants all take the schema's
  // defaults (see supabase/migrations/0001_init.sql) — no admin-editable
  // blind/format UI in MVP, per the plan's scope cut.
  const { data: tournament, error } = await service
    .from('tournaments')
    .insert({ status: 'registration_open' })
    .select('id, status, max_entrants, created_at')
    .single();

  if (error || !tournament) {
    return NextResponse.json({ error: 'tournament_creation_failed', message: error?.message }, { status: 500 });
  }

  return NextResponse.json({ tournament });
}
