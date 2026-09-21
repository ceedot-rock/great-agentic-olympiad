import type { SidePot } from './types';

interface Contribution {
  seat: number;
  totalContribution: number;
  folded: boolean;
}

/**
 * Standard side-pot layering: repeatedly peel off the smallest remaining
 * contribution level as one pot layer, shared by everyone who put in at
 * least that much and hasn't folded. Handles any number of simultaneous
 * all-ins at different stack depths.
 */
export function computeSidePots(players: Contribution[]): SidePot[] {
  const remaining = players.filter((p) => p.totalContribution > 0).map((p) => ({ ...p }));
  const pots: SidePot[] = [];

  while (remaining.some((p) => p.totalContribution > 0)) {
    const active = remaining.filter((p) => p.totalContribution > 0);
    const minContribution = Math.min(...active.map((p) => p.totalContribution));

    let amount = 0;
    const eligibleSeats: number[] = [];
    for (const p of active) {
      amount += minContribution;
      p.totalContribution -= minContribution;
      if (!p.folded) eligibleSeats.push(p.seat);
    }

    pots.push({ amount, eligibleSeats });
  }

  return pots;
}

/**
 * Split `amount` equally among `winnerSeats`; any odd remainder chips go to
 * winners seated closest to (clockwise from) the button, the standard
 * poker convention for indivisible pots.
 */
export function distributePot(
  amount: number,
  winnerSeats: number[],
  buttonSeat: number,
  totalSeats: number
): Record<number, number> {
  const share = Math.floor(amount / winnerSeats.length);
  let remainder = amount - share * winnerSeats.length;

  const distanceFromButton = (seat: number) => (seat - buttonSeat + totalSeats) % totalSeats;
  const ordered = [...winnerSeats].sort((a, b) => distanceFromButton(a) - distanceFromButton(b));

  const result: Record<number, number> = {};
  for (const seat of ordered) {
    result[seat] = share + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
  }
  return result;
}
