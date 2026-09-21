import { createHook } from 'workflow';
import type { AgentConfig, BlindLevel, TablePlayer } from '../poker/types';
import { playHand } from '../poker/dealer';
import { getBlindLevelForHand } from '../poker/blinds';
import { generateHandSeed } from '../poker/rng';
import {
  MAX_SEATS_PER_TABLE,
  planRebalance,
  groupPlayersForBalancer,
  applyMoves,
  reassignSeatsAfterMoves,
  type BalancerPlayer,
} from '../poker/table-balancer';
import { resolveAgentDecision } from './decision-provider';
import { createServiceRoleClient } from '../supabase/server';
import { getCurrentPotCents } from '../donations/pot-period';
import { upsertHandRow, upsertHandPlayers, makeRecordAction, completeHandRow, deterministicId } from './persist';

interface WorkflowPlayer extends BalancerPlayer {}

interface TournamentInit {
  players: WorkflowPlayer[];
  agentConfigs: Record<string, AgentConfig>;
  blindLevels: BlindLevel[];
  potSnapshotCents: number;
}

async function initializeTournament(tournamentId: string): Promise<TournamentInit> {
  'use step';
  const supabase = createServiceRoleClient();

  const { data: tournament, error: tErr } = await supabase.from('tournaments').select('*').eq('id', tournamentId).single();
  if (tErr || !tournament) throw new Error(`initializeTournament: tournament not found (${tErr?.message})`);

  const { data: entries, error: eErr } = await supabase
    .from('tournament_entries')
    .select('agent_id, agents(id, decision_mode, strategy_params, webhook_url, webhook_secret)')
    .eq('tournament_id', tournamentId)
    .eq('status', 'registered');
  if (eErr || !entries) throw new Error(`initializeTournament: entries fetch failed (${eErr?.message})`);

  const numTables = Math.max(1, Math.ceil(entries.length / MAX_SEATS_PER_TABLE));
  const tableIds = Array.from({ length: numTables }, (_, i) => deterministicId('table', tournamentId, i));

  const { error: ttErr } = await supabase
    .from('tournament_tables')
    .upsert(
      tableIds.map((id, i) => ({ id, tournament_id: tournamentId, table_number: i + 1, is_active: true })),
      { onConflict: 'tournament_id,table_number', ignoreDuplicates: true }
    );
  if (ttErr) throw new Error(`initializeTournament: table create failed (${ttErr.message})`);

  const players: WorkflowPlayer[] = [];
  const agentConfigs: Record<string, AgentConfig> = {};
  const seatCounters: Record<string, number> = Object.fromEntries(tableIds.map((id) => [id, 0]));

  entries.forEach((entry: any, idx: number) => {
    const tableId = tableIds[idx % numTables];
    const seat = seatCounters[tableId]++;
    players.push({ agentId: entry.agent_id, seat, tableId, stack: tournament.starting_stack });

    const a = entry.agents;
    agentConfigs[entry.agent_id] = {
      agentId: entry.agent_id,
      decisionMode: a.decision_mode,
      strategyParams: a.strategy_params,
      webhookUrl: a.webhook_url,
      webhookSecret: a.webhook_secret,
    };
  });

  const { error: seatErr } = await supabase
    .from('tournament_entries')
    .upsert(
      players.map((p) => ({ tournament_id: tournamentId, agent_id: p.agentId, table_id: p.tableId, seat_number: p.seat, status: 'active' })),
      { onConflict: 'tournament_id,agent_id' }
    );
  if (seatErr) throw new Error(`initializeTournament: seat assignment failed (${seatErr.message})`);

  const potSnapshotCents = await getCurrentPotCents(supabase);

  const { error: startErr } = await supabase
    .from('tournaments')
    .update({ status: 'in_progress', started_at: new Date().toISOString(), pot_snapshot_cents: potSnapshotCents })
    .eq('id', tournamentId);
  if (startErr) throw new Error(`initializeTournament: tournament start failed (${startErr.message})`);

  return { players, agentConfigs, blindLevels: tournament.blind_levels as BlindLevel[], potSnapshotCents };
}

async function playHandStep(
  tournamentId: string,
  handNumber: number,
  tableId: string,
  tablePlayers: WorkflowPlayer[],
  buttonSeat: number,
  blindLevels: BlindLevel[],
  agentConfigs: Record<string, AgentConfig>
): Promise<WorkflowPlayer[]> {
  'use step';
  const supabase = createServiceRoleClient();
  const blindLevel = getBlindLevelForHand(blindLevels, handNumber);
  const handSeed = generateHandSeed();

  // Explicit TablePlayer[] annotation (not inferred) so `status` is typed as
  // the full PlayerStatus union — playHand mutates these objects' status
  // in place, so a narrower inferred literal type would make TS think
  // `status` could never become anything but 'active'.
  const dealerPlayers: TablePlayer[] = tablePlayers.map((p) => ({
    agentId: p.agentId,
    seat: p.seat,
    stack: p.stack,
    status: 'active',
    currentRoundBet: 0,
    totalHandContribution: 0,
    holeCards: [],
  }));

  const handId = await upsertHandRow(supabase, {
    tournamentId,
    tableId,
    handNumber,
    buttonSeat,
    blindLevel: blindLevel.level,
    smallBlind: blindLevel.small_blind,
    bigBlind: blindLevel.big_blind,
    ante: blindLevel.ante,
    rngSeed: handSeed,
  });

  const agentConfigMap = new Map(Object.entries(agentConfigs));
  const recordAction = makeRecordAction(supabase, tournamentId, handId);

  const result = await playHand({
    tournamentId,
    handId,
    players: dealerPlayers,
    buttonSeat,
    blindLevel,
    handSeed,
    decisionProvider: resolveAgentDecision,
    agentConfigs: agentConfigMap,
    recordAction,
  });

  await upsertHandPlayers(supabase, handId, dealerPlayers);
  const potTotalAmount = result.pots.reduce((sum, pot) => sum + pot.amount, 0);
  await completeHandRow(supabase, handId, result.board, potTotalAmount, result);

  const eliminated = dealerPlayers.filter((p) => p.status === 'eliminated');
  if (eliminated.length > 0) {
    // NOTE: finishing_place is derived from a count-then-update pattern, not
    // a single atomic operation. If two different tables eliminate players
    // in the very same round concurrently, their exact placement numbers
    // could rarely be off by one relative to each other. This only affects
    // cosmetic leaderboard ordering, never the payout/charity/donation
    // paths, so it's an accepted MVP simplification rather than a
    // compliance-relevant bug.
    const { count } = await supabase
      .from('tournament_entries')
      .select('agent_id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
      .eq('status', 'active');
    let place = count ?? eliminated.length;
    for (const p of eliminated) {
      await supabase
        .from('tournament_entries')
        .update({ status: 'eliminated', eliminated_at: new Date().toISOString(), final_stack: 0, finishing_place: place })
        .eq('tournament_id', tournamentId)
        .eq('agent_id', p.agentId);
      place -= 1;
    }
  }

  return dealerPlayers.map((p) => ({ agentId: p.agentId, seat: p.seat, tableId, stack: p.stack }));
}

async function persistRebalanceStep(tournamentId: string, players: WorkflowPlayer[], tablesToClose: string[]): Promise<void> {
  'use step';
  const supabase = createServiceRoleClient();

  if (players.length > 0) {
    const { error } = await supabase
      .from('tournament_entries')
      .upsert(
        players.map((p) => ({ tournament_id: tournamentId, agent_id: p.agentId, table_id: p.tableId, seat_number: p.seat, status: 'active' })),
        { onConflict: 'tournament_id,agent_id' }
      );
    if (error) throw new Error(`persistRebalanceStep: ${error.message}`);
  }

  if (tablesToClose.length > 0) {
    const { error } = await supabase.from('tournament_tables').update({ is_active: false }).in('id', tablesToClose);
    if (error) throw new Error(`persistRebalanceStep(tables): ${error.message}`);
  }
}

async function finalizeTournamentStep(tournamentId: string, winnerAgentId: string): Promise<void> {
  'use step';
  const supabase = createServiceRoleClient();

  const { error: tErr } = await supabase
    .from('tournaments')
    .update({ status: 'completed', completed_at: new Date().toISOString(), winner_agent_id: winnerAgentId })
    .eq('id', tournamentId);
  if (tErr) throw new Error(`finalizeTournamentStep: ${tErr.message}`);

  const { error: eErr } = await supabase
    .from('tournament_entries')
    .update({ finishing_place: 1 })
    .eq('tournament_id', tournamentId)
    .eq('agent_id', winnerAgentId);
  if (eErr) throw new Error(`finalizeTournamentStep(entry): ${eErr.message}`);

  const season = `wsoap-${new Date().toISOString().slice(0, 7)}`;
  const { error: bErr } = await supabase.from('agent_badges').upsert(
    { id: deterministicId('badge', tournamentId, winnerAgentId), agent_id: winnerAgentId, badge_type: 'platinum_tag', season, tournament_id: tournamentId },
    { onConflict: 'agent_id,tournament_id,badge_type', ignoreDuplicates: true }
  );
  if (bErr) throw new Error(`finalizeTournamentStep(badge): ${bErr.message}`);
}

async function recordPayoutSelectionStep(tournamentId: string, charityId: string, selectedBy: string, amountCents: number): Promise<void> {
  'use step';
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from('payouts').upsert(
    { id: deterministicId('payout', tournamentId), tournament_id: tournamentId, charity_id: charityId, selected_by: selectedBy, amount_cents: amountCents, status: 'pending' },
    { onConflict: 'tournament_id', ignoreDuplicates: true }
  );
  if (error) throw new Error(`recordPayoutSelectionStep: ${error.message}`);
}

async function flagCharitySelectionOverdueStep(tournamentId: string): Promise<void> {
  'use step';
  const supabase = createServiceRoleClient();
  // No payouts row exists yet; admins can see this from tournaments.status =
  // 'completed' with no matching payouts row and follow up manually. Kept as
  // a distinct, named step (rather than silently doing nothing) so it shows
  // up in workflow run history if this path is ever hit.
  await supabase.from('tournaments').select('id').eq('id', tournamentId).single();
}

/**
 * Entry point: runs one WSOAP tournament end-to-end. Triggered manually via
 * the admin "Start Tournament" button for MVP; a Phase 2 cron route calls
 * the exact same workflow. See /home/ceedotrock/.claude/plans/dazzling-petting-cat.md
 * for the full design rationale (free entry, donation-funded pot, charity
 * whitelist, preset-vs-webhook decision modes).
 */
export async function runTournamentWorkflow(tournamentId: string) {
  'use workflow';

  const init = await initializeTournament(tournamentId);
  let players = init.players;
  const buttonSeats: Record<string, number> = {};
  for (const p of players) {
    if (!(p.tableId in buttonSeats) || p.seat < buttonSeats[p.tableId]) buttonSeats[p.tableId] = p.seat;
  }

  let handNumber = 0;

  while (players.filter((p) => p.stack > 0).length > 1) {
    handNumber += 1;

    const byTable = new Map<string, WorkflowPlayer[]>();
    for (const p of players) {
      if (p.stack <= 0) continue;
      if (!byTable.has(p.tableId)) byTable.set(p.tableId, []);
      byTable.get(p.tableId)!.push(p);
    }

    const playableTableIds = [...byTable.keys()].filter((tid) => byTable.get(tid)!.length >= 2);

    const handResults = await Promise.all(
      playableTableIds.map((tableId) => {
        const tablePlayers = byTable.get(tableId)!;
        const button = buttonSeats[tableId] ?? tablePlayers[0].seat;
        return playHandStep(tournamentId, handNumber, tableId, tablePlayers, button, init.blindLevels, init.agentConfigs);
      })
    );

    const updatedByAgent = new Map<string, WorkflowPlayer>();
    for (const tableResult of handResults) {
      for (const p of tableResult) updatedByAgent.set(p.agentId, p);
    }
    players = players.map((p) => updatedByAgent.get(p.agentId) ?? p);

    for (const tableId of playableTableIds) {
      const seatsAtTable = players.filter((p) => p.tableId === tableId && p.stack > 0).map((p) => p.seat).sort((a, b) => a - b);
      if (seatsAtTable.length === 0) continue;
      const currentButton = buttonSeats[tableId] ?? seatsAtTable[0];
      buttonSeats[tableId] = seatsAtTable.find((s) => s > currentButton) ?? seatsAtTable[0];
    }

    const { moves, tablesToClose } = planRebalance(groupPlayersForBalancer(players));
    if (moves.length > 0 || tablesToClose.length > 0) {
      players = reassignSeatsAfterMoves(applyMoves(players, moves));
      await persistRebalanceStep(tournamentId, players, tablesToClose);
    }
  }

  const winner = players.find((p) => p.stack > 0);
  if (!winner) throw new Error('runTournamentWorkflow: no winner determined');

  await finalizeTournamentStep(tournamentId, winner.agentId);

  // Suspends here — resumed by POST /api/tournaments/[id]/select-charity
  // calling resumeHook(`charity:${tournamentId}`, { charityId, selectedBy }).
  // No auto-timeout yet: combining sleep() with a hook race needs
  // verification against the installed package's docs
  // (node_modules/workflow/docs/foundations/hooks.mdx) before relying on it;
  // for now an admin follows up manually if a winner never selects a
  // charity (visible as a completed tournament with no payouts row).
  const hook = createHook<{ charityId: string; selectedBy: string }>({ token: `charity:${tournamentId}` });
  const selection = await hook;

  await recordPayoutSelectionStep(tournamentId, selection.charityId, selection.selectedBy, init.potSnapshotCents);

  return { winnerAgentId: winner.agentId };
}
