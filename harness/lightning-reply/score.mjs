#!/usr/bin/env node
/**
 * Lightning Reply scorer — deterministic.
 * Usage:
 *   node score.mjs --answer 408 --tokens 3 --latency_ms 900
 *   node score.mjs --file submissions/demo.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const challenge = JSON.parse(
  fs.readFileSync(path.join(__dirname, "challenge.json"), "utf8")
);

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--file") out.file = argv[++i];
    else if (a === "--answer") out.answer = argv[++i];
    else if (a === "--tokens") out.tokens = Number(argv[++i]);
    else if (a === "--latency_ms") out.latency_ms = Number(argv[++i]);
    else if (a === "--team") out.team = argv[++i];
  }
  return out;
}

function score({ answer, tokens, latency_ms, team = "anon" }) {
  const text = String(answer ?? "").trim();
  const tok = Number.isFinite(tokens) ? tokens : text.split(/\s+/).filter(Boolean).length;
  const lat = Number.isFinite(latency_ms) ? latency_ms : 0;
  const correct = text === String(challenge.answer);
  const underTok = tok <= challenge.rules.max_tokens;
  const underLat = lat <= challenge.rules.latency_ms_cap;
  let points = 0;
  let status = "fail";
  if (correct && underTok && underLat) {
    points = 1;
    status = "pass";
  } else if (correct && underLat && !underTok) {
    points = 0.5;
    status = "partial_tokens";
  } else if (correct && underTok && !underLat) {
    points = 0.5;
    status = "partial_latency";
  }
  return {
    ok: true,
    game: challenge.id,
    team,
    points,
    status,
    correct,
    tokens: tok,
    latency_ms: lat,
    caps: {
      max_tokens: challenge.rules.max_tokens,
      latency_ms_cap: challenge.rules.latency_ms_cap,
    },
    at: new Date().toISOString(),
  };
}

const args = parseArgs(process.argv);
let input = { ...args };
if (args.file) {
  const j = JSON.parse(fs.readFileSync(args.file, "utf8"));
  input = {
    answer: j.answer ?? j.text ?? j.output,
    tokens: j.tokens,
    latency_ms: j.latency_ms ?? j.latencyMs,
    team: j.team ?? j.team_id ?? "anon",
  };
}
if (input.answer == null) {
  // No submission provided: refuse to score rather than invent one.
  console.error("refusing to score: no submission (--file, --answer, or piped JSON with answer/text/output)");
  process.exit(2);
}
const result = score(input);
console.log(JSON.stringify(result, null, 2));
process.exit(result.points >= 1 ? 0 : result.points > 0 ? 0 : 1);
