#!/usr/bin/env node
/**
 * GAO Bench smoke runner.
 *
 *   node harness/run-all.mjs            # test suite + reference verification
 *   node harness/run-all.mjs lightning  # legacy single-game scorers
 *   node harness/run-all.mjs oneshot
 *   node harness/run-all.mjs auction
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const which = (process.argv[2] || "all").toLowerCase();

const legacy = [
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

function run(cmd, args, cwd = __dirname) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  process.stdout.write(r.stdout || "");
  process.stderr.write(r.stderr || "");
  return r.status ?? 1;
}

if (which !== "all") {
  const job = legacy.find((j) => j.id === which || j.id === which.replace("one-shot", "oneshot"));
  if (!job) {
    console.error(`unknown smoke target "${which}" (use all|lightning|oneshot|auction)`);
    process.exit(2);
  }
  const status = run(job.cmd[0], job.cmd.slice(1), path.join(__dirname, job.dir));
  process.exit(status);
}

console.log("=== GAO Bench — unit and integration tests ===");
const tests = fs
  .readdirSync(path.join(__dirname, "test"))
  .filter((f) => f.endsWith(".test.mjs"))
  .map((f) => path.join("test", f));
const testStatus = run("node", ["--test", ...tests], __dirname);
console.log("\n=== GAO Bench — reference verification ===");
const verifyStatus = run("node", ["gao.mjs", "verify", "--seed", "public-v1"], __dirname);
console.log("\n=== SUMMARY ===");
console.log(
  JSON.stringify(
    {
      ok: testStatus === 0 && verifyStatus === 0,
      tests: testStatus === 0 ? "pass" : "fail",
      reference_verification: verifyStatus === 0 ? "pass" : "fail",
      at: new Date().toISOString(),
    },
    null,
    2
  )
);
process.exit(testStatus === 0 && verifyStatus === 0 ? 0 : 1);
