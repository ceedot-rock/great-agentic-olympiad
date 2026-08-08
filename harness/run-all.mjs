#!/usr/bin/env node
/**
 * Smoke all tryout harnesses (or one).
 *   node harness/run-all.mjs
 *   node harness/run-all.mjs lightning|oneshot|auction
 */
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const which = (process.argv[2] || "all").toLowerCase();

const jobs = [
  {
    id: "lightning",
    dir: "lightning-reply",
    cmd: ["node", "score.mjs", "--file", "submissions/demo.json"],
  },
  {
    id: "oneshot",
    dir: "one-shot-app",
    cmd: ["node", "score.mjs", "--file", "submissions/demo.html"],
  },
  {
    id: "auction",
    dir: "auction-storm",
    cmd: ["node", "score.mjs", "--file", "submissions/demo.json"],
  },
];

const run = jobs.filter((j) => which === "all" || which === j.id || which === j.dir);
let failed = 0;
const results = [];

for (const j of run) {
  const cwd = path.join(__dirname, j.dir);
  const r = spawnSync(j.cmd[0], j.cmd.slice(1), {
    cwd,
    encoding: "utf8",
  });
  const out = (r.stdout || r.stderr || "").trim();
  let parsed = null;
  try {
    parsed = JSON.parse(out);
  } catch {
    /* */
  }
  const ok = r.status === 0 && parsed?.ok !== false && (parsed?.points ?? 0) > 0;
  if (!ok) failed += 1;
  results.push({ id: j.id, ok, status: r.status, result: parsed, raw: out.slice(0, 500) });
  console.log(`\n=== ${j.id} ===`);
  console.log(out);
}

console.log("\n=== SUMMARY ===");
console.log(
  JSON.stringify(
    {
      ok: failed === 0,
      ran: results.length,
      failed,
      games: results.map((r) => ({ id: r.id, ok: r.ok, points: r.result?.points })),
      at: new Date().toISOString(),
    },
    null,
    2
  )
);
process.exit(failed === 0 ? 0 : 1);
