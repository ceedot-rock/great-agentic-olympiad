#!/usr/bin/env node
/**
 * One-Shot App scorer — static checks on a single HTML file.
 * Usage: node score.mjs --file submissions/demo.html
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const brief = JSON.parse(fs.readFileSync(path.join(__dirname, "brief.json"), "utf8"));

function parseArgs(argv) {
  const out = { team: "anon" };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--file") out.file = argv[++i];
    if (argv[i] === "--team") out.team = argv[++i];
  }
  return out;
}

function scoreHtml(html, team) {
  const size = Buffer.byteLength(html, "utf8");
  const checks = {
    under_50kb: size <= 50 * 1024,
    has_html: /<html[\s>]/i.test(html) || /<!DOCTYPE html>/i.test(html),
    countdown_10: /\b10\b/.test(html),
    countdown_0: /\b0\b/.test(html),
    shows_ready: /READY/i.test(html),
    inline_ok: !/https?:\/\/cdn\.|unpkg\.com|jsdelivr/i.test(html) || /script/i.test(html),
  };
  const pass = Object.values(checks).every(Boolean);
  return {
    ok: true,
    game: brief.id,
    team,
    points: pass ? 1 : 0,
    status: pass ? "pass" : "fail",
    size_bytes: size,
    checks,
    at: new Date().toISOString(),
  };
}

const args = parseArgs(process.argv);
const file =
  args.file || path.join(__dirname, "submissions", "demo.html");
const html = fs.readFileSync(file, "utf8");
const result = scoreHtml(html, args.team);
console.log(JSON.stringify(result, null, 2));
process.exit(result.points >= 1 ? 0 : 1);
