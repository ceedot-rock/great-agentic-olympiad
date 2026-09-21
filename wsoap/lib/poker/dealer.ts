import type {
  AgentConfig,
  AgentDecisionRequest,
  BettingRound,
  BlindLevel,
  Card,
  DecisionProvider,
  HandResult,
  RecordedAction,
  TablePlayer,
} from './types';
import { shuffledDeck } from './deck';
import { computeLegalActions, applyAction } from './betting';
import { computeSidePots, distributePot } from './side-pots';
import { determineWinners } from './hand-evaluator';

const ROUNDS: BettingRound[] = ['preflop', 'flop', 'turn', 'river'];

function potTotal(players: TablePlayer[]): number {
  return players.reduce((sum, p) => sum + p.totalHandContribution, 0);
}

function seatsInOrderFrom(players: TablePlayer[], fromSeat: number): TablePlayer[] {
  const sorted = [...players].sort((a, b) => a.seat - b.seat);
  const startIdx = sorted.findIndex((p) => p.seat === fromSeat);
  if (startIdx === -1) {
    // Button seat vacated (its occupant busted a prior hand) — start from the
    // next-highest occupied seat, wrapping around.
    const next = sorted.findIndex((p) => p.seat > fromSeat);
    const idx = next === -1 ? 0 : next;
    return [...sorted.slice(idx), ...sorted.slice(0, idx)];
  }
  return [...sorted.slice(startIdx), ...sorted.slice(0, startIdx)];
}

function nextToAct(players: TablePlayer[], afterSeat: number): TablePlayer | null {
  const order = seatsInOrderFrom(players, afterSeat).filter((p) => p.seat !== afterSeat);
  return order.find((p) => p.status === 'active') ?? null;
}

interface RunBettingRoundParams {
  players: TablePlayer[];
  startSeat: number;
  bigBlind: number;
  bettingRound: BettingRound;
  board: Card[];
  tournamentId: string;
  handId: string;
  decisionProvider: DecisionProvider;
  agentConfigs: Map<string, AgentConfig>;
  nextSequence: () => number;
  recordAction: (action: RecordedAction) => Promise<void>;
}

async function runBettingRound(params: RunBettingRoundParams): Promise<void> {
  const { players, bigBlind, bettingRound, board, tournamentId, handId, decisionProvider, agentConfigs, nextSequence, recordAction } = params;

  for (const p of players) p.currentRoundBet = p.status === 'all_in' ? p.currentRoundBet : 0;

  const liveCount = players.filter((p) => p.status === 'active' || p.status === 'all_in').length;
  if (liveCount < 2) return;

  let currentBet = Math.max(...players.map((p) => p.currentRoundBet), 0);
  let raiseIncrement = bigBlind;
  let acted = new Set<number>();
  let cursor = params.startSeat;
  let firstPass = true;

  while (true) {
    const activePlayers = players.filter((p) => p.status === 'active');
    if (activePlayers.length <= 1) break;

    const allMatched = activePlayers.every((p) => p.currentRoundBet === currentBet && acted.has(p.seat));
    if (!firstPass && allMatched) break;

    const player = firstPass ? players.find((p) => p.seat === cursor && p.status === 'active') ?? nextToAct(players, cursor) : nextToAct(players, cursor);
    firstPass = false;
    if (!player) break;
    cursor = player.seat;

    const minRaiseTotal = currentBet + raiseIncrement;
    const legal = computeLegalActions(player, currentBet, minRaiseTotal);
    if (legal.length === 0) {
      acted.add(player.seat);
      continue;
    }

    const request: AgentDecisionRequest = {
      event: 'action_request',
      event_id: crypto.randomUUID(),
      tournament_id: tournamentId,
      hand_id: handId,
      seat: player.seat,
      hole_cards: player.holeCards,
      community_cards: board,
      betting_round: bettingRound,
      pot_total: potTotal(players),
      current_bet: currentBet,
      min_raise: minRaiseTotal,
      your_stack: player.stack,
      your_current_bet_this_round: player.currentRoundBet,
      players: players.map((p) => ({ seat: p.seat, stack: p.stack, status: p.status, current_bet_this_round: p.currentRoundBet })),
      action_history_this_hand: [],
      legal_actions: legal,
      deadline: new Date(Date.now() + 5000).toISOString(),
    };

    const agentConfig = agentConfigs.get(player.agentId);
    if (!agentConfig) throw new Error(`No agent config for agentId=${player.agentId}`);

    const outcome = await decisionProvider(request, agentConfig);
    const responseIsValid = !outcome.wasTimeoutOrError && outcome.response && legal.includes(outcome.response.action);

    let actionType: RecordedAction['actionType'];
    let applyResult;

    if (responseIsValid && outcome.response) {
      applyResult = applyAction(player, outcome.response.action, outcome.response.amount, currentBet, raiseIncrement);
      actionType = applyResult.actionType;
    } else {
      // Timeout, error, or invalid response: check if legal, else fold — never auto-bet/raise.
      const fallback = legal.includes('check') ? 'check' : 'fold';
      applyResult = applyAction(player, fallback, undefined, currentBet, raiseIncrement);
      actionType = fallback === 'check' ? 'timeout_check' : 'timeout_fold';
    }

    if (applyResult.reopensBetting) {
      acted = new Set([player.seat]);
    } else {
      acted.add(player.seat);
    }
    currentBet = applyResult.newCurrentBet;
    raiseIncrement = applyResult.newRaiseIncrement;

    await recordAction({
      agentId: player.agentId,
      seat: player.seat,
      bettingRound,
      sequenceNumber: nextSequence(),
      actionType,
      amount: applyResult.amountAdded || null,
      potAfter: potTotal(players),
      stackAfter: player.stack,
      decisionLatencyMs: outcome.latencyMs,
      rawRequest: outcome.rawRequest ?? request,
      rawResponse: outcome.rawResponse,
    });
  }
}

export interface PlayHandParams {
  tournamentId: string;
  handId: string;
  players: TablePlayer[];
  buttonSeat: number;
  blindLevel: BlindLevel;
  handSeed: string;
  decisionProvider: DecisionProvider;
  agentConfigs: Map<string, AgentConfig>;
  recordAction: (action: RecordedAction) => Promise<void>;
}

export async function playHand(params: PlayHandParams): Promise<HandResult> {
  const { tournamentId, handId, players, buttonSeat, blindLevel, handSeed, decisionProvider, agentConfigs, recordAction } = params;

  for (const p of players) {
    p.status = 'active';
    p.currentRoundBet = 0;
    p.totalHandContribution = 0;
    p.holeCards = [];
  }

  const deck = shuffledDeck(handSeed);
  let deckIdx = 0;
  const draw = () => deck[deckIdx++];

  const order = seatsInOrderFrom(players, buttonSeat);
  const headsUp = players.length === 2;
  const sbPlayer = headsUp ? order[0] : order[1];
  const bbPlayer = headsUp ? order[1] : order[2];

  let sequence = 0;
  const nextSequence = () => ++sequence;

  // Antes
  if (blindLevel.ante > 0) {
    for (const p of players) {
      const ante = Math.min(blindLevel.ante, p.stack);
      p.stack -= ante;
      p.totalHandContribution += ante;
      await recordAction({
        agentId: p.agentId, seat: p.seat, bettingRound: 'preflop', sequenceNumber: nextSequence(),
        actionType: 'post_ante', amount: ante, potAfter: potTotal(players), stackAfter: p.stack,
        decisionLatencyMs: null, rawRequest: null, rawResponse: null,
      });
    }
  }

  // Blinds
  const sbAmount = Math.min(blindLevel.small_blind, sbPlayer.stack);
  sbPlayer.stack -= sbAmount;
  sbPlayer.currentRoundBet += sbAmount;
  sbPlayer.totalHandContribution += sbAmount;
  if (sbPlayer.stack === 0) sbPlayer.status = 'all_in';
  await recordAction({
    agentId: sbPlayer.agentId, seat: sbPlayer.seat, bettingRound: 'preflop', sequenceNumber: nextSequence(),
    actionType: 'post_sb', amount: sbAmount, potAfter: potTotal(players), stackAfter: sbPlayer.stack,
    decisionLatencyMs: null, rawRequest: null, rawResponse: null,
  });

  const bbAmount = Math.min(blindLevel.big_blind, bbPlayer.stack);
  bbPlayer.stack -= bbAmount;
  bbPlayer.currentRoundBet += bbAmount;
  bbPlayer.totalHandContribution += bbAmount;
  if (bbPlayer.stack === 0) bbPlayer.status = 'all_in';
  await recordAction({
    agentId: bbPlayer.agentId, seat: bbPlayer.seat, bettingRound: 'preflop', sequenceNumber: nextSequence(),
    actionType: 'post_bb', amount: bbAmount, potAfter: potTotal(players), stackAfter: bbPlayer.stack,
    decisionLatencyMs: null, rawRequest: null, rawResponse: null,
  });

  // Deal hole cards, two at a time starting left of button.
  for (let round = 0; round < 2; round++) {
    for (const p of order) p.holeCards.push(draw());
  }

  const board: Card[] = [];
  const preflopStart = headsUp ? sbPlayer.seat : order[3 % order.length].seat;

  for (const bettingRound of ROUNDS) {
    if (players.filter((p) => p.status === 'active' || p.status === 'all_in').length < 2) break;
    if (bettingRound !== 'preflop' && players.filter((p) => p.status === 'active').length < 2) {
      // Everyone but one is all-in: no more betting decisions possible, but
      // remaining board cards still need to be dealt for the eventual showdown.
    }

    if (bettingRound === 'flop') board.push(draw(), draw(), draw());
    if (bettingRound === 'turn' || bettingRound === 'river') board.push(draw());

    const startSeat = bettingRound === 'preflop' ? preflopStart : order[1].seat;

    if (players.filter((p) => p.status === 'active').length >= 2) {
      await runBettingRound({
        players, startSeat, bigBlind: blindLevel.big_blind, bettingRound, board,
        tournamentId, handId, decisionProvider, agentConfigs, nextSequence, recordAction,
      });
    }
  }

  // Deal remaining board cards if the hand ended early via all-ins (so the
  // showdown/result always shows a complete 5-card board, as real broadcasts do).
  while (board.length < 5) board.push(draw());

  const contenders = players.filter((p) => p.status !== 'folded');
  const pots = computeSidePots(players.map((p) => ({ seat: p.seat, totalContribution: p.totalHandContribution, folded: p.status === 'folded' })));

  const potResults: HandResult['pots'] = [];

  if (contenders.length === 1) {
    const winner = contenders[0];
    const amount = pots.reduce((sum, pot) => sum + pot.amount, 0);
    winner.stack += amount;
    potResults.push({ amount, winners: [{ seat: winner.seat, agentId: winner.agentId, amount }] });
  } else {
    for (const pot of pots) {
      const eligible = contenders.filter((p) => pot.eligibleSeats.includes(p.seat));
      const winners = determineWinners(
        eligible.map((p) => ({ agentId: p.agentId, seat: p.seat, holeCards: p.holeCards })),
        board
      );
      const shares = distributePot(pot.amount, winners.map((w) => w.seat), buttonSeat, players.length);
      for (const [seatStr, amount] of Object.entries(shares)) {
        const seat = Number(seatStr);
        const player = players.find((p) => p.seat === seat)!;
        player.stack += amount;
      }
      potResults.push({
        amount: pot.amount,
        winners: winners.map((w) => ({ seat: w.seat, agentId: w.agentId, amount: shares[w.seat], handDescription: w.description })),
      });
    }
  }

  for (const p of players) {
    if (p.stack === 0) p.status = 'eliminated';
  }

  return {
    board,
    pots: potResults,
    finalStacks: Object.fromEntries(players.map((p) => [p.seat, p.stack])),
  };
}
