import type { ActionType, LegalAction, TablePlayer } from './types';

/**
 * `amount` for a 'raise' action means the TOTAL round-bet the player is
 * raising TO (e.g. "raise to 400"), not an incremental amount on top of the
 * current bet — this matches how `min_raise` is expressed in the webhook
 * contract and to preset-strategy agents (both are absolute bet-to levels,
 * not deltas), which avoids the classic off-by-the-blind ambiguity.
 */

export function computeLegalActions(player: TablePlayer, currentBet: number, minRaiseTotal: number): LegalAction[] {
  if (player.status !== 'active') return [];
  const toCall = currentBet - player.currentRoundBet;
  const actions: LegalAction[] = ['fold'];

  if (toCall <= 0) {
    actions.push('check');
  } else {
    actions.push('call');
  }

  if (player.stack > Math.max(toCall, 0) && player.currentRoundBet + player.stack > minRaiseTotal) {
    actions.push('raise');
  }
  if (player.stack > 0) {
    actions.push('all_in');
  }
  return actions;
}

export interface ApplyActionResult {
  actionType: ActionType;
  amountAdded: number;
  newCurrentBet: number;
  newRaiseIncrement: number;
  /** True if other players who already matched the current bet must act again. */
  reopensBetting: boolean;
}

export function applyAction(
  player: TablePlayer,
  requested: LegalAction,
  requestedAmount: number | undefined,
  currentBet: number,
  raiseIncrement: number
): ApplyActionResult {
  const toCall = Math.max(0, currentBet - player.currentRoundBet);

  if (requested === 'fold') {
    player.status = 'folded';
    return { actionType: 'fold', amountAdded: 0, newCurrentBet: currentBet, newRaiseIncrement: raiseIncrement, reopensBetting: false };
  }

  if (requested === 'check') {
    return { actionType: 'check', amountAdded: 0, newCurrentBet: currentBet, newRaiseIncrement: raiseIncrement, reopensBetting: false };
  }

  if (requested === 'call') {
    const amount = Math.min(toCall, player.stack);
    player.stack -= amount;
    player.currentRoundBet += amount;
    player.totalHandContribution += amount;
    const wentAllIn = player.stack === 0;
    if (wentAllIn) player.status = 'all_in';
    return {
      actionType: wentAllIn ? 'all_in' : 'call',
      amountAdded: amount,
      newCurrentBet: currentBet,
      newRaiseIncrement: raiseIncrement,
      reopensBetting: false,
    };
  }

  // raise or all_in: `requestedAmount` is the bet-to total for a raise;
  // ignored (full stack used) for an explicit all_in.
  const maxReachableTotal = player.currentRoundBet + player.stack;
  const requestedTotal = requested === 'all_in' ? maxReachableTotal : Math.min(requestedAmount ?? currentBet, maxReachableTotal);
  const clampedTotal = Math.max(currentBet, Math.min(requestedTotal, maxReachableTotal));

  const amount = clampedTotal - player.currentRoundBet;
  player.stack -= amount;
  player.currentRoundBet = clampedTotal;
  player.totalHandContribution += amount;

  const wentAllIn = player.stack === 0;
  if (wentAllIn) player.status = 'all_in';

  const raiseSize = clampedTotal - currentBet;
  const isFullRaise = raiseSize >= raiseIncrement;

  return {
    actionType: wentAllIn ? 'all_in' : 'raise',
    amountAdded: amount,
    newCurrentBet: clampedTotal,
    // A short all-in (less than a full raise) doesn't establish a new legal
    // raise size — the next real raise still has to clear the prior increment.
    newRaiseIncrement: isFullRaise ? raiseSize : raiseIncrement,
    reopensBetting: isFullRaise,
  };
}
