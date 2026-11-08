import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

export const HARNESS_VERSION = "2.0.0";
export const RESULT_SCHEMA = "gao-bench-result-v1";
export const SUBMISSION_SCHEMA = "gao-submission-v1";
export const TASK_SCHEMA = "gao-task-v1";

export function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function hashObject(obj) {
  return sha256(stableStringify(obj));
}

/** JSON with sorted object keys, for reproducible hashes. */
export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys
    .filter((k) => value[k] !== undefined && typeof value[k] !== "function")
    .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
    .join(",")}}`;
}

/** Remove functions/undefined so a case can be written to JSON. */
export function jsonSafe(value, seen = new WeakSet()) {
  if (value === null || typeof value === "function" || value === undefined) return undefined;
  if (typeof value !== "object") return value;
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((v) => jsonSafe(v, seen)).filter((v) => v !== undefined);
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    const safe = jsonSafe(v, seen);
    if (safe !== undefined) out[k] = safe;
  }
  return out;
}

export function clamp(n, min = 0, max = 1) {
  return Math.max(min, Math.min(max, n));
}

export function round(n, digits = 4) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function mean(nums) {
  const xs = nums.filter((n) => Number.isFinite(n));
  return xs.length ? xs.reduce((s, n) => s + n, 0) / xs.length : 0;
}

export function median(nums) {
  const xs = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!xs.length) return 0;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

export function quantile(nums, q) {
  const xs = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!xs.length) return 0;
  const pos = (xs.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return xs[lo] + (xs[hi] - xs[lo]) * (pos - lo);
}

/** Deterministic bootstrap confidence interval over per-game scores. */
export function bootstrapCi(values, seed = "gao-ci", iterations = 400) {
  const xs = values.filter((n) => Number.isFinite(n));
  if (xs.length < 2) return [xs[0] ?? 0, xs[0] ?? 0];
  let h = 2166136261;
  for (const ch of String(seed)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const next = () => {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    return h / 4294967296;
  };
  const means = [];
  for (let i = 0; i < iterations; i++) {
    let sum = 0;
    for (let j = 0; j < xs.length; j++) sum += xs[Math.floor(next() * xs.length)];
    means.push(sum / xs.length);
  }
  return [round(quantile(means, 0.025)), round(quantile(means, 0.975))];
}

export function deepEqual(a, b) {
  return isDeepStrictEqual(a, b);
}

/** Deep equality that ignores prototype realm (needed for vm results). */
export function crossEqual(a, b) {
  const normalize = (value) => {
    if (value === undefined) return undefined;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return String(value);
    }
  };
  return isDeepStrictEqual(normalize(a), normalize(b));
}

export function getPath(obj, dotted) {
  if (!dotted) return obj;
  return String(dotted)
    .split(".")
    .reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

export function countWords(text) {
  return String(text ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function readText(file) {
  return fs.readFileSync(file, "utf8");
}

export function writeText(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, value);
}

export function listFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else if (entry.isFile()) out.push(path.relative(base, full));
  }
  return out.sort();
}

export function copyDir(src, dest) {
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to);
  }
}

/** Hash a directory tree (relative path + bytes). */
export function hashTree(dir) {
  const h = crypto.createHash("sha256");
  for (const rel of listFiles(dir)) {
    h.update(rel);
    h.update("\0");
    h.update(fs.readFileSync(path.join(dir, rel)));
    h.update("\0");
  }
  return h.digest("hex");
}

export function safeFilePart(s) {
  return String(s || "anon")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "anon";
}

export function nowIso() {
  return new Date().toISOString();
}

/** Normalize free-text answers without hiding real mistakes. */
export function normalizeAnswer(value, mode = "text") {
  const s = String(value ?? "").trim();
  switch (mode) {
    case "number": {
      const n = Number(s.replace(/,/g, "").replace(/[^0-9eE+.\-]/g, ""));
      return Number.isFinite(n) ? String(n) : s.toLowerCase();
    }
    case "integer": {
      const n = Number.parseInt(s.replace(/,/g, ""), 10);
      return Number.isFinite(n) ? String(n) : s.toLowerCase();
    }
    case "set": {
      return s
        .split(/[,;|]/)
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean)
        .sort()
        .join("|");
    }
    case "json": {
      try {
        return stableStringify(JSON.parse(s));
      } catch {
        return s.toLowerCase();
      }
    }
    case "words":
      return s.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").replace(/\s+/g, " ").trim();
    case "text":
    default:
      return s
        .toLowerCase()
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/\s+/g, " ")
        .replace(/^["']|["']$/g, "")
        .trim();
  }
}

export function formatPct(n) {
  return `${(clamp(n) * 100).toFixed(1)}%`;
}

export function formatMs(ms) {
  if (!Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatBytes(n) {
  if (!Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
