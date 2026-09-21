import type { AgentDecisionRequest, AgentDecisionResponse, Card, LegalAction, StrategyParams } from './types';
import { handStrength01 } from './hand-evaluator';
import { createRng } from './rng';

const RANK_VALUE: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};

/**
 * Simplified Chen-formula-style preflop hand strength (0..1). pokersolver
 * needs 5+ cards to evaluate a hand, so preflop (2 hole cards, no board)
 * needs its own heuristic rather than handStrength01.
 */
function preflopStrength01(holeCards: Card[]): number {
  const [c1, c2] = holeCards;
  const r1 = RANK_VALUE[c1[0]];
  const r2 = RANK_VALUE[c2[0]];
  const suited = c1[1] === c2[1];
  const isPair = r1 === r2;
  const high = Math.max(r1, r2);
  const low = Math.min(r1, r2);
  const gap = high - low - 1;

  let points = high === 14 ? 10 : high === 13 ? 8 : high === 12 ? 7 : high === 11 ? 6 : high / 2;

  if (isPair) points = Math.max(5, points * 2);
  if (suited) points += 2;
  if (!isPair) {
    if (gap === 0) points += 1;
    else if (gap === 1) points -= 1;
    else if (gap === 2) points -= 2;
    else if (gap === 3) points -= 4;
    else if (gap >= 4) points -= 5;
    if (gap <= 1 && high < 12) points += 1;
  }

  return Math.min(1, Math.max(0, points / 20));
}

function estimateStrength(request: AgentDecisionRequest): number {
  return request.community_cards.length >= 3
    ? handStrength01(request.hole_cards, request.community_cards)
    : preflopStrength01(request.hole_cards);
}

function clampToLegal(action: LegalAction, legal: LegalAction[], fallback: LegalAction): LegalAction {
  return legal.includes(action) ? action : fallback;
}

/**
 * Fully local, synchronous, zero-I/O decision function for
 * `decision_mode = 'preset'` agents — this is what lets the field scale to
 * 100 agents without a per-decision HTTP call. Deterministic given the same
 * decisionSeed, so results are reproducible for replay/audit.
 */
export function evaluatePresetDecision(
  request: AgentDecisionRequest,
  params: StrategyParams,
  decisionSeed: string
): AgentDecisionResponse {
  const rng = createRng(decisionSeed);
  const strength = estimateStrength(request);
  const toCall = request.current_bet - request.your_current_bet_this_round;
  const potOddsFactor = toCall > 0 ? Math.min(1, request.pot_total / (request.pot_total + toCall)) : 1;

  const requiredStrength = params.tightness * 0.5 * (1 - potOddsFactor * 0.6);
  const isBluffing = strength < requiredStrength && rng() < params.bluffFrequency;
  const willingToProceed = strength >= requiredStrength || isBluffing;

  const legal = request.legal_actions;

  if (!willingToProceed) {
    if (toCall <= 0) return { action: clampToLegal('check', legal, 'fold') };
    return { action: clampToLegal('fold', legal, 'check') };
  }

  // Big all-in call decision: proceed if callDownTendency + strength clears
  // how much of the stack the call represents.
  const callCommitsFraction = request.your_stack > 0 ? Math.min(1, toCall / request.your_stack) : 1;
  if (toCall > 0 && callCommitsFraction > 0.5 && !legal.includes('raise')) {
    const willCall = strength + params.callDownTendency * 0.5 >= callCommitsFraction || isBluffing;
    if (!willCall) return { action: clampToLegal('fold', legal, 'check') };
  }

  const effectiveAggressionRoll = rng();
  const wantsToRaise = legal.includes('raise') && effectiveAggressionRoll < params.aggression * (isBluffing ? 0.8 : strength + 0.15);

  if (wantsToRaise) {
    const raiseSizeAbovePot = Math.max(request.min_raise - request.current_bet, Math.round(request.pot_total * params.betSizing));
    const proposedTotal = request.current_bet + raiseSizeAbovePot;
    const clampedTotal = Math.max(request.min_raise, Math.min(proposedTotal, request.your_current_bet_this_round + request.your_stack));

    const goingAllIn = clampedTotal >= request.your_current_bet_this_round + request.your_stack;
    if (goingAllIn) {
      return { action: clampToLegal('all_in', legal, 'raise'), agent_note: isBluffing ? 'pushing' : undefined };
    }
    return { action: clampToLegal('raise', legal, 'call'), amount: clampedTotal };
  }

  if (toCall <= 0) return { action: clampToLegal('check', legal, 'fold') };
  return { action: clampToLegal('call', legal, 'fold') };
}
