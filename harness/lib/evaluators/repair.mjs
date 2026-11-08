import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { copyDir, ensureDir, round } from "../util.mjs";
import { caseResult, invalidSubmission, summarize } from "./common.mjs";

function parseHiddenOutput(stdout) {
  const lines = String(stdout || "")
    .trim()
    .split(/\n+/)
    .reverse();
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed && Number.isFinite(parsed.passed) && Number.isFinite(parsed.total)) return parsed;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

const WORKER = fileURLToPath(new URL("../repair-worker.mjs", import.meta.url));

export function evaluateRepair(game, cases, sub, ctx = {}) {
  if (sub.errors?.length && !Object.keys(sub.repair || {}).length) {
    return invalidSubmission(sub, "repair");
  }
  const detail = [];
  for (const c of cases) {
    const files = sub.repair?.[c.id];
    if (!files || !Object.keys(files).length) {
      detail.push(caseResult(c.id, 0, "missing repaired files", { kind: "repair" }));
      continue;
    }
    const fixture = path.resolve(game.fixtureRoot || "", c.fixture || "");
    const hidden = path.resolve(game.fixtureRoot || "", c.hiddenTest || "");
    if (!fs.existsSync(fixture) || !fs.existsSync(hidden)) {
      detail.push(caseResult(c.id, 0, "fixture missing on disk", { kind: "repair" }));
      continue;
    }
    const forbidden = new Set([...(c.forbidden || []), "test/", "tests/", "package.json", "package-lock.json"]);
    const blocked = Object.keys(files).filter((rel) =>
      [...forbidden].some((f) => (f.endsWith("/") ? rel.startsWith(f) : rel === f))
    );
    if (blocked.length) {
      detail.push(caseResult(c.id, 0, `forbidden files edited: ${blocked.join(", ")}`, { kind: "repair" }));
      continue;
    }
    const allowed = (rel) => ![...forbidden].some((f) => (f.endsWith("/") ? rel.startsWith(f) : rel === f));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gao-repair-"));
    const work = path.join(tmp, "repo");
    try {
      copyDir(fixture, work);
      const copied = [];
      for (const [rel, content] of Object.entries(files)) {
        if (!allowed(rel)) continue;
        const target = path.join(work, rel);
        ensureDir(path.dirname(target));
        fs.writeFileSync(target, content);
        copied.push(rel);
      }
      const run = spawnSync(
        process.execPath,
        [
          WORKER,
          work,
          c.entry,
          hidden,
          String(game.limits?.load_timeout_ms || 1500),
          String(game.limits?.test_timeout_ms || 1000),
        ],
        {
          cwd: work,
          encoding: "utf8",
          timeout: Number(game.limits?.repair_timeout_ms) || 15000,
          env: { ...process.env, NODE_ENV: "test", GAO_REPAIR: "1" },
        }
      );
      const parsed = parseHiddenOutput(run.stdout);
      if (run.error || !parsed) {
        detail.push(
          caseResult(c.id, 0, `hidden tests did not report: ${String(run.stderr || run.error?.message || "timeout").slice(0, 200)}`, {
            kind: "repair",
            copied,
            stdout: String(run.stdout || "").slice(0, 1000),
            stderr: String(run.stderr || "").slice(0, 1000),
          })
        );
        continue;
      }
      const score = parsed.total ? parsed.passed / parsed.total : 0;
      detail.push(
        caseResult(c.id, score, `${parsed.passed}/${parsed.total} hidden tests passed`, {
          kind: "repair",
          copied,
          test_passed: parsed.passed,
          test_total: parsed.total,
          failures: (parsed.failures || []).slice(0, 10),
        })
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
  const summary = summarize(game, detail);
  summary.stats = {
    passed: detail.filter((c) => c.passed).length,
    total: cases.length,
    invalid: 0,
    evaluator: "repair",
    test_pass_rate: round(
      detail.reduce((s, c) => s + (c.test_passed || 0), 0) /
        Math.max(1, detail.reduce((s, c) => s + (c.test_total || 0), 0))
    ),
  };
  summary.warnings = sub.warnings || [];
  summary.errors = sub.errors || [];
  return summary;
}
