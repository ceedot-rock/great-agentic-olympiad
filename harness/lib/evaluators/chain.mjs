import { jsonSafe } from "../util.mjs";
import { answerFor, caseResult, invalidSubmission, summarize } from "./common.mjs";

export function evaluateChain(game, cases, sub, ctx = {}) {
  if (sub.errors?.length && !Object.keys(sub.answers || {}).length) {
    return invalidSubmission(sub, "chain");
  }
  const detail = [];
  for (const c of cases) {
    const answer = answerFor(sub, c.id);
    if (answer === undefined) {
      detail.push(caseResult(c.id, 0, "missing chain", { kind: "chain" }));
      continue;
    }
    if (typeof game.verify !== "function") {
      detail.push(caseResult(c.id, 0, "game has no chain verifier", { kind: "chain" }));
      continue;
    }
    const verdict = game.verify(answer, c, ctx);
    const score = typeof verdict === "number" ? verdict : verdict?.score ?? (verdict?.ok ? 1 : 0);
    detail.push(
      caseResult(c.id, score, verdict?.reason ?? (score >= 1 ? "verified" : "verification failed"), {
        kind: "chain",
        checks: verdict?.checks,
        answer: jsonSafe(answer),
      })
    );
  }
  const summary = summarize(game, detail);
  summary.stats = {
    passed: detail.filter((c) => c.passed).length,
    total: cases.length,
    invalid: 0,
    evaluator: "chain",
  };
  summary.warnings = sub.warnings || [];
  summary.errors = sub.errors || [];
  return summary;
}
