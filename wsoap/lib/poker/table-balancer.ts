export const MAX_SEATS_PER_TABLE = 9;

export interface BalancerTable {
  tableId: string;
  /** agentIds currently seated at this table (eliminated players already removed by the caller). */
  agentIds: string[];
}

export interface RebalanceMove {
  agentId: string;
  fromTableId: string;
  toTableId: string;
}

export interface RebalanceResult {
  moves: RebalanceMove[];
  tablesToClose: string[];
}

/**
 * Standard MTT balancing, run between hands (never mid-hand): break the
 * shortest table when the field can fit in fewer tables, redistributing its
 * players one at a time to whichever remaining table has the fewest players;
 * otherwise nudge players from the fullest table to the shortest until every
 * table is within one seat of the others. Consolidates to a single final
 * table once the whole field fits at MAX_SEATS_PER_TABLE.
 */
export function planRebalance(tables: BalancerTable[]): RebalanceResult {
  const working = tables
    .filter((t) => t.agentIds.length > 0)
    .map((t) => ({ tableId: t.tableId, agentIds: [...t.agentIds] }));

  const moves: RebalanceMove[] = [];
  const tablesToClose: string[] = [];

  const totalPlayers = working.reduce((sum, t) => sum + t.agentIds.length, 0);
  if (totalPlayers === 0 || working.length <= 1) return { moves, tablesToClose };

  const idealTableCount = Math.max(1, Math.ceil(totalPlayers / MAX_SEATS_PER_TABLE));

  const closeShortestAndRedistribute = () => {
    working.sort((a, b) => a.agentIds.length - b.agentIds.length);
    const shortest = working[0];
    const rest = working.slice(1);
    if (rest.length === 0) return false;

    for (const agentId of shortest.agentIds) {
      rest.sort((a, b) => a.agentIds.length - b.agentIds.length);
      const dest = rest[0];
      dest.agentIds.push(agentId);
      moves.push({ agentId, fromTableId: shortest.tableId, toTableId: dest.tableId });
    }
    tablesToClose.push(shortest.tableId);
    working.splice(working.indexOf(shortest), 1);
    return true;
  };

  while (working.length > idealTableCount) {
    if (!closeShortestAndRedistribute()) break;
  }

  // Fine-balance pass: move single players from the fullest to the emptiest
  // table until every remaining table is within one seat of the others.
  let guard = 0;
  while (guard++ < 1000) {
    working.sort((a, b) => b.agentIds.length - a.agentIds.length);
    const fullest = working[0];
    const emptiest = working[working.length - 1];
    if (working.length < 2 || fullest.agentIds.length - emptiest.agentIds.length <= 1) break;

    const agentId = fullest.agentIds.pop()!;
    emptiest.agentIds.push(agentId);
    moves.push({ agentId, fromTableId: fullest.tableId, toTableId: emptiest.tableId });
  }

  return { moves, tablesToClose };
}

export interface BalancerPlayer {
  agentId: string;
  tableId: string;
  seat: number;
  stack: number;
}

export function groupPlayersForBalancer(players: BalancerPlayer[]): BalancerTable[] {
  const byTable = new Map<string, string[]>();
  for (const p of players) {
    if (p.stack <= 0) continue;
    if (!byTable.has(p.tableId)) byTable.set(p.tableId, []);
    byTable.get(p.tableId)!.push(p.agentId);
  }
  return [...byTable.entries()].map(([tableId, agentIds]) => ({ tableId, agentIds }));
}

export function applyMoves<T extends BalancerPlayer>(players: T[], moves: RebalanceMove[]): T[] {
  const moveByAgent = new Map(moves.map((m) => [m.agentId, m]));
  return players.map((p) => {
    const move = moveByAgent.get(p.agentId);
    return move ? { ...p, tableId: move.toTableId } : p;
  });
}

/**
 * After moves are applied, a moved player still carries their old seat
 * number, which may collide with an existing occupant at the destination
 * table. Re-assigns the lowest free seat at each table for anyone whose
 * seat is already taken.
 */
export function reassignSeatsAfterMoves<T extends BalancerPlayer>(players: T[]): T[] {
  const byTable = new Map<string, T[]>();
  for (const p of players) {
    if (!byTable.has(p.tableId)) byTable.set(p.tableId, []);
    byTable.get(p.tableId)!.push(p);
  }

  const result: T[] = [];
  for (const [, tablePlayers] of byTable) {
    const usedSeats = new Set<number>();
    for (const p of tablePlayers) {
      let seat = p.seat;
      if (usedSeats.has(seat)) {
        seat = 0;
        while (usedSeats.has(seat)) seat++;
      }
      usedSeats.add(seat);
      result.push({ ...p, seat });
    }
  }
  return result;
}
