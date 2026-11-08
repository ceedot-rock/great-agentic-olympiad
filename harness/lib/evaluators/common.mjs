import { clamp, mean, round } from "../util.mjs";

export function caseResult(id, score, reason, detail = {}) {
  return {
    id,
    score: round(clamp(score)),
    passed: score >= 1,
    reason: String(reason ?? "").slice(0, 300),
    ...detail,
  };
}

export function summarize(game, cases) {
  const scores = cases.map((c) => c.score);
  const passed = cases.filter((c) => c.passed).length;
  return {
    score: round(mean(scores)),
    cases,
    case_count: cases.length,
    passed,
    pass_rate: cases.length ? round(passed / cases.length) : 0,
  };
}

/**
 * Speed games publish a token and latency budget. We measure a whole game
 * run, so divide the budget across cases. Missing meta is scored
 * conservatively instead of being treated as infinite speed.
 */
export function speedFactor(game, sub, caseCount) {
  const limits = game.limits || {};
  const hasTokenCap = Number.isFinite(limits.max_tokens) && limits.max_tokens > 0;
  const hasLatencyCap = Number.isFinite(limits.latency_ms_cap) && limits.latency_ms_cap > 0;
  if (!hasTokenCap && !hasLatencyCap) return { factor: 1, warnings: [], measured: false };

  const tokens = sub.meta?.tokens;
  const latency = sub.meta?.latency_ms;
  const measured = Number.isFinite(tokens) || Number.isFinite(latency);
  const warnings = [];
  let factor = 1;

  if (hasTokenCap) {
    if (!Number.isFinite(tokens)) {
      factor *= 0.9;
      warnings.push("token count missing; speed score capped at 0.9");
    } else if (tokens / Math.max(1, caseCount) > limits.max_tokens) {
      factor *= 0.5;
      warnings.push(`token budget exceeded (${tokens} total; cap ${limits.max_tokens}/case)`);
    }
  }
  if (hasLatencyCap) {
    if (!Number.isFinite(latency)) {
      factor *= 0.9;
      warnings.push("latency missing; speed score capped at 0.9");
    } else if (latency / Math.max(1, caseCount) > limits.latency_ms_cap) {
      factor *= 0.5;
      warnings.push(`latency budget exceeded (${latency} ms total; cap ${limits.latency_ms_cap} ms/case)`);
    }
  }
  return { factor, warnings, measured };
}

export function invalidSubmission(sub, evaluator) {
  return {
    score: 0,
    cases: [],
    stats: { passed: 0, total: 0, invalid: 1, evaluator },
    warnings: sub.warnings || [],
    errors: sub.errors || ["submission could not be loaded"],
  };
}

export function answerFor(sub, id) {
  const answers = sub.answers || {};
  if (Object.prototype.hasOwnProperty.call(answers, id)) return answers[id];
  return undefined;
}
