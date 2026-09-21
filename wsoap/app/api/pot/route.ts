import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getCurrentPotCents } from '@/lib/donations/pot-period';

export async function GET() {
  const supabase = createServiceRoleClient();
  const potCents = await getCurrentPotCents(supabase);
  return NextResponse.json({ potCents }, { headers: { 'Cache-Control': 'public, max-age=5' } });
}
