#!/usr/bin/env node
/**
 * Auction Storm scorer — deterministic surplus under budget.
 * Usage:
 *   node score.mjs --file submissions/demo.json
 *   node score.mjs --bids '{"A":12,"B":20,"C":10}'
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scenario = JSON.parse(
  fs.readFileSync(path.join(__dirname, "scenario.json"), "utf8")
);

function parseArgs(argv) {
  const out = { team: "anon" };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--file") out.file = argv[++i];
    if (argv[i] === "--bids") out.bids = argv[++i];
    if (argv[i] === "--team") out.team = argv[++i];
  }
  return out;
}

function score(bids, team) {
  const byId = Object.fromEntries(scenario.items.map((it) => [it.id, it]));
  let spend = 0;
  let surplus = 0;
  const won = [];
  for (const [id, bidRaw] of Object.entries(bids || {})) {
    const bid = Number(bidRaw);
    const item = byId[id];
    if (!item || !Number.isFinite(bid) || bid < 0) {
      return {
        ok: false,
        game: scenario.id,
        team,
        points: 0,
        status: "invalid_bid",
        error: `bad bid for ${id}`,
      };
    }
    // win if bid >= start (simplified sealed auction vs reserve)
    if (bid >= item.start) {
      spend += bid;
      surplus += item.value - bid;
      won.push({ id, bid, value: item.value, gain: item.value - bid });
    }
  }
  if (spend > scenario.budget) {
    return {
      ok: true,
      game: scenario.id,
      team,
      points: 0,
      status: "overspend",
      spend,
      budget: scenario.budget,
      surplus,
      won,
      at: new Date().toISOString(),
    };
  }
  // normalize: map surplus to 0..1 against theoretical best naive
  const maxSurplus = scenario.items.reduce((s, it) => s + Math.max(0, it.value - it.start), 0);
  const points = maxSurplus > 0 ? Math.max(0, Math.min(1, surplus / maxSurplus)) : 0;
  return {
    ok: true,
    game: scenario.id,
    team,
    points: +points.toFixed(4),
    status: points > 0 ? "pass" : "zero_surplus",
    spend,
    budget: scenario.budget,
    surplus,
    won,
    at: new Date().toISOString(),
  };
}

const args = parseArgs(process.argv);
let bids = { A: 12, B: 20, C: 10 };
let team = args.team;
if (args.file) {
  const j = JSON.parse(fs.readFileSync(args.file, "utf8"));
  bids = j.bids || j;
  team = j.team || team;
} else if (args.bids) {
  bids = JSON.parse(args.bids);
}
const result = score(bids, team);
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok && result.points > 0 ? 0 : 1);
