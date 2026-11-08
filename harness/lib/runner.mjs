import fs from "node:fs";
import path from "node:path";
import {
  HARNESS_VERSION,
  RESULT_SCHEMA,
  bootstrapCi,
  ensureDir,
  hashObject,
  mean,
  median,
  nowIso,
  round,
  safeFilePart,
  sha256,
  stableStringify,
  writeJson,
} from "./util.mjs";
import { allGames, buildCases, getGame, referenceSubmission } from "./registry.mjs";
import { getEvaluator } from "./evaluators/index.mjs";
import { loadSubmission, submissionSummary } from "./submission.mjs";

export function runGame(game, { submission, seed = "public-v1", ctx = {} } = {}) {
  const base = {
    id: game.id,
    name: game.name,
    family: game.family,
    mode: game.mode,
    version: game.version,
    capability: game.capability || [],
    weight: Number(game.weight) || 1,
    seed,
  };
  const evaluator = getEvaluator(game.evaluator);
  if (!evaluator) {
    return {
      ...base,
      status: "error",
      score: null,
      cases: [],
      stats: { passed: 0, total: 0, invalid: 1, evaluator: game.evaluator },
      warnings: [],
      errors: [`unknown evaluator ${game.evaluator}`],
    };
  }
  if (game.mode === "live" || game.mode === "aggregate") {
    const cases = buildCases(game, seed);
    const empty = submission || {
      kind: game.submission,
      team: "anon",
      errors: [],
      warnings: [],
      answers: {},
      artifacts: {},
      flags: {},
      repair: {},
    };
    const result = evaluator(game, cases, empty, ctx);
    return {
      ...base,
      status: game.mode,
      score: null,
      cases: result.cases || [],
      stats: result.stats || {},
      warnings: result.warnings || [],
      errors: [],
      submission: submissionSummary(empty),
      meta: {},
    };
  }
  if (!submission || submission.errors?.some((e) => e.startsWith("submission directory not found"))) {
    return {
      ...base,
      status: "missing",
      score: null,
      cases: [],
      stats: { passed: 0, total: 0, invalid: 1, evaluator: game.evaluator },
      warnings: [],
      errors: ["no submission"],
    };
  }
  const cases = buildCases(game, seed);
  const result = evaluator(game, cases, submission, ctx);
  const status =
    result.live || game.mode === "live"
      ? "live"
      : result.aggregate || game.mode === "aggregate"
        ? "aggregate"
        : result.errors?.length && result.cases?.length === 0
          ? "invalid"
          : "scored";
  return {
    ...base,
    status,
    score: Number.isFinite(result.score) ? round(result.score) : null,
    cases: result.cases || [],
    stats: result.stats || {},
    warnings: result.warnings || [],
    errors: result.errors || [],
    submission: submissionSummary(submission),
    meta: {
      model: submission.meta?.model,
      provider: submission.meta?.provider,
      tokens: submission.meta?.tokens,
      latency_ms: submission.meta?.latency_ms,
      cost_usd: submission.meta?.cost_usd,
    },
    detail: result.submission,
  };
}

export function loadTeamSubmissions(root, games = allGames()) {
  const map = {};
  for (const game of games) {
    const dir = path.join(root, game.id);
    map[game.id] = fs.existsSync(dir) ? loadSubmission(dir, game) : null;
  }
  return map;
}

export function runBench({ root, team = "anon", seed = "public-v1", games = allGames(), ctx = {} }) {
  const subs = loadTeamSubmissions(root, games);
  const results = games.map((g) => runGame(g, { submission: subs[g.id], seed, ctx }));
  return buildResult({ team, seed, gameResults: results, submissionRoot: root });
}

export function buildResult({ team, seed, gameResults, submissionRoot, extra = {} }) {
  const offline = gameResults.filter((g) => g.mode === "offline");
  const scored = offline.filter((g) => Number.isFinite(g.score));
  const submitted = offline.filter((g) => g.status !== "missing");
  const missing = offline.filter((g) => g.status === "missing");
  const normalized = offline.map((g) => (Number.isFinite(g.score) ? g.score : 0));
  const overallScore = scored.length ? mean(scored.map((g) => g.score)) : 0;
  const normalizedScore = offline.length ? mean(normalized) : 0;
  const coverage = offline.length ? submitted.length / offline.length : 0;
  const ci = bootstrapCi(scored.map((g) => g.score), `ci:${seed}:${team}`);

  const families = {};
  for (const g of gameResults) {
    if (!families[g.family]) families[g.family] = [];
    families[g.family].push(g);
  }
  const familySummary = {};
  for (const [family, list] of Object.entries(families)) {
    const off = list.filter((g) => g.mode === "offline");
    const sc = off.filter((g) => Number.isFinite(g.score));
    familySummary[family] = {
      score: sc.length ? round(mean(sc.map((g) => g.score))) : null,
      normalized_score: off.length ? round(mean(off.map((g) => (Number.isFinite(g.score) ? g.score : 0)))) : null,
      games: list.length,
      scored: sc.length,
      coverage: off.length ? round(sc.length / off.length) : 0,
    };
  }

  const capabilityMap = {};
  for (const g of gameResults) {
    if (g.mode !== "offline" || !Number.isFinite(g.score)) continue;
    for (const tag of g.capability || []) {
      if (!capabilityMap[tag]) capabilityMap[tag] = [];
      capabilityMap[tag].push(g.score);
    }
  }
  const capabilities = Object.fromEntries(
    Object.entries(capabilityMap)
      .map(([tag, values]) => [tag, round(mean(values))])
      .sort((a, b) => b[1] - a[1])
  );

  const totals = gameResults.reduce(
    (acc, g) => {
      if (Number.isFinite(g.meta?.tokens)) acc.tokens += g.meta.tokens;
      if (Number.isFinite(g.meta?.latency_ms)) acc.latency_ms += g.meta.latency_ms;
      if (Number.isFinite(g.meta?.cost_usd)) acc.cost_usd += g.meta.cost_usd;
      return acc;
    },
    { tokens: 0, latency_ms: 0, cost_usd: 0 }
  );

  const warnings = gameResults.flatMap((g) => (g.warnings || []).map((w) => `${g.id}: ${w}`));
  const errors = gameResults.flatMap((g) => (g.errors || []).map((e) => `${g.id}: ${e}`));

  const result = {
    schema: RESULT_SCHEMA,
    harness: {
      version: HARNESS_VERSION,
      seed,
      created_at: nowIso(),
      submission_root: submissionRoot ? path.basename(path.resolve(submissionRoot)) : undefined,
      games_hash: hashObject(gameResults.map((g) => ({ id: g.id, version: g.version, seed: g.seed }))),
    },
    team: safeFilePart(team),
    overall: {
      score: round(overallScore),
      normalized_score: round(normalizedScore),
      coverage: round(coverage),
      scored: scored.length,
      submitted: submitted.length,
      missing: missing.length,
      total: offline.length,
      case_pass_rate: (() => {
        const total = scored.reduce((sum, g) => sum + (g.stats?.total || 0), 0);
        const points = scored.reduce(
          (sum, g) => sum + (g.cases || []).reduce((caseSum, c) => caseSum + (Number(c.score) || 0), 0),
          0
        );
        return total ? round(points / total) : 0;
      })(),
      game_pass_rate: scored.length ? round(scored.filter((g) => g.score >= 0.999).length / scored.length) : 0,
      ci95: ci,
      grade: grade(normalizedScore),
    },
    families: familySummary,
    capabilities,
    games: gameResults.map(({ detail, agent_run, ...rest }) => ({
      ...rest,
      agent_run: agent_run
        ? {
            command: agent_run.command,
            duration_ms: agent_run.duration_ms,
            status: agent_run.status,
            timed_out: agent_run.timed_out,
          }
        : undefined,
    })),
    totals: {
      tokens: totals.tokens,
      latency_ms: totals.latency_ms,
      cost_usd: round(totals.cost_usd, 6),
      median_game_score: round(median(scored.map((g) => g.score))),
    },
    integrity: {
      warnings: warnings.slice(0, 100),
      errors: errors.slice(0, 100),
      clean: errors.length === 0,
    },
    ...extra,
  };
  result.hashes = {
    result: hashObject({ ...result, harness: { ...result.harness, created_at: undefined }, hashes: undefined }),
    games: result.harness.games_hash,
  };
  return result;
}

function grade(score) {
  if (score >= 0.9) return "A";
  if (score >= 0.8) return "B";
  if (score >= 0.7) return "C";
  if (score >= 0.6) return "D";
  return "E";
}

export function saveResult(result, dir = "results") {
  ensureDir(dir);
  const file = path.join(
    dir,
    `${safeFilePart(result.team)}-${safeFilePart(result.harness.seed)}-${result.harness.created_at.replace(/[:.]/g, "-")}.json`
  );
  writeJson(file, result);
  return file;
}

/** Verify every game with its own reference submission. */
export function verifyReferences({ seed = "public-v1", only = [] } = {}) {
  const games = only.length ? only.map((id) => getGame(id)).filter(Boolean) : allGames();
  const rows = [];
  for (const game of games) {
    if (game.mode === "live" || game.mode === "aggregate") {
      rows.push({ id: game.id, ok: true, status: game.mode, score: null, errors: [] });
      continue;
    }
    const cases = buildCases(game, seed);
    const sub = referenceSubmission(game, cases);
    const result = runGame(game, { submission: sub, seed });
    const ok = Number.isFinite(result.score) && result.score >= 0.999 && result.status === "scored";
    rows.push({
      id: game.id,
      ok,
      status: result.status,
      score: result.score,
      cases: result.cases.length,
      errors: [...(result.errors || []), ...(result.warnings || [])].slice(0, 5),
    });
  }
  return { ok: rows.every((r) => r.ok), rows };
}

export function resultHash(result) {
  const copy = JSON.parse(JSON.stringify(result));
  if (copy.hashes) delete copy.hashes;
  if (copy.harness) copy.harness.created_at = undefined;
  return sha256(stableStringify(copy));
}
