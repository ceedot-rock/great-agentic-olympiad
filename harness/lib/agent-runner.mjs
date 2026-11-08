import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { allGames } from "./registry.mjs";
import { writeTaskBundle } from "./task-bundle.mjs";
import { loadSubmission } from "./submission.mjs";
import { runGame } from "./runner.mjs";
import { copyDir, ensureDir, safeFilePart } from "./util.mjs";

const DEFAULT_TIMEOUT = 180;

function runOne(game, { agentCommand, team, seed, workRoot, saveSubmissions }) {
  const dir = path.join(workRoot, safeFilePart(team), safeFilePart(game.id));
  const taskDir = path.join(dir, "task");
  const outDir = path.join(taskDir, "submission");
  ensureDir(outDir);
  writeTaskBundle(game, taskDir, seed);
  const timeout = Math.max(10, Number(game.limits?.agent_timeout_s) || DEFAULT_TIMEOUT) * 1000;
  const started = Date.now();
  const run = spawnSync("sh", ["-c", agentCommand], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout,
    maxBuffer: 2 * 1024 * 1024,
    env: {
      ...process.env,
      GAO_GAME: game.id,
      GAO_TASK_DIR: taskDir,
      GAO_OUT_DIR: outDir,
      GAO_SEED: seed,
      GAO_HARNESS: "gao-bench",
      GAO_TEAM: team,
    },
  });
  const durationMs = Date.now() - started;
  const timedOut = run.error?.code === "ETIMEDOUT" || /timed out/i.test(String(run.error?.message || ""));
  let submission = loadSubmission(outDir, game);
  if (submission.errors?.length && fs.existsSync(path.join(taskDir, "submission"))) {
    const fallback = loadSubmission(path.join(taskDir, "submission"), game);
    if (!fallback.errors?.length) submission = fallback;
  }
  if (Number.isFinite(durationMs) && !Number.isFinite(submission.meta?.latency_ms)) {
    submission.meta = { ...(submission.meta || {}), latency_ms: durationMs };
  }
  const result = runGame(game, { submission, seed, ctx: { measuredMs: durationMs, agent: agentCommand } });
  if (timedOut) result.errors = [...(result.errors || []), `agent timed out after ${timeout} ms`];
  if (run.status !== 0 && run.status != null) result.warnings = [...(result.warnings || []), `agent exited ${run.status}`];
  result.agent_run = {
    command: agentCommand,
    duration_ms: durationMs,
    status: run.status,
    timed_out: timedOut,
    stdout: String(run.stdout || "").slice(-4000),
    stderr: String(run.stderr || "").slice(-4000),
    submission_dir: outDir,
    task_dir: taskDir,
  };
  if (saveSubmissions) {
    const dest = path.join(saveSubmissions, safeFilePart(team), safeFilePart(game.id));
    ensureDir(dest);
    if (fs.existsSync(outDir)) copyDir(outDir, dest);
  }
  return result;
}

export function runAgent({
  agentCommand,
  team = "agent",
  games = allGames(),
  seed = "public-v1",
  keep = false,
  saveSubmissions = null,
  workRoot = null,
}) {
  const root = workRoot || fs.mkdtempSync(path.join(os.tmpdir(), "gao-agent-"));
  ensureDir(root);
  const results = [];
  for (const game of games) {
    if (game.mode !== "offline") {
      results.push(runGame(game, { submission: null, seed }));
      continue;
    }
    results.push(runOne(game, { agentCommand, team, seed, workRoot: root, saveSubmissions }));
  }
  if (!keep && !workRoot) fs.rmSync(root, { recursive: true, force: true });
  return { team, seed, root, results };
}
