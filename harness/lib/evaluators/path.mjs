import { clamp, round } from "../util.mjs";
import { answerFor, caseResult, invalidSubmission, summarize } from "./common.mjs";

function edgeMap(c) {
  const map = new Map();
  for (const e of c.graph?.edges || c.edges || []) {
    const key = `${e.from}>${e.to}`;
    if (!map.has(key) || map.get(key) > e.cost) map.set(key, Number(e.cost));
  }
  return map;
}

function pathCost(path, c) {
  const map = edgeMap(c);
  let cost = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const key = `${path[i]}>${path[i + 1]}`;
    if (!map.has(key)) return { ok: false, reason: `no edge ${path[i]} -> ${path[i + 1]}` };
    cost += map.get(key);
  }
  return { ok: true, cost };
}

export function evaluatePath(game, cases, sub, ctx = {}) {
  if (sub.errors?.length && !Object.keys(sub.answers || {}).length) {
    return invalidSubmission(sub, "path");
  }
  const detail = [];
  for (const c of cases) {
    const raw = answerFor(sub, c.id);
    const path = Array.isArray(raw) ? raw.map(String) : Array.isArray(raw?.path) ? raw.path.map(String) : [];
    if (!path.length) {
      detail.push(caseResult(c.id, 0, "missing path", { kind: "path" }));
      continue;
    }
    const start = c.graph?.start ?? c.start;
    const goal = c.graph?.goal ?? c.goal;
    if (path[0] !== start || path[path.length - 1] !== goal) {
      detail.push(caseResult(c.id, 0, `path must run ${start} -> ${goal}`, { kind: "path" }));
      continue;
    }
    if (new Set(path).size !== path.length) {
      detail.push(caseResult(c.id, 0, "path visits a node twice", { kind: "path" }));
      continue;
    }
    const pc = pathCost(path, c);
    if (!pc.ok) {
      detail.push(caseResult(c.id, 0, pc.reason, { kind: "path" }));
      continue;
    }
    const expected = Number(c.expectedCost ?? c.answer?.cost ?? raw?.cost);
    let score;
    if (!Number.isFinite(expected)) score = 1;
    else if (pc.cost <= expected) score = 1;
    else score = clamp(expected / pc.cost);
    detail.push(
      caseResult(c.id, score, `cost ${pc.cost} / best ${Number.isFinite(expected) ? expected : "?"}`, {
        kind: "path",
        path,
        cost: pc.cost,
        best: Number.isFinite(expected) ? expected : undefined,
      })
    );
  }
  const summary = summarize(game, detail);
  summary.stats = {
    passed: detail.filter((c) => c.passed).length,
    total: cases.length,
    invalid: 0,
    evaluator: "path",
    mean_cost_ratio: round(summary.score),
  };
  summary.warnings = sub.warnings || [];
  summary.errors = sub.errors || [];
  return summary;
}
