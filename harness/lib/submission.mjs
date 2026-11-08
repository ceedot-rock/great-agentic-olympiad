import fs from "node:fs";
import path from "node:path";
import {
  SUBMISSION_SCHEMA,
  ensureDir,
  hashTree,
  jsonSafe,
  listFiles,
  readJson,
  readText,
  sha256,
} from "./util.mjs";

const DEFAULT_MAX_FILE = 512 * 1024;
const DEFAULT_MAX_TOTAL = 4 * 1024 * 1024;

const CANDIDATES = {
  answers: ["answer.json", "answers.json", "submission.json"],
  json: ["answer.json", "answers.json", "submission.json"],
  artifact: ["artifact.json", "artifacts.json", "answer.json"],
  ctf: ["flags.json", "answer.json"],
  live: ["live.json", "answer.json"],
  code: ["solution.js", "solution.cjs", "submission.js"],
  strategy: ["strategy.js", "solution.js"],
  html: ["app.html", "index.html"],
  repair: [],
};

function findFile(dir, names) {
  for (const name of names) {
    const full = path.join(dir, name);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  return null;
}

function parseJsonFile(file, errors) {
  try {
    return JSON.parse(readText(file));
  } catch (error) {
    errors.push(`${path.basename(file)}: invalid JSON (${error.message})`);
    return null;
  }
}

function normalizeMeta(raw) {
  const meta = raw && typeof raw === "object" ? raw : {};
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : undefined);
  return {
    model: typeof meta.model === "string" ? meta.model.slice(0, 120) : undefined,
    provider: typeof meta.provider === "string" ? meta.provider.slice(0, 120) : undefined,
    tokens: num(meta.tokens ?? meta.total_tokens),
    latency_ms: num(meta.latency_ms ?? meta.latencyMs ?? meta.duration_ms),
    cost_usd: num(meta.cost_usd ?? meta.costUsd),
    notes: typeof meta.notes === "string" ? meta.notes.slice(0, 2000) : undefined,
  };
}

/**
 * Load and lightly validate a submission directory.
 * The scorer still validates every answer; this only establishes shape.
 */
export function loadSubmission(dir, game) {
  const errors = [];
  const warnings = [];
  const expected = game.submission || "answers";
  const out = {
    dir: path.resolve(dir),
    kind: expected,
    team: "anon",
    meta: normalizeMeta(null),
    answers: {},
    artifacts: {},
    flags: {},
    findings: {},
    source: null,
    strategy: null,
    html: null,
    repair: {},
    raw: null,
    files: [],
    hash: null,
    errors,
    warnings,
  };

  if (!fs.existsSync(out.dir)) {
    errors.push(`submission directory not found: ${out.dir}`);
    return out;
  }
  if (!fs.statSync(out.dir).isDirectory()) {
    errors.push(`submission path is not a directory: ${out.dir}`);
    return out;
  }

  out.files = listFiles(out.dir);
  const maxFile = Number(game.limits?.max_file_bytes) || DEFAULT_MAX_FILE;
  const maxTotal = Number(game.limits?.max_total_bytes) || DEFAULT_MAX_TOTAL;
  let total = 0;
  for (const rel of out.files) {
    const size = fs.statSync(path.join(out.dir, rel)).size;
    total += size;
    if (size > maxFile) errors.push(`${rel}: ${size} bytes exceeds ${maxFile} byte limit`);
    if (rel.includes("..")) errors.push(`${rel}: path traversal is not allowed`);
  }
  if (total > maxTotal) errors.push(`submission total ${total} bytes exceeds ${maxTotal} byte limit`);
  out.hash = hashTree(out.dir);

  if (expected === "repair") {
    loadRepair(out, game, errors);
    return out;
  }

  if (expected === "code" || expected === "strategy") {
    const file = findFile(out.dir, CANDIDATES[expected]);
    if (!file) {
      errors.push(`missing ${CANDIDATES[expected][0]}`);
    } else {
      const src = readText(file);
      if (src.length > maxFile) errors.push(`${path.basename(file)}: source exceeds size limit`);
      if (expected === "code") out.source = src;
      else out.strategy = src;
      out.raw = src;
    }
    const metaFile = findFile(out.dir, ["answer.json", "meta.json"]);
    if (metaFile) {
      const meta = parseJsonFile(metaFile, errors);
      if (meta) {
        out.meta = normalizeMeta(meta.meta ?? meta);
        out.team = String(meta.team ?? "anon").slice(0, 80);
      }
    }
    return out;
  }

  if (expected === "html") {
    const file = findFile(out.dir, CANDIDATES.html);
    if (!file) {
      errors.push("missing app.html");
    } else {
      const html = readText(file);
      if (html.length > maxFile) errors.push(`app.html: ${html.length} bytes exceeds ${maxFile} byte limit`);
      out.html = html;
      out.raw = html;
    }
    const metaFile = findFile(out.dir, ["answer.json", "meta.json"]);
    if (metaFile) {
      const meta = parseJsonFile(metaFile, errors);
      if (meta) {
        out.meta = normalizeMeta(meta.meta ?? meta);
        out.team = String(meta.team ?? "anon").slice(0, 80);
      }
    }
    return out;
  }

  const file = findFile(out.dir, CANDIDATES[expected] || CANDIDATES.answers);
  if (!file) {
    errors.push(`missing ${(CANDIDATES[expected] || CANDIDATES.answers)[0]}`);
    return out;
  }
  const root = parseJsonFile(file, errors);
  if (!root || typeof root !== "object") {
    errors.push("submission JSON must be an object");
    return out;
  }
  out.raw = root;
  out.team = String(root.team ?? root.team_id ?? "anon").slice(0, 80);
  out.meta = normalizeMeta(root.meta ?? root);
  if (root.schema && root.schema !== SUBMISSION_SCHEMA) {
    warnings.push(`unknown submission schema "${root.schema}" (expected ${SUBMISSION_SCHEMA})`);
  }

  if (expected === "ctf") {
    out.flags = root.flags && typeof root.flags === "object" ? root.flags : root;
    const findingsFile = path.join(out.dir, "findings.json");
    if (fs.existsSync(findingsFile)) {
      const findings = parseJsonFile(findingsFile, errors);
      if (findings && typeof findings === "object") out.findings = findings.findings ?? findings;
    }
  } else if (expected === "artifact") {
    out.artifacts = root.artifacts && typeof root.artifacts === "object" ? root.artifacts : root;
  } else {
    out.answers = root.answers && typeof root.answers === "object" ? root.answers : stripEnvelope(root);
  }
  return out;
}

function stripEnvelope(root) {
  const copy = { ...root };
  for (const key of ["schema", "team", "team_id", "game", "meta", "note", "notes"]) delete copy[key];
  return copy;
}

function loadRepair(out, game, errors) {
  const root = path.join(out.dir, "cases");
  if (!fs.existsSync(root)) {
    errors.push("repair submission needs cases/<case-id>/files/");
    return;
  }
  for (const caseId of fs.readdirSync(root)) {
    const caseDir = path.join(root, caseId);
    if (!fs.statSync(caseDir).isDirectory()) continue;
    const filesDir = path.join(caseDir, "files");
    if (!fs.existsSync(filesDir)) {
      errors.push(`cases/${caseId}: missing files/ directory`);
      continue;
    }
    const files = {};
    for (const rel of listFiles(filesDir)) {
      const safeRel = rel.replace(/\\/g, "/");
      if (safeRel.includes("..") || path.isAbsolute(safeRel)) {
        errors.push(`cases/${caseId}: unsafe path ${rel}`);
        continue;
      }
      files[safeRel] = readText(path.join(filesDir, rel));
    }
    out.repair[caseId] = files;
  }
  const metaFile = path.join(out.dir, "answer.json");
  if (fs.existsSync(metaFile)) {
    const meta = parseJsonFile(metaFile, errors);
    if (meta) {
      out.meta = normalizeMeta(meta.meta ?? meta);
      out.team = String(meta.team ?? "anon").slice(0, 80);
    }
  }
}

/** Create the minimum skeleton for a team submission. */
export function initSubmission(dir, game, team = "anon") {
  ensureDir(dir);
  const base = {
    schema: SUBMISSION_SCHEMA,
    game: game.id,
    team,
    meta: {
      model: "replace-me",
      provider: "replace-me",
      tokens: 0,
      latency_ms: 0,
      cost_usd: 0,
    },
  };
  if (game.submission === "repair") {
    for (const c of game.build?.("public-v1")?.cases ?? []) {
      ensureDir(path.join(dir, "cases", c.id, "files"));
    }
    fs.writeFileSync(path.join(dir, "answer.json"), `${JSON.stringify(base, null, 2)}\n`);
    return dir;
  }
  if (!fs.existsSync(path.join(dir, "answer.json"))) {
    let skeleton = base;
    if (game.submission === "answers" || game.submission === "json") skeleton = { ...base, answers: {} };
    if (game.submission === "artifact") skeleton = { ...base, artifacts: {} };
    if (game.submission === "ctf") skeleton = { ...base, flags: {} };
    if (game.submission === "live") skeleton = { ...base, live: { evidence: [] } };
    fs.writeFileSync(path.join(dir, "answer.json"), `${JSON.stringify(skeleton, null, 2)}\n`);
  }
  if (game.submission === "code" && !fs.existsSync(path.join(dir, "solution.js"))) {
    fs.writeFileSync(
      path.join(dir, "solution.js"),
      "// Export the function named in task.json. CommonJS only; no require/import/fetch.\nmodule.exports = {};\n"
    );
  }
  if (game.submission === "strategy" && !fs.existsSync(path.join(dir, "strategy.js"))) {
    fs.writeFileSync(
      path.join(dir, "strategy.js"),
      "// Export the strategy named in task.json. CommonJS only; no require/import/fetch.\nmodule.exports = {};\n"
    );
  }
  if (game.submission === "html" && !fs.existsSync(path.join(dir, "app.html"))) {
    fs.writeFileSync(path.join(dir, "app.html"), "<!DOCTYPE html>\n<html><body></body></html>\n");
  }
  return dir;
}

export function submissionSummary(sub) {
  return jsonSafe({
    kind: sub.kind,
    team: sub.team,
    hash: sub.hash,
    files: (sub.files || []).length,
    answers: Object.keys(sub.answers || {}).length,
    artifacts: Object.keys(sub.artifacts || {}).length,
    flags: Object.keys(sub.flags || {}).length,
    repair: Object.keys(sub.repair || {}).length,
    meta: sub.meta,
    errors: sub.errors,
    warnings: sub.warnings,
  });
}

export { DEFAULT_MAX_FILE, DEFAULT_MAX_TOTAL, sha256 };
