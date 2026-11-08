import { countWords, deepEqual, getPath, jsonSafe, round } from "../util.mjs";
import { validateSchema } from "../schema.mjs";
import { caseResult, invalidSubmission, summarize } from "./common.mjs";

function runCheck(artifact, check) {
  const value = getPath(artifact, check.path);
  switch (check.type) {
    case "schema": {
      const errors = validateSchema(artifact, check.schema);
      return { ok: errors.length === 0, reason: errors[0] ?? "schema ok" };
    }
    case "equals":
      return { ok: deepEqual(value, check.value), reason: `${check.path} must equal ${JSON.stringify(check.value)}` };
    case "notEquals":
      return { ok: !deepEqual(value, check.value), reason: `${check.path} must not equal ${JSON.stringify(check.value)}` };
    case "includes": {
      const arr = Array.isArray(value) ? value : [];
      const missing = (check.values || []).filter((v) => !arr.some((x) => deepEqual(x, v) || String(x) === String(v)));
      return { ok: missing.length === 0, reason: `missing ${missing.join(", ")}` };
    }
    case "excludes": {
      const arr = Array.isArray(value) ? value : [];
      const found = (check.values || []).filter((v) => arr.some((x) => deepEqual(x, v) || String(x) === String(v)));
      return { ok: found.length === 0, reason: `contains forbidden ${found.join(", ")}` };
    }
    case "length": {
      const n = Array.isArray(value) ? value.length : typeof value === "string" ? value.length : NaN;
      const min = Number.isFinite(check.min) ? check.min : 0;
      const max = Number.isFinite(check.max) ? check.max : Infinity;
      return { ok: Number.isFinite(n) && n >= min && n <= max, reason: `length ${n} not in [${min}, ${max}]` };
    }
    case "words": {
      const n = countWords(value);
      const min = Number.isFinite(check.min) ? check.min : 0;
      const max = Number.isFinite(check.max) ? check.max : Infinity;
      return { ok: n >= min && n <= max, reason: `${n} words not in [${min}, ${max}]` };
    }
    case "regex": {
      try {
        return { ok: new RegExp(check.pattern, check.flags || "").test(String(value ?? "")), reason: `does not match /${check.pattern}/` };
      } catch {
        return { ok: false, reason: "invalid regex in game spec" };
      }
    }
    case "max":
      return { ok: Number(value) <= Number(check.value), reason: `${value} > ${check.value}` };
    case "min":
      return { ok: Number(value) >= Number(check.value), reason: `${value} < ${check.value}` };
    case "unique": {
      const arr = Array.isArray(value) ? value : [];
      return { ok: new Set(arr.map(String)).size === arr.length, reason: "values are not unique" };
    }
    case "oneOf": {
      const ok = (check.values || []).some((v) => deepEqual(value, v) || String(value) === String(v));
      return { ok, reason: `${JSON.stringify(value)} is not one of the allowed values` };
    }
    case "custom":
      return typeof check.fn === "function" ? check.fn(artifact) : { ok: false, reason: "missing custom check" };
    default:
      return { ok: false, reason: `unknown check type ${check.type}` };
  }
}

function scoreArtifact(artifact, c, game) {
  if (typeof game.check === "function") {
    const verdict = game.check(artifact, c);
    const score = typeof verdict === "number" ? verdict : verdict?.score ?? 0;
    return {
      score,
      checks: verdict?.checks ?? [],
      reason: verdict?.reason ?? (score >= 1 ? "all checks passed" : "checks failed"),
    };
  }
  const checks = c.checks || [];
  if (!checks.length) return { score: 0, checks: [], reason: "game has no checks" };
  const schemaFailure = checks
    .filter((ch) => ch.type === "schema")
    .map((ch) => runCheck(artifact, ch))
    .find((r) => !r.ok);
  if (schemaFailure) return { score: 0, checks: [], reason: `schema: ${schemaFailure.reason}` };

  let passed = 0;
  let total = 0;
  const results = [];
  for (const check of checks) {
    const weight = Number.isFinite(check.weight) ? check.weight : 1;
    total += weight;
    const result = runCheck(artifact, check);
    if (result.ok) passed += weight;
    results.push({
      type: check.type,
      path: check.path,
      ok: result.ok,
      reason: result.ok ? "ok" : result.reason,
      weight,
    });
  }
  const score = total > 0 ? passed / total : 0;
  const failures = results.filter((r) => !r.ok).map((r) => `${r.path || "artifact"}: ${r.reason}`);
  return {
    score,
    checks: results,
    reason: failures.length ? failures.slice(0, 3).join("; ") : "all checks passed",
  };
}

export function evaluateArtifact(game, cases, sub, ctx = {}) {
  if (sub.errors?.length && !Object.keys(sub.artifacts || {}).length) {
    return invalidSubmission(sub, "artifact");
  }
  const detail = [];
  for (const c of cases) {
    const artifact = sub.artifacts?.[c.id] ?? sub.answers?.[c.id];
    if (artifact === undefined) {
      detail.push(caseResult(c.id, 0, "missing artifact", { kind: "artifact" }));
      continue;
    }
    const result = scoreArtifact(artifact, c, game);
    detail.push(
      caseResult(c.id, result.score, result.reason, {
        kind: "artifact",
        checks: result.checks,
        artifact: jsonSafe(artifact),
      })
    );
  }
  const summary = summarize(game, detail);
  summary.stats = {
    passed: detail.filter((c) => c.passed).length,
    total: cases.length,
    invalid: 0,
    evaluator: "artifact",
    mean_check_rate: round(summary.score),
  };
  summary.warnings = sub.warnings || [];
  summary.errors = sub.errors || [];
  return summary;
}

export { runCheck };
