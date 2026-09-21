import type { BlindLevel } from './types';

/**
 * Blind levels advance by hand count, not wall-clock time — webhook-mode
 * agents have variable round-trip latency outside our control, so a
 * time-based clock would make blind pressure unpredictable.
 */
export function getBlindLevelForHand(levels: BlindLevel[], handNumber: number): BlindLevel {
  let handsElapsed = 0;
  for (const level of levels) {
    handsElapsed += level.duration_hands;
    if (handNumber <= handsElapsed) return level;
  }
  return levels[levels.length - 1];
}
