import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getEvaluator } from "./evaluators/index.mjs";
import { hashObject, jsonSafe, listFiles, readText } from "./util.mjs";

import { games as spectacle } from "../games/spectacle.mjs";
import { games as speed } from "../games/speed.mjs";
import { games as mind } from "../games/mind.mjs";
import { games as craft } from "../games/craft.mjs";
import { games as team } from "../games/team.mjs";
import { games as arena } from "../games/arena.mjs";
import { games as search } from "../games/search.mjs";
import { games as legacy } from "../games/legacy.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const HARNESS_ROOT = path.resolve(__dirname, "..");
export const REPO_ROOT = path.resolve(HARNESS_ROOT, "..");
export const REFERENCE_ROOT = path.join(HARNESS_ROOT, "reference");

export const FAMILIES = ["spectacle", "speed", "mind", "craft", "team", "arena", "search", "legacy"];
export const FAMILY_LABELS = {
  spectacle: "Opening & spectacle — crowd magnets",
  speed: "Speed of thought — pure pace",
  mind: "Mind games — reasoning under pressure",
  craft: "Craft & creation — build what the world can use",
  team: "Team sport — 50-seat coordination",
  arena: "Arena brawls — adversarial fair play",
  search: "Search of agents — the ultimate finder",
  legacy: "Legacy & finals — fame that sticks",
};

const ALL = [...spectacle, ...speed, ...mind, ...craft, ...team, ...arena, ...search, ...legacy];

/**
 * Named practice/competition subsets. `full` is the official scored slate;
 * the others exist so a team can iterate without paying for all 39 games.
 */
export const SUITES = {
  smoke: ["lightning-reply", "one-shot-app", "auction-storm", "fix-the-world"],
  quick: [
    "lightning-reply", "hot-swap", "labyrinth", "memory-palace", "one-shot-app",
    "toolsmith", "fifty-hand", "auction-storm", "capture-the-flag", "find-the-best",
    "story-engine", "council-crucible",
  ],
  reasoning: ["labyrinth", "oracle-duel", "constraint-cage", "memory-palace", "liar-dice", "clockwork", "world-roll-call"],
  coding: ["toolsmith", "fix-the-world", "lost-protocol", "ultimate-index", "silent-protocol", "record-breakers", "one-shot-app"],
  search: ["find-the-best", "needle-storm", "peer-radar", "ultimate-index", "lost-protocol"],
  safety: ["red-team-gauntlet", "capture-the-flag", "debate-coliseum", "council-crucible", "negotiation-pit"],
  speed: ["lightning-reply", "relay-100", "dead-drop", "clockwork", "hot-swap"],
  full: ALL.filter((g) => g.mode === "offline").map((g) => g.id),
};

export function allGames() {
  return ALL;
}

export function getGame(id) {
  return ALL.find((g) => g.id === id) || null;
}

export function gamesByFamily() {
  const out = {};
  for (const f of FAMILIES) out[f] = ALL.filter((g) => g.family === f);
  return out;
}

export function buildCases(game, seed = "public-v1") {
  const out = game.build(seed);
  if (Array.isArray(out)) return out;
  if (out && Array.isArray(out.cases)) return out.cases;
  throw new Error(`${game.id}: build(seed) must return an array or {cases}`);
}

export function validateRegistry() {
  const errors = [];
  const ids = new Set();
  for (const g of ALL) {
    if (!g.id || ids.has(g.id)) errors.push(`${g.id}: duplicate or missing id`);
    ids.add(g.id);
    if (!FAMILIES.includes(g.family)) errors.push(`${g.id}: unknown family ${g.family}`);
    if (!["offline", "live", "aggregate"].includes(g.mode)) errors.push(`${g.id}: bad mode ${g.mode}`);
    if (!getEvaluator(g.evaluator)) errors.push(`${g.id}: unknown evaluator ${g.evaluator}`);
    if (typeof g.build !== "function") errors.push(`${g.id}: missing build(seed)`);
    if (!g.summary) errors.push(`${g.id}: missing summary`);
    if (!g.submission) errors.push(`${g.id}: missing submission type`);
  }
  if (ALL.length !== 40) errors.push(`expected 40 games, found ${ALL.length}`);
  for (const f of FAMILIES) {
    const n = ALL.filter((g) => g.family === f).length;
    if (n !== 5) errors.push(`family ${f}: expected 5 games, found ${n}`);
  }
  return errors;
}

const PUBLIC_FIELDS = {
  exact: ["id", "prompt", "normalize"],
  json: ["id", "prompt", "schema", "match"],
  retrieval: ["id", "prompt", "k", "metric"],
  assignment: ["id", "prompt"],
  path: ["id", "prompt", "graph"],
  chain: ["id", "prompt"],
  artifact: ["id", "prompt"],
  strategy: ["id", "prompt"],
  ctf: ["id", "prompt"],
  html: ["id", "prompt", "brief", "acceptance", "static"],
  repair: ["id", "prompt", "fixture"],
  live: ["id", "prompt"],
  aggregate: ["id", "prompt"],
};

/**
 * Build a task-bundle case from an explicit allowlist. Never derive the public
 * view by deleting a few known answer keys: a new game field must be opted in
 * to be published.
 */
export function publicCase(game, c) {
  const fields = PUBLIC_FIELDS[game.evaluator] || ["id", "prompt"];
  const out = {};
  for (const field of fields) {
    if (c[field] !== undefined) out[field] = jsonSafe(c[field]);
  }
  if (game.evaluator === "code") {
    const allTests = c.tests || [];
    const sampleCount = Number(c.publicTests ?? 2);
    out.public_tests = allTests.slice(0, sampleCount).map((t) => ({
      name: t.name,
      fn: t.fn,
      args: jsonSafe(t.args),
      expected: jsonSafe(t.expected),
    }));
    out.test_names = allTests.map((t) => t.name);
    out.test_count = allTests.length;
    out.entry = c.entry;
  }
  return out;
}

export { PUBLIC_FIELDS };

export function taskBundle(game, seed = "public-v1") {
  const cases = buildCases(game, seed);
  return {
    schema: "gao-task-v1",
    harness_version: "2.0.0",
    seed,
    game: {
      id: game.id,
      name: game.name,
      family: game.family,
      mode: game.mode,
      version: game.version,
      summary: game.summary,
      rules: game.rules,
      capability: game.capability,
      submission: game.submission,
      evaluator: game.evaluator,
      limits: game.limits || {},
      instructions: game.instructions || "",
    },
    cases: cases.map((c) => publicCase(game, c)),
  };
}

export function caseHash(game, seed = "public-v1") {
  return hashObject(buildCases(game, seed));
}

function readRef(rel) {
  const full = path.join(REFERENCE_ROOT, rel);
  if (!fs.existsSync(full)) return null;
  return readText(full);
}

/** A perfect submission built from the game's own reference material. */
export function referenceSubmission(game, cases) {
  const sub = {
    kind: game.submission,
    team: "reference",
    meta: { model: "reference", provider: "gao", tokens: 0, latency_ms: 0, cost_usd: 0 },
    answers: {},
    artifacts: {},
    flags: {},
    findings: {},
    repair: {},
    source: null,
    strategy: null,
    html: null,
    errors: [],
    warnings: [],
  };
  if (game.evaluator === "exact" || game.evaluator === "json") {
    for (const c of cases) sub.answers[c.id] = c.answer ?? c.expected;
  } else if (game.evaluator === "artifact") {
    for (const c of cases) sub.artifacts[c.id] = c.expectedArtifact ?? c.expected;
  } else if (game.evaluator === "ctf") {
    for (const c of cases) {
      sub.flags[c.id] = c.flag;
      if (c.findings) sub.findings[c.id] = c.findings;
    }
  } else if (game.evaluator === "assignment" || game.evaluator === "path" || game.evaluator === "chain") {
    for (const c of cases) sub.answers[c.id] = c.answer;
  } else if (game.evaluator === "retrieval") {
    for (const c of cases) sub.answers[c.id] = c.gold;
  } else if (game.evaluator === "code") {
    sub.source = readRef(game.reference);
  } else if (game.evaluator === "strategy") {
    sub.strategy = readRef(game.reference);
  } else if (game.evaluator === "html") {
    sub.html = readRef(game.reference);
  } else if (game.evaluator === "repair") {
    for (const c of cases) {
      const dir = path.join(REFERENCE_ROOT, game.reference, c.id, "files");
      const files = {};
      for (const rel of listFiles(dir)) files[rel] = readText(path.join(dir, rel));
      sub.repair[c.id] = files;
    }
  }
  return sub;
}

export function publicManifest() {
  return {
    schema: "gao-bench-manifest-v1",
    harness_version: "2.0.0",
    generated_at: new Date().toISOString(),
    games: ALL.map((g) => ({
      id: g.id,
      name: g.name,
      family: g.family,
      mode: g.mode,
      version: g.version,
      capability: g.capability,
      summary: g.summary,
      submission: g.submission,
      evaluator: g.evaluator,
      cases: (() => {
        try {
          return buildCases(g, "public-v1").length;
        } catch {
          return 0;
        }
      })(),
    })),
    families: Object.fromEntries(
      FAMILIES.map((family) => [family, ALL.filter((g) => g.family === family).map((g) => g.id)])
    ),
    counts: {
      total: ALL.length,
      offline: ALL.filter((g) => g.mode === "offline").length,
      live: ALL.filter((g) => g.mode === "live").length,
      aggregate: ALL.filter((g) => g.mode === "aggregate").length,
      public_cases: ALL.reduce((sum, g) => {
        try {
          return sum + buildCases(g, "public-v1").length;
        } catch {
          return sum;
        }
      }, 0),
    },
    capabilities: [...new Set(ALL.flatMap((g) => g.capability || []))].sort(),
    suites: Object.fromEntries(Object.entries(SUITES).map(([name, ids]) => [name, ids])),
    schemas: {
      task: "harness/schema/task.schema.json",
      submission: "harness/schema/submission.schema.json",
      result: "harness/schema/result.schema.json",
    },
  };
}

export { ALL };
