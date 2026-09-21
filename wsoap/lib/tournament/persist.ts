import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RecordedAction, TablePlayer } from '../poker/types';

/**
 * Deterministic UUID-shaped id derived from stable inputs (not
 * gen_random_uuid()) so a retried Workflow DevKit step recomputes the exact
 * same row id instead of a fresh random one — that's what makes the
 * upserts below safe to repeat after a partial failure.
 */
export function deterministicId(...parts: Array<string | number>): string {
  const hash = createHash('sha256').update(parts.join(':')).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16),
    ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16) + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join('-');
}

export async function upsertHandRow(
  supabase: SupabaseClient,
  params: {
    tournamentId: string;
    tableId: string;
    handNumber: number;
    buttonSeat: number;
    blindLevel: number;
    smallBlind: number;
    bigBlind: number;
    ante: number;
    rngSeed: string;
  }
): Promise<string> {
  const id = deterministicId('hand', params.tournamentId, params.handNumber);
  const { error } = await supabase
    .from('hands')
    .upsert(
      {
        id,
        tournament_id: params.tournamentId,
        table_id: params.tableId,
        hand_number: params.handNumber,
        button_seat: params.buttonSeat,
        blind_level: params.blindLevel,
        small_blind: params.smallBlind,
        big_blind: params.bigBlind,
        ante: params.ante,
        rng_seed: params.rngSeed,
      },
      { onConflict: 'tournament_id,hand_number', ignoreDuplicates: true }
    );
  if (error) throw new Error(`upsertHandRow: ${error.message}`);
  return id;
}

export async function upsertHandPlayers(supabase: SupabaseClient, handId: string, players: TablePlayer[]): Promise<void> {
  const rows = players.map((p) => ({
    id: deterministicId('hand_player', handId, p.agentId),
    hand_id: handId,
    agent_id: p.agentId,
    seat: p.seat,
    starting_stack: p.stack + p.totalHandContribution,
    hole_cards: p.holeCards,
    is_button: false,
    is_sb: false,
    is_bb: false,
  }));
  const { error } = await supabase.from('hand_players').upsert(rows, { onConflict: 'hand_id,agent_id', ignoreDuplicates: true });
  if (error) throw new Error(`upsertHandPlayers: ${error.message}`);
}

export function makeRecordAction(supabase: SupabaseClient, tournamentId: string, handId: string) {
  return async (action: RecordedAction) => {
    const { error } = await supabase.from('hand_actions').upsert(
      {
        id: deterministicId('hand_action', handId, action.sequenceNumber),
        hand_id: handId,
        tournament_id: tournamentId,
        agent_id: action.agentId,
        betting_round: action.bettingRound === 'showdown' ? 'showdown' : action.bettingRound,
        sequence_number: action.sequenceNumber,
        action_type: action.actionType,
        amount: action.amount,
        pot_after: action.potAfter,
        stack_after: action.stackAfter,
        decision_latency_ms: action.decisionLatencyMs,
        raw_webhook_request: action.rawRequest,
        raw_webhook_response: action.rawResponse,
      },
      { onConflict: 'hand_id,sequence_number', ignoreDuplicates: true }
    );
    if (error) throw new Error(`recordAction: ${error.message}`);
  };
}

export async function completeHandRow(
  supabase: SupabaseClient,
  handId: string,
  board: string[],
  potTotal: number,
  result: unknown
): Promise<void> {
  const { error } = await supabase
    .from('hands')
    .update({ board_cards: board, pot_total: potTotal, result, completed_at: new Date().toISOString() })
    .eq('id', handId);
  if (error) throw new Error(`completeHandRow: ${error.message}`);
}
