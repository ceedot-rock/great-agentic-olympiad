#!/usr/bin/env node
/**
 * Minimal GAO Bench agent adapter.
 *
 * This template only inspects the task and writes a valid skeleton. Replace
 * the TODO section with your model/stack. Run it through:
 *
 *   node harness/gao.mjs agent --agent "node harness/agents/template-agent.mjs" --team template
 */
import fs from "node:fs";
import path from "node:path";

const taskDir = process.env.GAO_TASK_DIR;
const outDir = process.env.GAO_OUT_DIR || path.join(taskDir || ".", "submission");
if (!taskDir) {
  console.error("GAO_TASK_DIR is not set. Run through: node harness/gao.mjs agent ...");
  process.exit(2);
}
const task = JSON.parse(fs.readFileSync(path.join(taskDir, "task.json"), "utf8"));
fs.mkdirSync(outDir, { recursive: true });

console.log(`game=${task.game.id} cases=${task.cases.length} submission=${task.game.submission}`);
console.log(`seed=${task.seed} task_dir=${taskDir} out_dir=${outDir}`);

// TODO: call your agent here and fill `answers`, `artifacts`, `flags`,
// `source`, `strategy` or `html` based on task.game.submission.
const meta = { model: "template", provider: "template", tokens: 0, latency_ms: 0, cost_usd: 0 };
const kind = task.game.submission;

if (kind === "answers" || kind === "json") {
  fs.writeFileSync(
    path.join(outDir, "answer.json"),
    JSON.stringify({ schema: "gao-submission-v1", team: "template", meta, answers: {} }, null, 2)
  );
} else if (kind === "artifact") {
  fs.writeFileSync(
    path.join(outDir, "artifact.json"),
    JSON.stringify({ schema: "gao-submission-v1", team: "template", meta, artifacts: {} }, null, 2)
  );
} else if (kind === "ctf") {
  fs.writeFileSync(path.join(outDir, "flags.json"), JSON.stringify({ flags: {} }, null, 2));
  fs.writeFileSync(path.join(outDir, "findings.json"), JSON.stringify({ findings: {} }, null, 2));
} else if (kind === "code") {
  fs.writeFileSync(path.join(outDir, "solution.js"), "module.exports = {};\n");
} else if (kind === "strategy") {
  fs.writeFileSync(path.join(outDir, "strategy.js"), "module.exports = {};\n");
} else if (kind === "html") {
  fs.writeFileSync(path.join(outDir, "app.html"), "<!doctype html><html><body></body></html>\n");
} else if (kind === "repair") {
  for (const c of task.cases) fs.mkdirSync(path.join(outDir, "cases", c.id, "files"), { recursive: true });
}

console.log("wrote a skeleton submission; replace the TODO with a real solver");
