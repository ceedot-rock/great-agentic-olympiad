import { jsonSafe } from "../util.mjs";

export function evaluateLive(game, cases, sub) {
  return {
    score: null,
    cases: cases.map((c) => ({
      id: c.id,
      score: null,
      passed: null,
      reason: "live event — not auto-scored",
      kind: "live",
    })),
    stats: { passed: 0, total: cases.length, invalid: 0, evaluator: "live", live: true },
    warnings: sub.warnings || [],
    errors: sub.errors || [],
    live: true,
    submission: jsonSafe(sub.raw),
  };
}

export function evaluateAggregate(game, cases) {
  return {
    score: null,
    cases: cases.map((c) => ({
      id: c.id,
      score: null,
      passed: null,
      reason: "aggregate — computed from other games",
      kind: "aggregate",
    })),
    stats: { passed: 0, total: cases.length, invalid: 0, evaluator: "aggregate", aggregate: true },
    warnings: [],
    errors: [],
    aggregate: true,
  };
}
