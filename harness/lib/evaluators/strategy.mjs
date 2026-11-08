import { clamp, round } from "../util.mjs";
import { caseResult, invalidSubmission, summarize } from "./common.mjs";
import { callInContext, makeContext, resolveExport, scanSource } from "./code.mjs";

export function evaluateStrategy(game, cases, sub, ctx = {}) {
  if (!sub.strategy) return invalidSubmission(sub, "strategy");
  const findings = scanSource(sub.strategy);
  if (findings.length) {
    return {
      score: 0,
      cases: [],
      stats: { passed: 0, total: 0, invalid: 1, evaluator: "strategy" },
      warnings: sub.warnings || [],
      errors: [`blocked source constructs: ${findings.join(", ")}`],
    };
  }

  const detail = [];
  for (const c of cases) {
    let loaded;
    try {
      loaded = makeContext(game, sub.strategy);
    } catch (error) {
      detail.push(caseResult(c.id, 0, `strategy failed to load: ${error.message}`, { kind: "strategy" }));
      continue;
    }
    const timeout = Number(game.limits?.test_timeout_ms) || 500;
    const call = (name, args = []) => {
      const fn = resolveExport(loaded.context, name, timeout);
      if (!fn) throw new Error(`missing strategy export "${name}"`);
      try {
        return callInContext(loaded.context, fn, args, timeout);
      } catch (error) {
        if (/async/i.test(String(error.message))) throw new Error("async strategies are not supported");
        throw error;
      }
    };
    try {
      const verdict = game.simulate(call, c, ctx);
      const score = clamp(Number(verdict?.score ?? 0));
      detail.push(
        caseResult(c.id, score, verdict?.reason ?? `simulation score ${round(score)}`, {
          kind: "strategy",
          value: verdict?.value,
          baseline: verdict?.baseline,
          optimum: verdict?.optimum,
          detail: verdict?.detail,
        })
      );
    } catch (error) {
      detail.push(caseResult(c.id, 0, `simulation failed: ${String(error.message).slice(0, 200)}`, { kind: "strategy" }));
    }
  }
  const summary = summarize(game, detail);
  summary.stats = {
    passed: detail.filter((c) => c.passed).length,
    total: cases.length,
    invalid: 0,
    evaluator: "strategy",
    mean_strategy_score: round(summary.score),
  };
  summary.warnings = sub.warnings || [];
  summary.errors = sub.errors || [];
  return summary;
}
