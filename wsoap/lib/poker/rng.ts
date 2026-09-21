import { randomBytes } from 'crypto';

/** 32-byte hex seed, stored on the `hands` row for full deterministic replay. */
export function generateHandSeed(): string {
  return randomBytes(32).toString('hex');
}

/** mulberry32 — small, fast, deterministic PRNG seeded from a 32-bit int. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Folds a hex seed down to a 32-bit int to drive mulberry32. */
function seedToInt(hexSeed: string): number {
  let h = 0;
  for (let i = 0; i < hexSeed.length; i += 8) {
    const chunk = parseInt(hexSeed.slice(i, i + 8), 16) || 0;
    h = (h ^ chunk) >>> 0;
  }
  return h;
}

export function createRng(hexSeed: string): () => number {
  return mulberry32(seedToInt(hexSeed));
}

/** Fisher-Yates shuffle, deterministic given the same seed. */
export function shuffle<T>(items: T[], hexSeed: string): T[] {
  const rng = createRng(hexSeed);
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
