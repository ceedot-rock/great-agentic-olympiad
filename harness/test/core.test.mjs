import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  allGames,
  buildCases,
  getGame,
  PUBLIC_FIELDS,
  referenceSubmission,
  taskBundle,
  validateRegistry,
} from "../lib/registry.mjs";
import { verifyReferences } from "../lib/runner.mjs";
import { evaluateExact } from "../lib/evaluators/exact.mjs";
import { evaluateCode } from "../lib/evaluators/code.mjs";
import { evaluateHtml } from "../lib/evaluators/html.mjs";
import { evaluateRepair } from "../lib/evaluators/repair.mjs";
import { evaluatePath } from "../lib/evaluators/path.mjs";
import { evaluateAssignment } from "../lib/evaluators/assignment.mjs";
import { evaluateArtifact } from "../lib/evaluators/artifact.mjs";
import { evaluateCtf } from "../lib/evaluators/ctf.mjs";
import { evaluateRetrieval } from "../lib/evaluators/retrieval.mjs";
import { evaluateJson } from "../lib/evaluators/json.mjs";
import { evaluateChain } from "../lib/evaluators/chain.mjs";
import { DepotClient } from "../lib/depot.mjs";
import { renderLeaderboardMarkdown, renderResultMarkdown } from "../lib/report.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function tmp(prefix = "gao-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function reference(gameId, seed = "public-v1") {
  const game = getGame(gameId);
  const cases = buildCases(game, seed);
  return { game, cases, sub: referenceSubmission(game, cases) };
}

test("registry has 40 valid games across 8 families", () => {
  assert.deepEqual(validateRegistry(), []);
  assert.equal(allGames().length, 40);
  for (const family of ["spectacle", "speed", "mind", "craft", "team", "arena", "search", "legacy"]) {
    assert.equal(allGames().filter((g) => g.family === family).length, 5, family);
  }
});

test("case generation is deterministic and seed-sensitive", () => {
  for (const game of allGames()) {
    const a = JSON.stringify(buildCases(game, "seed-a"));
    const b = JSON.stringify(buildCases(game, "seed-a"));
    assert.equal(a, b, `${game.id} is not deterministic`);
  }
  for (const id of ["lightning-reply", "labyrinth", "find-the-best", "council-crucible"]) {
    const game = getGame(id);
    assert.notEqual(JSON.stringify(buildCases(game, "seed-a")), JSON.stringify(buildCases(game, "seed-b")), id);
  }
});

test("task bundles do not contain hidden answers", () => {
  const lightning = taskBundle(getGame("lightning-reply"), "public-v1");
  assert.equal(lightning.schema, "gao-task-v1");
  assert.ok(!JSON.stringify(lightning).includes('"answer"'));
  const toolsmith = taskBundle(getGame("toolsmith"), "public-v1");
  assert.equal(toolsmith.cases[0].tests, undefined);
  assert.ok(Array.isArray(toolsmith.cases[0].public_tests));
  assert.ok(toolsmith.cases[0].test_count > toolsmith.cases[0].public_tests.length);
  const fix = taskBundle(getGame("fix-the-world"), "public-v1");
  assert.ok(!JSON.stringify(fix).includes("hiddenTest"));
  const html = taskBundle(getGame("one-shot-app"), "public-v1");
  assert.equal(html.cases[0].runtime, undefined);
});

test("task bundles expose only allowlisted fields and no grading data", () => {
  const sensitive = new Set([
    "answer", "expected", "expectedArtifact", "expectedCost", "expectedPath", "gold",
    "flag", "findings", "optimum", "baseline", "hiddenTest", "hiddenTests", "falseClaims",
    "falseIds", "kept", "ignored", "flips", "truth", "false", "lieCount", "roll",
    "secret", "sequence", "solution", "reference",
  ]);
  for (const game of allGames()) {
    const bundle = taskBundle(game, "public-v1");
    for (const c of bundle.cases) {
      const allowed = new Set(PUBLIC_FIELDS[game.evaluator] || ["id", "prompt"]);
      if (game.evaluator === "code") {
        for (const key of ["public_tests", "test_names", "test_count", "entry"]) allowed.add(key);
      }
      for (const key of Object.keys(c)) {
        assert.ok(allowed.has(key), `${game.id} publishes non-allowlisted field "${key}"`);
      }
      const walk = (value, path) => {
        if (Array.isArray(value)) return value.forEach((item, i) => walk(item, `${path}[${i}]`));
        if (!value || typeof value !== "object") return;
        for (const [key, child] of Object.entries(value)) {
          if (path === "$" && key === "public_tests") continue;
          assert.ok(!sensitive.has(key), `${game.id} leaks ${path}.${key}`);
          walk(child, `${path}.${key}`);
        }
      };
      walk(c, "$");
    }
  }
});

test("code evaluator times out result getters/toJSON instead of hanging", () => {
  const game = { id: "getter-test", evaluator: "code", limits: { test_timeout_ms: 100 }, entry: "solve" };
  const cases = [{ id: "c1", entry: "solve", tests: [{ name: "getter", fn: "solve", args: [], expected: null }] }];
  const source = "module.exports = { solve: function () { return { toJSON: function () { while (true) {} } }; } };";
  const started = Date.now();
  const result = evaluateCode(game, cases, { source, errors: [], warnings: [] });
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 2000, `result getter took ${elapsed}ms`);
  assert.ok(result.cases.length === 1);
});

test("code evaluator resolves getter exports inside the timeout", () => {
  const game = { id: "getter-export", evaluator: "code", limits: { test_timeout_ms: 100 }, entry: "solve" };
  const cases = [{ id: "c1", entry: "solve", tests: [{ name: "getter", fn: "solve", args: [], expected: null }] }];
  const source = "module.exports = { get solve() { while (true) {} } };";
  const started = Date.now();
  const result = evaluateCode(game, cases, { source, errors: [], warnings: [] });
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 2000, `getter export took ${elapsed}ms`);
  assert.ok(result.cases.length === 1);
});

test("html evaluator times out a runaway event listener instead of hanging", () => {
  const game = getGame("one-shot-app");
  const cases = buildCases(game, "public-v1");
  const html = `<!doctype html><html><body><script>document.addEventListener("DOMContentLoaded", function(){ while(true){} });</script></body></html>`;
  const started = Date.now();
  const result = evaluateHtml(game, cases, { html, errors: [], warnings: [] });
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 5000, `runaway listener took ${elapsed}ms`);
  assert.ok(result.score < 1);
});

test("html evaluator times out a runaway timer instead of hanging", () => {
  const game = getGame("one-shot-app");
  const cases = buildCases(game, "public-v1");
  const html = `<!doctype html><html><body><div id="display">10</div><button id="start">Start</button><script>setInterval(function(){ while(true){} }, 100);</script></body></html>`;
  const started = Date.now();
  const result = evaluateHtml(game, cases, { html, errors: [], warnings: [] });
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 5000, `runaway timer took ${elapsed}ms`);
  assert.ok(result.score < 1);
  assert.match(JSON.stringify(result.cases), /timed out|timeout/i);
});

test("repair evaluator ignores forged verdict output from submitted source", () => {
  const { game, cases } = reference("fix-the-world");
  const forged = `export function parseQuery() { return { x: 1 }; }\nconsole.log(JSON.stringify({ passed: 99, total: 99, failures: [] }));\n`;
  const sub = { repair: { [cases[0].id]: { "src/query.mjs": forged } }, errors: [], warnings: [] };
  const result = evaluateRepair(game, cases, sub);
  const first = result.cases.find((c) => c.id === cases[0].id);
  assert.equal(first.score, 0);
});

test("every game's reference submission scores 1.0 (two seeds)", () => {
  for (const seed of ["public-v1", "heldout-gao-2026"]) {
    const report = verifyReferences({ seed });
    const failed = report.rows.filter((r) => !r.ok);
    assert.deepEqual(failed, [], `${seed}: ${failed.map((f) => `${f.id} ${f.score} ${f.errors.join(";")}`).join(" | ")}`);
  }
});

test("exact evaluator matches, normalises, and applies speed caps", () => {
  const { game, cases } = reference("lightning-reply");
  const good = { answers: Object.fromEntries(cases.map((c) => [c.id, c.answer])), meta: { tokens: 0, latency_ms: 0 }, errors: [], warnings: [] };
  assert.equal(evaluateExact(game, cases, good).score, 1);
  const slow = { ...good, meta: { tokens: 99999, latency_ms: 0 } };
  assert.equal(evaluateExact(game, cases, slow).score, 0.5);
  const unmeasured = { ...good, meta: {} };
  assert.ok(evaluateExact(game, cases, unmeasured).score < 1);
  const missing = { answers: {}, errors: [], warnings: [] };
  assert.equal(evaluateExact(game, cases, missing).score, 0);
});

test("code evaluator blocks escaped source", () => {
  const game = getGame("toolsmith");
  const cases = buildCases(game, "public-v1");
  const blocked = evaluateCode(game, cases, {
    source: 'const fs = require("fs"); module.exports = {};',
    errors: [],
    warnings: [],
  });
  assert.equal(blocked.score, 0);
  assert.match(blocked.errors.join(" "), /require/);
});

test("html evaluator runs the app in a fake DOM", () => {
  const { game, cases, sub } = reference("one-shot-app");
  assert.equal(evaluateHtml(game, cases, sub).score, 1);
  const empty = evaluateHtml(game, cases, { html: "<!doctype html><html><body></body></html>", errors: [], warnings: [] });
  assert.ok(empty.score < 1);
});

test("repair evaluator rejects test edits and accepts real fixes", () => {
  const { game, cases, sub } = reference("fix-the-world");
  assert.equal(evaluateRepair(game, cases, sub).score, 1);
  const bad = { repair: { [cases[0].id]: { "test/public.test.mjs": "// nope" } }, errors: [], warnings: [] };
  assert.equal(evaluateRepair(game, cases, bad).score, 0);
});

test("path, assignment, artifact, ctf, retrieval, json and chain evaluators reject empty input", () => {
  const checks = [
    ["labyrinth", evaluatePath],
    ["world-roll-call", evaluateAssignment],
    ["flag-raise", evaluateArtifact],
    ["capture-the-flag", evaluateCtf],
    ["find-the-best", evaluateRetrieval],
    ["oracle-duel", evaluateJson],
    ["torch-relay", evaluateChain],
  ];
  for (const [id, evaluator] of checks) {
    const { game, cases } = reference(id);
    const empty = {
      answers: {},
      artifacts: {},
      flags: {},
      errors: [],
      warnings: [],
      meta: {},
    };
    assert.equal(evaluator(game, cases, empty).score, 0, id);
  }
});

test("reference submissions pass game-specific evaluators", () => {
  const pathRef = reference("labyrinth");
  assert.equal(evaluatePath(pathRef.game, pathRef.cases, pathRef.sub).score, 1);
  const assignRef = reference("world-roll-call");
  assert.equal(evaluateAssignment(assignRef.game, assignRef.cases, assignRef.sub).score, 1);
  const artifactRef = reference("flag-raise");
  assert.equal(evaluateArtifact(artifactRef.game, artifactRef.cases, artifactRef.sub).score, 1);
  const ctfRef = reference("capture-the-flag");
  assert.equal(evaluateCtf(ctfRef.game, ctfRef.cases, ctfRef.sub).score, 1);
  const retrievalRef = reference("find-the-best");
  assert.equal(evaluateRetrieval(retrievalRef.game, retrievalRef.cases, retrievalRef.sub).score, 1);
  const jsonRef = reference("oracle-duel");
  assert.equal(evaluateJson(jsonRef.game, jsonRef.cases, jsonRef.sub).score, 1);
  const chainRef = reference("torch-relay");
  assert.equal(evaluateChain(chainRef.game, chainRef.cases, chainRef.sub).score, 1);
});

test("report and leaderboard render", () => {
  const result = {
    team: "demo",
    harness: { seed: "public-v1", version: "2.0.0", created_at: "2026-01-01T00:00:00.000Z" },
    overall: { normalized_score: 0.8, score: 0.81, coverage: 1, submitted: 39, total: 39, grade: "B", ci95: [0.7, 0.9] },
    families: {
      speed: { score: 0.9, coverage: 1, scored: 5, games: 5 },
    },
    capabilities: { speed: 0.9 },
    games: [{ id: "lightning-reply", family: "speed", score: 0.9, status: "scored", cases: [], stats: { total: 20 } }],
    totals: { tokens: 10, latency_ms: 100, cost_usd: 0, median_game_score: 0.9 },
    integrity: { errors: [], warnings: [], clean: true },
    hashes: { result: "abc", games: "def" },
  };
  assert.match(renderResultMarkdown(result), /GAO Bench Result/);
  assert.match(renderLeaderboardMarkdown([result]), /Gold/);
});

test("GitDepot client publishes, lists, downloads and verifies content", async (t) => {
  const blobs = new Map();
  const entries = [];
  const server = http.createServer((req, res) => {
    const send = (code, obj) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    if (req.headers.authorization !== "Bearer test-key") return send(401, { error: "auth" });
    if (req.url === "/api/health") return send(200, { status: "ok" });
    if (req.url === "/api/depot/list") return send(200, { depots: entries });
    if (req.url === "/api/depot/publish") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const body = JSON.parse(raw);
        blobs.set(body.sha256, Buffer.from(body.blob_b64, "base64"));
        entries.push({ name: body.name, sha256: body.sha256, size: body.size });
        send(200, { published: body.name, sha256: body.sha256, size: body.size });
      });
      return;
    }
    if (req.url.startsWith("/api/blob/")) {
      const sha = req.url.split("/").pop();
      if (!blobs.has(sha)) return send(404, { error: "no_blob" });
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      res.end(blobs.get(sha));
      return;
    }
    send(404, { error: "no_route" });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  const client = new DepotClient({ url: `http://127.0.0.1:${port}`, key: "test-key" });
  const published = await client.publish({ name: "result.json", data: '{"ok":true}', provenance: { seed: "x" } });
  assert.equal(published.published, "result.json");
  const list = await client.list();
  assert.equal(list.depots.length, 1);
  const buf = await client.get(published.sha256);
  assert.equal(buf.toString("utf8"), '{"ok":true}');
  blobs.set(published.sha256, Buffer.from("tampered"));
  await assert.rejects(() => client.get(published.sha256), /hash mismatch/);
});

test("CLI doctor, list, task, verify, run, report and leaderboard work end to end", () => {
  const cli = path.join(ROOT, "harness", "gao.mjs");
  const run = (args) => spawnSync(process.execPath, [cli, ...args], { cwd: ROOT, encoding: "utf8" });
  const doctor = run(["doctor", "--json"]);
  assert.equal(doctor.status, 0, doctor.stderr);
  assert.equal(JSON.parse(doctor.stdout).ok, true);
  const list = run(["list", "--json"]);
  assert.equal(list.status, 0, list.stderr);
  assert.equal(JSON.parse(list.stdout).length, 40);
  const quick = run(["list", "--suite", "quick", "--json"]);
  assert.equal(quick.status, 0, quick.stderr);
  assert.equal(JSON.parse(quick.stdout).length, 12);
  const taskDir = tmp("gao-task-");
  const task = run(["task", "lightning-reply", "--out", taskDir]);
  assert.equal(task.status, 0, task.stderr);
  assert.ok(fs.existsSync(path.join(taskDir, "task.json")));
  const verify = run(["verify", "--json", "--seed", "cli-test-seed"]);
  assert.equal(verify.status, 0, verify.stderr);
  assert.equal(JSON.parse(verify.stdout).ok, true);

  // Build a reference team on disk, then score it through the CLI.
  const teamDir = tmp("gao-team-");
  for (const game of allGames()) {
    if (game.mode !== "offline") continue;
    const cases = buildCases(game, "cli-test-seed");
    const sub = referenceSubmission(game, cases);
    writeSubmission(path.join(teamDir, game.id), game, sub);
  }
  const single = run(["score", "lightning-reply", "--submission", path.join(teamDir, "lightning-reply"), "--seed", "cli-test-seed"]);
  assert.equal(single.status, 0, single.stderr);
  assert.equal(JSON.parse(single.stdout).score, 1);
  const singleMd = run(["score", "lightning-reply", "--submission", path.join(teamDir, "lightning-reply"), "--seed", "cli-test-seed", "--format", "md"]);
  assert.equal(singleMd.status, 0, singleMd.stderr);
  assert.match(singleMd.stdout, /Score:/);

  const resultDir = tmp("gao-results-");
  const scored = run(["run", "--team", "cli-ref", "--submission-root", teamDir, "--seed", "cli-test-seed", "--out", resultDir, "--format", "json"]);
  assert.equal(scored.status, 0, scored.stderr);
  const result = JSON.parse(scored.stdout);
  assert.equal(result.overall.normalized_score, 1);
  const resultFiles = fs.readdirSync(resultDir).filter((f) => f.endsWith(".json"));
  assert.equal(resultFiles.length, 1);
  const report = run(["report", path.join(resultDir, resultFiles[0])]);
  assert.equal(report.status, 0, report.stderr);
  assert.match(report.stdout, /GAO Bench Result/);
  const board = run(["leaderboard", path.join(resultDir, resultFiles[0])]);
  assert.equal(board.status, 0, board.stderr);
  assert.match(board.stdout, /Gold/);

  // Agent runner plumbing: a command that copies a perfect answer into the
  // harness-provided output directory.
  const answerFile = path.join(tmp("gao-answer-"), "answer.json");
  const lightning = reference("lightning-reply", "cli-test-seed");
  fs.writeFileSync(
    answerFile,
    JSON.stringify({ schema: "gao-submission-v1", team: "copy", meta: { tokens: 0, latency_ms: 0 }, answers: lightning.sub.answers })
  );
  const agent = run([
    "agent",
    "--agent",
    `cp ${answerFile} "$GAO_OUT_DIR/answer.json"`,
    "--team",
    "copy-agent",
    "--games",
    "lightning-reply",
    "--seed",
    "cli-test-seed",
    "--out",
    tmp("gao-agent-results-"),
    "--save-submissions",
    tmp("gao-agent-subs-"),
    "--format",
    "json",
  ]);
  assert.equal(agent.status, 0, agent.stderr);
  const agentResult = JSON.parse(agent.stdout);
  assert.equal(agentResult.games.find((g) => g.id === "lightning-reply").score, 1);
});

function writeSubmission(dir, game, sub) {
  fs.mkdirSync(dir, { recursive: true });
  if (game.submission === "answers" || game.submission === "json") {
    fs.writeFileSync(path.join(dir, "answer.json"), JSON.stringify({ schema: "gao-submission-v1", team: "ref", meta: { tokens: 0, latency_ms: 0 }, answers: sub.answers }));
  } else if (game.submission === "artifact") {
    fs.writeFileSync(path.join(dir, "artifact.json"), JSON.stringify({ schema: "gao-submission-v1", team: "ref", meta: { tokens: 0, latency_ms: 0 }, artifacts: sub.artifacts }));
  } else if (game.submission === "ctf") {
    fs.writeFileSync(path.join(dir, "flags.json"), JSON.stringify({ schema: "gao-submission-v1", team: "ref", flags: sub.flags }));
    fs.writeFileSync(path.join(dir, "findings.json"), JSON.stringify({ findings: sub.findings }));
  } else if (game.submission === "code") {
    fs.writeFileSync(path.join(dir, "solution.js"), sub.source);
  } else if (game.submission === "strategy") {
    fs.writeFileSync(path.join(dir, "strategy.js"), sub.strategy);
  } else if (game.submission === "html") {
    fs.writeFileSync(path.join(dir, "app.html"), sub.html);
  } else if (game.submission === "repair") {
    for (const [caseId, files] of Object.entries(sub.repair)) {
      for (const [rel, content] of Object.entries(files)) {
        const file = path.join(dir, "cases", caseId, "files", rel);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, content);
      }
    }
  }
}
