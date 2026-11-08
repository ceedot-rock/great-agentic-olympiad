#!/usr/bin/env node
/**
 * GAO Bench CLI — the open agent harness for the Great Agentic Olympiad.
 *
 *   node harness/gao.mjs list
 *   node harness/gao.mjs task lightning-reply --out tasks/lightning-reply
 *   node harness/gao.mjs init my-team
 *   node harness/gao.mjs run --team my-team --submission-root submissions/my-team
 *   node harness/gao.mjs agent --agent "node my-agent.mjs" --team my-agent
 *   node harness/gao.mjs verify
 */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { allGames, getGame, validateRegistry, FAMILIES, SUITES, publicManifest } from "./lib/registry.mjs";
import { writeTaskBundle } from "./lib/task-bundle.mjs";
import { initSubmission, loadSubmission } from "./lib/submission.mjs";
import { buildResult, resultHash, runBench, runGame, saveResult, verifyReferences } from "./lib/runner.mjs";
import { runAgent } from "./lib/agent-runner.mjs";
import { DepotClient } from "./lib/depot.mjs";
import {
  renderDescribe,
  renderGameList,
  renderLeaderboardMarkdown,
  renderResultMarkdown,
  renderScoreMarkdown,
  renderSummary,
  renderVerifyMarkdown,
} from "./lib/report.mjs";
import { ensureDir, readJson, readText, safeFilePart, writeJson, writeText } from "./lib/util.mjs";

const OPTIONS = {
  out: { type: "string" },
  seed: { type: "string", default: "public-v1" },
  submission: { type: "string" },
  "submission-root": { type: "string" },
  team: { type: "string" },
  agent: { type: "string" },
  games: { type: "string" },
  family: { type: "string" },
  suite: { type: "string" },
  format: { type: "string" },
  json: { type: "boolean", default: false },
  keep: { type: "boolean", default: false },
  "save-submissions": { type: "string" },
  url: { type: "string" },
  key: { type: "string" },
  name: { type: "string" },
  sha: { type: "string" },
  help: { type: "boolean", short: "h", default: false },
};

function usage() {
  return `GAO Bench — open agent harness for the Great Agentic Olympiad

Usage:
  node harness/gao.mjs <command> [options]

Commands:
  list                         List all 40 games
  describe <game>              Show one game's rules, limits and capability tags
  task <game> --out <dir>      Write a task bundle for an agent (no answers)
  init <team> --out <dir>      Create an empty submission tree for every game
  score <game> --submission <dir>
                               Score one game submission and print JSON
  run --team <name> --submission-root <dir>
                               Score a team across all games; write a result + report
  agent --agent "<command>"    Run an agent on task bundles and score it end-to-end
  verify                       Check every game against its reference submission
  report <result.json>         Render a result as Markdown
  leaderboard <result...>      Render a leaderboard (normalized score)
  manifest --out <file>        Write the machine-readable bench manifest
  depot push|pull|list         Publish/download result bundles to a GitDepot Hub
  doctor                       Environment + registry health check

Common options:
  --seed <id>                  Deterministic case seed (default public-v1)
  --games a,b,c                Restrict to specific game ids
  --family <name>              Restrict to one family
  --suite <name>               smoke|quick|reasoning|coding|search|safety|speed|full
  --format md|json             Output format for run/report
  --out <path>                 Output file or directory
  --json                       Print machine-readable JSON
  --help                       Show this help

Examples:
  node harness/gao.mjs task speed --out tasks/speed
  node harness/gao.mjs agent --agent "node my-agent.mjs" --team my-agent
  node harness/gao.mjs run --team demo --submission-root submissions/demo
  node harness/gao.mjs verify --seed public-v1
`;
}

function parse(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: OPTIONS,
    allowPositionals: true,
    strict: true,
  });
  return { values, positionals };
}

function selectedGames(values, positionals = []) {
  let games = allGames();
  if (values.games) {
    const ids = new Set(String(values.games).split(",").map((s) => s.trim()).filter(Boolean));
    games = games.filter((g) => ids.has(g.id));
  }
  if (values.family) {
    if (!FAMILIES.includes(values.family)) throw new Error(`unknown family "${values.family}"`);
    games = games.filter((g) => g.family === values.family);
  }
  if (values.suite) {
    if (!SUITES[values.suite]) throw new Error(`unknown suite "${values.suite}". Options: ${Object.keys(SUITES).join(", ")}`);
    const ids = new Set(SUITES[values.suite]);
    games = games.filter((g) => ids.has(g.id));
  }
  const family = positionals.find((p) => FAMILIES.includes(p));
  if (family) games = games.filter((g) => g.family === family);
  const explicit = positionals.filter((p) => getGame(p));
  if (explicit.length) {
    const ids = new Set(explicit);
    games = games.filter((g) => ids.has(g.id));
  }
  return games;
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function writeOrPrint(text, out) {
  if (out) {
    ensureDir(path.dirname(path.resolve(out)));
    writeText(out, text);
    process.stdout.write(`wrote ${out}\n`);
  } else {
    process.stdout.write(text);
  }
}

function assertGame(id) {
  const game = getGame(id);
  if (!game) throw new Error(`unknown game "${id}". Run: node harness/gao.mjs list`);
  return game;
}

async function main() {
  const { values, positionals } = parse(process.argv.slice(2));
  if (values.help || positionals.length === 0) {
    process.stdout.write(usage());
    return;
  }
  const command = positionals[0];
  const rest = positionals.slice(1);

  if (command === "list") {
    const games = selectedGames(values, rest);
    if (values.json) return printJson(games.map((g) => ({ id: g.id, name: g.name, family: g.family, mode: g.mode, evaluator: g.evaluator })));
    return process.stdout.write(renderGameList(games));
  }

  if (command === "describe") {
    if (!rest[0]) throw new Error("describe needs a game id");
    const game = assertGame(rest[0]);
    if (values.json) return printJson({ ...game, build: undefined });
    return process.stdout.write(renderDescribe(game));
  }

  if (command === "task") {
    if (!rest[0]) throw new Error("task needs a game id or family");
    const games = getGame(rest[0]) ? [assertGame(rest[0])] : selectedGames(values, rest);
    if (!games.length) throw new Error("no games selected");
    const outRoot = values.out || path.join("tasks", rest[0]);
    for (const game of games) {
      const dir = games.length === 1 ? outRoot : path.join(outRoot, game.id);
      const { hash, bundle } = writeTaskBundle(game, dir, values.seed);
      process.stdout.write(`${game.id}: ${bundle.cases.length} cases -> ${dir} (bundle ${hash.slice(0, 12)})\n`);
    }
    return;
  }

  if (command === "init") {
    const team = rest[0] || values.team;
    if (!team) throw new Error("init needs a team name");
    const out = values.out || path.join("submissions", safeFilePart(team));
    const games = selectedGames(values, rest.slice(1));
    for (const game of games) initSubmission(path.join(out, game.id), game, team);
    process.stdout.write(`created ${games.length} submission folders under ${out}\n`);
    return;
  }

  if (command === "score") {
    const id = rest[0] || values.games;
    if (!id) throw new Error("score needs a game id");
    const game = assertGame(id);
    if (!values.submission) throw new Error("score needs --submission <dir>");
    const sub = loadSubmission(values.submission, game);
    const result = runGame(game, { submission: sub, seed: values.seed });
    if (values.format === "md") return process.stdout.write(renderScoreMarkdown(game, result));
    return printJson(result);
  }

  if (command === "run") {
    const root = values["submission-root"] || values.submission;
    if (!root) throw new Error("run needs --submission-root <team-dir>");
    const team = values.team || path.basename(path.resolve(root));
    const games = selectedGames(values, rest);
    const result = runBench({ root, team, seed: values.seed, games });
    if (values.suite) {
      // Rebuild the hash with the suite included so the result hash covers it.
      result.suite = values.suite;
      result.hashes.result = resultHash(result);
    }
    const outDir = values.out || "results";
    const file = saveResult(result, outDir);
    const md = renderResultMarkdown(result);
    writeText(file.replace(/\.json$/, ".md"), md);
    if (values.json || values.format === "json") printJson(result);
    else process.stdout.write(`${renderSummary(result)}\n\nwrote ${file}\n`);
    return;
  }

  if (command === "agent") {
    if (!values.agent) throw new Error("agent needs --agent \"<command>\"");
    const team = values.team || "agent";
    const games = selectedGames(values, rest);
    const run = runAgent({
      agentCommand: values.agent,
      team,
      games,
      seed: values.seed,
      keep: values.keep,
      saveSubmissions: values["save-submissions"] || path.join("submissions", safeFilePart(team)),
    });
    const result = buildResult({
      team,
      seed: values.seed,
      gameResults: run.results,
      submissionRoot: path.join("submissions", safeFilePart(team)),
      extra: {
        suite: values.suite,
        agent: {
          command: values.agent,
          work_root: values.keep ? run.root : undefined,
          games: run.results.map((r) => ({
            id: r.id,
            status: r.status,
            score: r.score,
            duration_ms: r.agent_run?.duration_ms,
            exit: r.agent_run?.status,
            timed_out: r.agent_run?.timed_out,
          })),
        },
      },
    });
    const file = saveResult(result, values.out || "results");
    writeText(file.replace(/\.json$/, ".md"), renderResultMarkdown(result));
    if (values.json || values.format === "json") printJson(result);
    else process.stdout.write(`${renderSummary(result)}\n\nwrote ${file}\n`);
    return;
  }

  if (command === "verify") {
    const games = selectedGames(values, rest);
    const report = verifyReferences({ seed: values.seed, only: games.map((g) => g.id) });
    const text = values.json ? null : renderVerifyMarkdown({ ...report, seed: values.seed });
    if (values.json) printJson({ ok: report.ok, seed: values.seed, rows: report.rows });
    else process.stdout.write(text);
    if (!report.ok) process.exitCode = 1;
    return;
  }

  if (command === "report") {
    const file = rest[0];
    if (!file) throw new Error("report needs a result JSON file");
    const result = readJson(file);
    if (values.format === "json" || values.json) return printJson(result);
    return writeOrPrint(renderResultMarkdown(result), values.out);
  }

  if (command === "leaderboard") {
    if (!rest.length) throw new Error("leaderboard needs one or more result JSON files");
    const results = rest.map((f) => readJson(f));
    if (values.format === "json" || values.json) return printJson(results);
    return writeOrPrint(renderLeaderboardMarkdown(results), values.out);
  }

  if (command === "manifest") {
    const manifest = publicManifest();
    if (values.out) {
      writeJson(values.out, manifest);
      process.stdout.write(`wrote ${values.out}\n`);
    } else {
      printJson(manifest);
    }
    return;
  }

  if (command === "depot") {
    const sub = rest[0];
    const url = values.url || process.env.GITDEPOT_URL;
    const key = values.key || process.env.GITDEPOT_KEY;
    if (!url || !key) throw new Error("depot needs --url and --key (or GITDEPOT_URL / GITDEPOT_KEY)");
    const client = new DepotClient({ url, key });
    if (sub === "list") return printJson(await client.list());
    if (sub === "pull") {
      if (!values.sha) throw new Error("depot pull needs --sha <sha256>");
      const buf = await client.get(values.sha);
      if (!values.out) return process.stdout.write(buf.toString("utf8"));
      ensureDir(path.dirname(path.resolve(values.out)));
      fs.writeFileSync(values.out, buf);
      process.stdout.write(`wrote ${values.out} (${buf.length} bytes, sha256 verified)\n`);
      return;
    }
    if (sub === "push") {
      const file = rest[1];
      if (!file) throw new Error("depot push needs a file");
      const data = readText(file);
      const name = values.name || path.basename(file);
      const published = await client.publish({
        name,
        data,
        provenance: {
          source: "gao-bench",
          file: path.basename(file),
          harness_version: "2.0.0",
          seed: values.seed,
        },
      });
      return printJson(published);
    }
    throw new Error("depot needs push|pull|list");
  }

  if (command === "doctor") {
    const errors = validateRegistry();
    const counts = Object.fromEntries(FAMILIES.map((f) => [f, allGames().filter((g) => g.family === f).length]));
    const info = {
      node: process.version,
      cwd: process.cwd(),
      games: allGames().length,
      families: counts,
      registry_errors: errors,
      ok: errors.length === 0,
    };
    if (values.json) printJson(info);
    else {
      process.stdout.write(`GAO Bench doctor\nnode ${info.node}\ngames ${info.games}\n`);
      for (const [f, n] of Object.entries(counts)) process.stdout.write(`  ${f}: ${n}\n`);
      process.stdout.write(errors.length ? `registry errors:\n- ${errors.join("\n- ")}\n` : "registry: ok\n");
    }
    if (errors.length) process.exitCode = 1;
    return;
  }

  throw new Error(`unknown command "${command}". Run with --help.`);
}

main().catch((error) => {
  process.stderr.write(`gao: ${error.message}\n`);
  process.exitCode = 1;
});
