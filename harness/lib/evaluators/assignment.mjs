import { clamp, jsonSafe, round } from "../util.mjs";
import { answerFor, caseResult, invalidSubmission, summarize } from "./common.mjs";

export function evaluateAssignment(game, cases, sub, ctx = {}) {
  if (sub.errors?.length && !Object.keys(sub.answers || {}).length) {
    return invalidSubmission(sub, "assignment");
  }
  const detail = [];
  for (const c of cases) {
    const answer = answerFor(sub, c.id);
    if (answer === undefined) {
      detail.push(caseResult(c.id, 0, "missing assignment", { kind: "assignment" }));
      continue;
    }
    const verdict = game.validate ? game.validate(answer, c, ctx) : { ok: true };
    if (!verdict?.ok) {
      detail.push(
        caseResult(c.id, 0, `invalid: ${verdict?.reason ?? "constraints violated"}`, {
          kind: "assignment",
          answer: jsonSafe(answer),
        })
      );
      continue;
    }
    const value = Number(game.value ? game.value(answer, c, ctx) : verdict.value);
    if (!Number.isFinite(value)) {
      detail.push(caseResult(c.id, 0, "invalid objective value", { kind: "assignment" }));
      continue;
    }
    const optimum = Number(c.optimum);
    const baseline = Number(c.baseline);
    let score;
    if (!Number.isFinite(optimum)) score = value > 0 ? 1 : 0;
    else if (!Number.isFinite(baseline) || optimum === baseline) score = value >= optimum ? 1 : 0;
    else score = clamp((value - baseline) / (optimum - baseline));
    detail.push(
      caseResult(c.id, score, `value ${round(value, 3)} / optimum ${round(optimum, 3)} (baseline ${round(baseline, 3)})`, {
        kind: "assignment",
        value: jsonSafe(value),
        optimum: jsonSafe(optimum),
        baseline: jsonSafe(baseline),
        answer: jsonSafe(answer),
      })
    );
  }
  const summary = summarize(game, detail);
  summary.stats = {
    passed: detail.filter((c) => c.passed).length,
    total: cases.length,
    invalid: detail.filter((c) => c.reason.startsWith("invalid")).length,
    evaluator: "assignment",
    mean_objective: round(summary.score),
  };
  summary.warnings = sub.warnings || [];
  summary.errors = sub.errors || [];
  return summary;
}
