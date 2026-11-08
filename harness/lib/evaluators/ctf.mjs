import { round } from "../util.mjs";
import { caseResult, invalidSubmission, summarize } from "./common.mjs";

function normalizeFlag(v) {
  return String(v ?? "").trim().replace(/^flag\{|\}$/gi, "").toLowerCase();
}

function findingScore(actual, expected) {
  if (!Array.isArray(expected) || expected.length === 0) return null;
  const a = Array.isArray(actual) ? actual : [];
  const key = (f) => `${Number(f?.line)}:${String(f?.type || "").toLowerCase()}`;
  const exp = new Set(expected.map(key));
  const act = new Set(a.map(key));
  let hit = 0;
  for (const x of exp) if (act.has(x)) hit++;
  if (a.length === 0 || hit === 0) return 0;
  const precision = hit / act.size;
  const recall = hit / exp.size;
  return (2 * precision * recall) / (precision + recall);
}

export function evaluateCtf(game, cases, sub, ctx = {}) {
  if (sub.errors?.length && !Object.keys(sub.flags || {}).length) {
    return invalidSubmission(sub, "ctf");
  }
  const detail = [];
  for (const c of cases) {
    const actualFlag = sub.flags?.[c.id];
    const flagOk = normalizeFlag(actualFlag) === normalizeFlag(c.flag);
    const findings = findingScore(sub.findings?.[c.id], c.findings);
    let score = flagOk ? 0.8 : 0;
    let reason = flagOk ? "flag captured" : "flag incorrect or missing";
    if (findings !== null) {
      score += findings * 0.2;
      reason += `; findings ${round(findings, 2)}`;
    } else if (flagOk) {
      score = 1;
    }
    detail.push(
      caseResult(c.id, score, reason, {
        kind: "ctf",
        flag_ok: flagOk,
        findings: findings === null ? undefined : round(findings, 3),
      })
    );
  }
  const summary = summarize(game, detail);
  summary.stats = {
    passed: detail.filter((c) => c.passed).length,
    total: cases.length,
    invalid: 0,
    evaluator: "ctf",
    flags_captured: detail.filter((c) => c.flag_ok).length,
  };
  summary.warnings = sub.warnings || [];
  summary.errors = sub.errors || [];
  return summary;
}
