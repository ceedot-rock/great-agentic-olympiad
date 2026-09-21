import type { Card, Rank, Suit } from './types';
import { shuffle } from './rng';

const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS: Suit[] = ['s', 'h', 'd', 'c'];

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      deck.push(`${rank}${suit}`);
    }
  }
  return deck;
}

export function shuffledDeck(handSeed: string): Card[] {
  return shuffle(buildDeck(), handSeed);
}
