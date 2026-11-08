import { normalizeAnswer, round } from "../util.mjs";
import { answerFor, caseResult, invalidSubmission, speedFactor, summarize } from "./common.mjs";

function expectedValues(c) {
  const values = [];
  if (c.answer !== undefined) values.push(c.answer);
  if (Array.isArray(c.accept)) values.push(...c.accept);
  return values;
}

function matches(raw, c) {
  if (c.regex) {
    try {
      if (new RegExp(c.regex, c.regexFlags || "i").test(String(raw))) return true;
    } catch {
      /* invalid regex is a game bug, not a submission bug */
    }
  }
  const mode = c.normalize || "text";
  const actual = normalizeAnswer(raw, mode);
  return expectedValues(c).some((v) => normalizeAnswer(v, mode) === actual);
}

function partialScore(raw, c) {
  if (!Array.isArray(c.partial) || c.partial.length === 0) return 0;
  const text = String(raw ?? "").toLowerCase();
  const hits = c.partial.filter((p) => {
    if (p && typeof p === "object" && p.regex) {
      try {
        return new RegExp(p.regex, p.flags || "i").test(text);
      } catch {
        return false;
      }
    }
    return text.includes(String(p).toLowerCase());
  }).length;
  return (hits / c.partial.length) * 0.5;
}

export function evaluateExact(game, cases, sub, ctx = {}) {
  if (sub.errors?.length && !Object.keys(sub.answers || {}).length) {
    return invalidSubmission(sub, "exact");
  }
  const detail = [];
  let correct = 0;
  for (const c of cases) {
    const raw = answerFor(sub, c.id);
    if (raw === undefined || raw === null || String(raw).trim() === "") {
      detail.push(caseResult(c.id, 0, "missing answer", { kind: "exact" }));
      continue;
    }
    if (typeof raw === "object" && !Array.isArray(raw)) {
      detail.push(caseResult(c.id, 0, "expected a scalar answer", { kind: "exact" }));
      continue;
    }
    if (game.check && typeof game.check === "function") {
      const verdict = game.check(raw, c, ctx);
      const score = typeof verdict === "number" ? verdict : verdict?.score ?? 0;
      detail.push(
        caseResult(c.id, score, verdict?.reason ?? (score >= 1 ? "correct" : "incorrect"), {
          kind: "exact",
          answer: String(raw).slice(0, 500),
        })
      );
      if (score >= 1) correct++;
      continue;
    }
    if (matches(raw, c)) {
      detail.push(caseResult(c.id, 1, "correct", { kind: "exact" }));
      correct++;
    } else {
      const partial = partialScore(raw, c);
      detail.push(
        caseResult(c.id, partial, partial > 0 ? "partial answer" : "incorrect", {
          kind: "exact",
          answer: String(raw).slice(0, 500),
        })
      );
    }
  }
  const summary = summarize(game, detail);
  const speed = speedFactor(game, sub, cases.length);
  summary.stats = {
    passed: correct,
    total: cases.length,
    invalid: 0,
    evaluator: "exact",
    accuracy: cases.length ? round(correct / cases.length) : 0,
    speed_factor: round(speed.factor),
    measured_speed: speed.measured,
  };
  summary.score = round(summary.score * speed.factor);
  if (summary.score >= 1) summary.score = 1;
  summary.warnings = [...(sub.warnings || []), ...speed.warnings];
  summary.errors = sub.errors || [];
  return summary;
}
