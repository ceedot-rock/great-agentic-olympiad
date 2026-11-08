import { round } from "../util.mjs";
import { answerFor, caseResult, invalidSubmission, summarize } from "./common.mjs";

function rankingFrom(raw) {
  if (Array.isArray(raw)) return raw.map(String);
  if (raw && Array.isArray(raw.ranking)) return raw.ranking.map(String);
  if (raw && Array.isArray(raw.ids)) return raw.ids.map(String);
  return [];
}

function dcg(ranking, gains, k) {
  let total = 0;
  for (let i = 0; i < Math.min(k, ranking.length); i++) {
    const gain = gains.get(ranking[i]) ?? 0;
    total += (2 ** gain - 1) / Math.log2(i + 2);
  }
  return total;
}

export function ndcg(ranking, gold, k) {
  const gains = new Map();
  gold.forEach((id, i) => gains.set(String(id), gold.length - i));
  const ideal = [...gains.keys()].sort((a, b) => gains.get(b) - gains.get(a));
  const idealDcg = dcg(ideal, gains, k);
  return idealDcg > 0 ? dcg(ranking, gains, k) / idealDcg : 0;
}

export function spearman(ranking, gold) {
  const n = Math.min(ranking.length, gold.length);
  if (n < 2) return 0;
  const rankA = new Map(ranking.map((id, i) => [id, i + 1]));
  const rankB = new Map(gold.map((id, i) => [id, i + 1]));
  const ids = [...new Set([...ranking, ...gold])];
  const xs = ids.map((id) => rankA.get(id) ?? n + 1);
  const ys = ids.map((id) => rankB.get(id) ?? n + 1);
  const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
  const my = ys.reduce((s, v) => s + v, 0) / ys.length;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}

export function evaluateRetrieval(game, cases, sub, ctx = {}) {
  if (sub.errors?.length && !Object.keys(sub.answers || {}).length) {
    return invalidSubmission(sub, "retrieval");
  }
  const detail = [];
  for (const c of cases) {
    const raw = answerFor(sub, c.id);
    const ranking = rankingFrom(raw);
    if (!ranking.length) {
      detail.push(caseResult(c.id, 0, "missing ranking", { kind: "retrieval" }));
      continue;
    }
    const gold = (c.gold || []).map(String);
    const k = Number(c.k) || gold.length || ranking.length;
    const metric = c.metric || "ndcg";
    let score = 0;
    if (metric === "recall") {
      const top = new Set(ranking.slice(0, k));
      const hit = gold.filter((id) => top.has(id)).length;
      score = gold.length ? hit / gold.length : 0;
    } else if (metric === "mrr") {
      const idx = ranking.findIndex((id) => gold.includes(id));
      score = idx >= 0 ? 1 / (idx + 1) : 0;
    } else if (metric === "spearman") {
      score = (spearman(ranking, gold) + 1) / 2;
    } else {
      score = ndcg(ranking, gold, k);
    }
    detail.push(
      caseResult(c.id, score, `${metric} ${round(score, 3)}`, {
        kind: "retrieval",
        metric,
        top: ranking.slice(0, Math.min(5, ranking.length)),
      })
    );
  }
  const summary = summarize(game, detail);
  summary.stats = {
    passed: detail.filter((c) => c.passed).length,
    total: cases.length,
    invalid: 0,
    evaluator: "retrieval",
    mean_metric: round(summary.score),
  };
  summary.warnings = sub.warnings || [];
  summary.errors = sub.errors || [];
  return summary;
}
