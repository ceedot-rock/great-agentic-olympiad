"use strict";

function bid(state) {
  const items = Array.isArray(state && state.items) ? state.items : [];
  const budget = Number(state && state.budget) || 0;
  const cost = (item) => Math.max(Number(item.reserve) || 0, (Number(item.rivalMax) || 0) + 1);
  let best = { score: 0, spend: 0, ids: [] };
  const n = items.length;
  for (let mask = 0; mask < 1 << n; mask++) {
    let spend = 0;
    let surplus = 0;
    const ids = [];
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i))) continue;
      const item = items[i];
      const c = cost(item);
      if (Number(item.value) <= c) continue;
      spend += c;
      surplus += Number(item.value) - c;
      ids.push(item.id);
    }
    if (spend <= budget && surplus > best.score) best = { score: surplus, spend, ids };
  }
  const bids = {};
  for (const id of best.ids) {
    const item = items.find((x) => x.id === id);
    bids[id] = cost(item);
  }
  return { bids };
}

module.exports = { bid };
