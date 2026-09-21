import pokersolver from 'pokersolver';
import type { Card } from './types';

// pokersolver is CommonJS with no ESM named exports; destructure at runtime.
const { Hand } = pokersolver as unknown as {
  Hand: {
    solve(cards: string[]): PokersolverHand;
    winners(hands: PokersolverHand[]): PokersolverHand[];
  };
};

export interface PokersolverHand {
  cards: unknown[];
  name: string;
  descr: string;
  rank: number;
}

export interface EvaluatedHand {
  agentId: string;
  seat: number;
  handle: PokersolverHand;
  description: string;
}

/** Best 5-card hand out of hole cards + board (2-7 cards total). */
export function evaluateBestHand(holeCards: Card[], board: Card[]): PokersolverHand {
  return Hand.solve([...holeCards, ...board]);
}

/**
 * Showdown among all still-live players. Returns the subset that won —
 * pokersolver's `winners()` already handles ties/chops correctly.
 */
export function determineWinners(
  players: Array<{ agentId: string; seat: number; holeCards: Card[] }>,
  board: Card[]
): EvaluatedHand[] {
  const evaluated: EvaluatedHand[] = players.map((p) => {
    const handle = evaluateBestHand(p.holeCards, board);
    return { agentId: p.agentId, seat: p.seat, handle, description: handle.descr };
  });

  const winningHandles = Hand.winners(evaluated.map((e) => e.handle));
  return evaluated.filter((e) => winningHandles.includes(e.handle));
}

/** 0..1 relative strength estimate, used by the preset-strategy evaluator. pokersolver's `rank` tops out around 9 (straight flush / royal). */
export function handStrength01(holeCards: Card[], board: Card[]): number {
  const handle = evaluateBestHand(holeCards, board);
  return Math.min(1, Math.max(0, handle.rank / 9));
}
