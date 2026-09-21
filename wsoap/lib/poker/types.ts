export type Suit = 's' | 'h' | 'd' | 'c';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';

/** pokersolver card notation, e.g. "Ah", "Td", "2c". */
export type Card = string;

export type BettingRound = 'preflop' | 'flop' | 'turn' | 'river';

export type PlayerStatus = 'active' | 'folded' | 'all_in' | 'eliminated' | 'sitting_out';

export interface BlindLevel {
  level: number;
  small_blind: number;
  big_blind: number;
  ante: number;
  duration_hands: number;
}

export interface TablePlayer {
  agentId: string;
  seat: number;
  stack: number;
  status: PlayerStatus;
  /** Chips this player has put in during the current betting round. */
  currentRoundBet: number;
  /** Chips this player has put in during the whole hand (for side-pot math). */
  totalHandContribution: number;
  holeCards: Card[];
}

export type ActionType =
  | 'post_sb'
  | 'post_bb'
  | 'post_ante'
  | 'fold'
  | 'check'
  | 'call'
  | 'bet'
  | 'raise'
  | 'all_in'
  | 'timeout_fold'
  | 'timeout_check';

export interface RecordedAction {
  agentId: string;
  seat: number;
  bettingRound: BettingRound | 'showdown';
  sequenceNumber: number;
  actionType: ActionType;
  amount: number | null;
  potAfter: number;
  stackAfter: number;
  decisionLatencyMs: number | null;
  rawRequest: unknown;
  rawResponse: unknown;
}

export type LegalAction = 'fold' | 'check' | 'call' | 'raise' | 'all_in';

export interface AgentDecisionRequest {
  event: 'action_request';
  event_id: string;
  tournament_id: string;
  hand_id: string;
  seat: number;
  hole_cards: Card[];
  community_cards: Card[];
  betting_round: BettingRound;
  pot_total: number;
  current_bet: number;
  min_raise: number;
  your_stack: number;
  your_current_bet_this_round: number;
  players: Array<{
    seat: number;
    stack: number;
    status: PlayerStatus;
    current_bet_this_round: number;
  }>;
  action_history_this_hand: Array<{
    seat: number;
    action: ActionType;
    amount: number | null;
    round: BettingRound;
  }>;
  legal_actions: LegalAction[];
  deadline: string;
}

export interface AgentDecisionResponse {
  action: LegalAction;
  amount?: number;
  agent_note?: string;
}

export interface DecisionOutcome {
  response: AgentDecisionResponse | null;
  wasTimeoutOrError: boolean;
  latencyMs: number;
  rawRequest: unknown;
  rawResponse: unknown;
}

/**
 * Preset strategy parameters for `decision_mode = 'preset'` agents.
 * lib/poker/strategy.ts evaluates these entirely in-process — no HTTP call
 * per decision — which is what lets a 100-agent field run without an
 * external call per decision multiplied across every hand and every agent.
 * All values are 0..1 unless noted.
 */
export interface StrategyParams {
  /** Willingness to bet/raise vs. check/call at a given hand strength. */
  aggression: number;
  /** How strong a hand needs to be, relatively, before continuing in a pot. */
  tightness: number;
  /** Chance of raising/betting with a weak hand as a bluff. */
  bluffFrequency: number;
  /** Typical bet size as a fraction of the pot (e.g. 0.5 = half-pot bets). */
  betSizing: number;
  /** Willingness to call an all-in / commit the rest of the stack. */
  callDownTendency: number;
}

export type DecisionMode = 'preset' | 'webhook';

export interface AgentConfig {
  agentId: string;
  decisionMode: DecisionMode;
  strategyParams: StrategyParams | null;
  webhookUrl: string | null;
  webhookSecret: string | null;
}

/**
 * The poker engine calls this to get a live decision for a seated agent.
 * Kept as an injected dependency (rather than poker/ importing webhook/ or
 * strategy/ directly) so the game engine has no hard dependency on HTTP or
 * decision-mode concerns and can be exercised in isolation (unit tests,
 * simulated agents). The concrete implementation (lib/tournament/) dispatches
 * to lib/poker/strategy.ts for 'preset' agents (synchronous, no I/O) or
 * lib/webhook/client.ts for 'webhook' agents (HTTP, signed, timeout-guarded).
 */
export type DecisionProvider = (request: AgentDecisionRequest, agent: AgentConfig) => Promise<DecisionOutcome>;

export interface SidePot {
  amount: number;
  eligibleSeats: number[];
}

export interface HandResult {
  board: Card[];
  pots: Array<{
    amount: number;
    winners: Array<{ seat: number; agentId: string; amount: number; handDescription?: string }>;
  }>;
  finalStacks: Record<number, number>;
}
