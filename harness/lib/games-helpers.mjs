import { makeRng } from "./rng.mjs";

export { makeRng };

export function shortestPath(nodes, edges, start, goal) {
  const dist = new Map(nodes.map((n) => [n, Infinity]));
  const prev = new Map();
  dist.set(start, 0);
  const queue = new Set(nodes);
  while (queue.size) {
    let u = null;
    for (const n of queue) if (u === null || dist.get(n) < dist.get(u)) u = n;
    if (u === null || dist.get(u) === Infinity) break;
    queue.delete(u);
    if (u === goal) break;
    for (const e of edges) {
      if (e.from !== u || !queue.has(e.to)) continue;
      const alt = dist.get(u) + Number(e.cost);
      if (alt < dist.get(e.to)) {
        dist.set(e.to, alt);
        prev.set(e.to, u);
      }
    }
  }
  if (dist.get(goal) === Infinity) return null;
  const path = [goal];
  let cur = goal;
  while (cur !== start) {
    cur = prev.get(cur);
    if (!cur) return null;
    path.unshift(cur);
  }
  return { path, cost: dist.get(goal) };
}

/**
 * Connected graph with a guaranteed S->E route plus noise edges. Node labels
 * are shuffled so the shortest path is not obvious from the names.
 */
export function randomGraph(rng, { nodes = 12, extra = 14, minCost = 1, maxCost = 9, trapChance = 0.25 } = {}) {
  const labels = rng.shuffle(Array.from({ length: nodes }, (_, i) => `N${i.toString(36).toUpperCase()}`));
  const start = labels[0];
  const goal = labels[labels.length - 1];
  const edges = new Map();
  const add = (from, to, cost) => {
    if (from === to) return;
    const key = `${from}>${to}`;
    if (!edges.has(key) || edges.get(key) > cost) edges.set(key, { from, to, cost });
  };
  // Guaranteed spine.
  for (let i = 0; i < labels.length - 1; i++) add(labels[i], labels[i + 1], rng.int(minCost, maxCost));
  // Skip edges create alternative routes and red herrings.
  for (let i = 0; i < labels.length - 2; i++) {
    if (rng.bool(0.45)) add(labels[i], labels[i + 2], rng.int(minCost, maxCost + 4));
  }
  for (let i = 0; i < extra; i++) {
    const a = rng.pick(labels);
    const b = rng.pick(labels);
    add(a, b, rng.int(minCost, maxCost + 6));
  }
  const edgeList = [...edges.values()];
  const best = shortestPath(labels, edgeList, start, goal);
  const trapCost = rng.bool(trapChance) ? rng.int(maxCost + 5, maxCost + 15) : null;
  return {
    nodes: labels,
    edges: edgeList,
    start,
    goal,
    best,
    trap: trapCost ? { from: rng.pick(labels), to: rng.pick(labels), cost: trapCost } : null,
  };
}

export const WORD_BANK = [
  "harbor", "lantern", "meadow", "cinder", "quartz", "willow", "signal", "atlas",
  "ember", "cobalt", "ripple", "garnet", "tundra", "marble", "orchard", "violet",
  "compass", "beacon", "fossil", "cedar", "gravity", "prairie", "velvet", "onyx",
  "sparrow", "canyon", "juniper", "almanac", "thistle", "monsoon", "coral", "basalt",
];
