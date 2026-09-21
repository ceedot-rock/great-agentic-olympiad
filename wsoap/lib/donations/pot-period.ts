import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The "current" pot period is the window since the last tournament started
 * (when that week's pot got frozen into tournaments.pot_snapshot_cents).
 * Donations landing after a tournament starts roll into *next* week's pot,
 * not the one already in play, which is what makes "the pot that
 * accumulated since the last tournament is what's on the line" literally
 * true rather than just a marketing description.
 */
export async function getCurrentPotPeriodStart(supabase: SupabaseClient): Promise<Date | null> {
  const { data, error } = await supabase
    .from('tournaments')
    .select('started_at')
    .in('status', ['in_progress', 'completed'])
    .not('started_at', 'is', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`getCurrentPotPeriodStart: ${error.message}`);
  return data?.started_at ? new Date(data.started_at) : null;
}

export async function getCurrentPotCents(supabase: SupabaseClient): Promise<number> {
  const periodStart = await getCurrentPotPeriodStart(supabase);

  let query = supabase.from('donations').select('amount_cents').eq('status', 'succeeded');
  if (periodStart) query = query.gt('created_at', periodStart.toISOString());

  const { data, error } = await query;
  if (error) throw new Error(`getCurrentPotCents: ${error.message}`);
  return (data ?? []).reduce((sum, row) => sum + row.amount_cents, 0);
}

/** Date bucket (YYYY-MM-DD) to stamp on a new donation's contributed_to_week. */
export function currentWeekBucket(): string {
  return new Date().toISOString().slice(0, 10);
}
