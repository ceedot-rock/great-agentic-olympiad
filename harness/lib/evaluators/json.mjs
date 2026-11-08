import { deepEqual, jsonSafe, round } from "../util.mjs";
import { validateSchema } from "../schema.mjs";
import { answerFor, caseResult, invalidSubmission, summarize } from "./common.mjs";

function subset(actual, expected) {
  if (expected === null || typeof expected !== "object") return deepEqual(actual, expected);
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length < expected.length) return false;
    return expected.every((v, i) => subset(actual[i], v));
  }
  if (!actual || typeof actual !== "object") return false;
  return Object.entries(expected).every(([k, v]) => subset(actual[k], v));
}

function fieldScore(actual, expected) {
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
    return { score: 0, correct: 0, total: Object.keys(expected || {}).length, misses: ["answer is not an object"] };
  }
  const keys = Object.keys(expected || {});
  const misses = [];
  let correct = 0;
  for (const key of keys) {
    if (deepEqual(actual[key], expected[key])) correct++;
    else misses.push(key);
  }
  return {
    score: keys.length ? correct / keys.length : 0,
    correct,
    total: keys.length,
    misses,
  };
}

function setF1(actual, expected) {
  const a = new Set(Array.isArray(actual) ? actual : []);
  const e = new Set(Array.isArray(expected) ? expected : []);
  if (a.size === 0 && e.size === 0) return 1;
  let hit = 0;
  for (const x of e) if (a.has(x)) hit++;
  if (hit === 0) return 0;
  const precision = hit / a.size;
  const recall = hit / e.size;
  return (2 * precision * recall) / (precision + recall);
}

export function evaluateJson(game, cases, sub, ctx = {}) {
  if (sub.errors?.length && !Object.keys(sub.answers || {}).length) {
    return invalidSubmission(sub, "json");
  }
  const detail = [];
  for (const c of cases) {
    const answer = answerFor(sub, c.id);
    if (answer === undefined) {
      detail.push(caseResult(c.id, 0, "missing answer", { kind: "json" }));
      continue;
    }
    if (c.schema) {
      const errors = validateSchema(answer, c.schema);
      if (errors.length) {
        detail.push(caseResult(c.id, 0, `schema: ${errors[0]}`, { kind: "json", errors: errors.slice(0, 5) }));
        continue;
      }
    }
    if (game.check && typeof game.check === "function") {
      const verdict = game.check(answer, c, ctx);
      const score = typeof verdict === "number" ? verdict : verdict?.score ?? 0;
      detail.push(
        caseResult(c.id, score, verdict?.reason ?? (score >= 1 ? "correct" : "partial"), {
          kind: "json",
          checks: verdict?.checks,
          answer: jsonSafe(answer),
        })
      );
      continue;
    }
    const mode = c.match || "deep";
    if (mode === "fields") {
      const fs = fieldScore(answer, c.expected);
      detail.push(
        caseResult(c.id, fs.score, `${fs.correct}/${fs.total} fields correct`, {
          kind: "json",
          misses: fs.misses,
          answer: jsonSafe(answer),
        })
      );
    } else if (mode === "contains") {
      const ok = subset(answer, c.expected);
      detail.push(caseResult(c.id, ok ? 1 : 0, ok ? "contains expected fields" : "missing expected fields", { kind: "json" }));
    } else if (mode === "set") {
      const score = setF1(answer, c.expected);
      detail.push(caseResult(c.id, score, `set F1 ${round(score)}`, { kind: "json", answer: jsonSafe(answer) }));
    } else if (mode === "numeric") {
      const actual = Number(answer);
      const expected = Number(c.expected);
      const tolerance = Number(c.tolerance ?? 0);
      const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
      detail.push(caseResult(c.id, ok ? 1 : 0, ok ? "within tolerance" : `expected ${expected} ± ${tolerance}`, { kind: "json" }));
    } else {
      const ok = deepEqual(answer, c.expected);
      detail.push(caseResult(c.id, ok ? 1 : 0, ok ? "exact match" : "does not match expected", { kind: "json" }));
    }
  }
  const summary = summarize(game, detail);
  summary.stats = {
    passed: detail.filter((c) => c.passed).length,
    total: cases.length,
    invalid: 0,
    evaluator: "json",
    accuracy: cases.length ? round(summary.score) : 0,
  };
  summary.warnings = sub.warnings || [];
  summary.errors = sub.errors || [];
  return summary;
}
