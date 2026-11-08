import { formatMs, formatPct } from "./util.mjs";
import { FAMILY_LABELS } from "./registry.mjs";

function scoreCell(score) {
  return Number.isFinite(score) ? score.toFixed(3) : "—";
}

export function renderResultMarkdown(result) {
  const lines = [];
  lines.push(`# GAO Bench Result — ${result.team}`);
  lines.push("");
  lines.push(`**Overall:** ${scoreCell(result.overall.normalized_score)} (${result.overall.grade}) · **Submitted score:** ${scoreCell(result.overall.score)} · **Coverage:** ${result.overall.submitted}/${result.overall.total} offline games · **95% CI:** ${result.overall.ci95[0].toFixed(3)}–${result.overall.ci95[1].toFixed(3)}`);
  lines.push("");
  lines.push(`Seed \`${result.harness.seed}\` · harness \`${result.harness.version}\` · ${result.harness.created_at}${result.suite ? ` · suite \`${result.suite}\`` : ""}`);
  lines.push("");
  if (result.integrity?.errors?.length) {
    lines.push(`> **Integrity errors:** ${result.integrity.errors.length}. See the integrity section.`);
    lines.push("");
  }
  lines.push("## Families");
  lines.push("");
  lines.push("| Family | Score | Coverage | Scored |");
  lines.push("|---|---:|---:|---:|");
  for (const [family, s] of Object.entries(result.families)) {
    lines.push(`| ${family} — ${FAMILY_LABELS[family] || ""} | ${scoreCell(s.score)} | ${formatPct(s.coverage)} | ${s.scored}/${s.games} |`);
  }
  lines.push("");
  lines.push("## Capabilities");
  lines.push("");
  if (Object.keys(result.capabilities).length) {
    lines.push("| Capability | Mean score |");
    lines.push("|---|---:|");
    for (const [cap, score] of Object.entries(result.capabilities)) lines.push(`| ${cap} | ${scoreCell(score)} |`);
  } else {
    lines.push("_No scored capabilities._");
  }
  lines.push("");
  lines.push("## Games");
  lines.push("");
  lines.push("| Game | Family | Score | Cases | Status |");
  lines.push("|---|---|---:|---:|---|");
  for (const g of result.games) {
    const cases = g.stats?.total ?? g.cases?.length ?? 0;
    lines.push(`| ${g.id} | ${g.family} | ${scoreCell(g.score)} | ${cases} | ${g.status} |`);
  }
  lines.push("");
  const scored = result.games.filter((g) => Number.isFinite(g.score));
  const best = [...scored].sort((a, b) => b.score - a.score).slice(0, 3);
  const worst = [...scored].sort((a, b) => a.score - b.score).slice(0, 3);
  if (best.length) {
    lines.push("**Strongest:** " + best.map((g) => `${g.id} ${scoreCell(g.score)}`).join(" · "));
    lines.push("");
    lines.push("**Weakest:** " + worst.map((g) => `${g.id} ${scoreCell(g.score)}`).join(" · "));
    lines.push("");
  }
  lines.push("## Totals");
  lines.push("");
  lines.push(`- Tokens: ${result.totals.tokens}`);
  lines.push(`- Reported latency: ${formatMs(result.totals.latency_ms)}`);
  lines.push(`- Reported cost: $${result.totals.cost_usd}`);
  lines.push(`- Median game score: ${scoreCell(result.totals.median_game_score)}`);
  lines.push("");
  if (result.integrity?.warnings?.length || result.integrity?.errors?.length) {
    lines.push("## Integrity");
    lines.push("");
    for (const e of result.integrity.errors || []) lines.push(`- **error:** ${e}`);
    for (const w of (result.integrity.warnings || []).slice(0, 20)) lines.push(`- warning: ${w}`);
    lines.push("");
  }
  lines.push("## Reproduce");
  lines.push("");
  lines.push("```bash");
  lines.push(`node harness/gao.mjs verify --seed ${result.harness.seed}`);
  lines.push(`node harness/gao.mjs run --submission-root <team-dir> --seed ${result.harness.seed}`);
  lines.push("```");
  lines.push("");
  lines.push(`Result hash: \`${result.hashes?.result ?? "—"}\` · games hash: \`${result.hashes?.games ?? "—"}\``);
  return `${lines.join("\n")}\n`;
}

export function renderLeaderboardMarkdown(results) {
  const rows = [...results].sort(
    (a, b) =>
      b.overall.normalized_score - a.overall.normalized_score ||
      b.overall.coverage - a.overall.coverage ||
      (a.totals.median_game_score ?? 0) - (b.totals.median_game_score ?? 0)
  );
  const lines = [];
  lines.push("# GAO Bench Leaderboard");
  lines.push("");
  lines.push("Ranked by normalized score (missing games count as zero), then coverage, then median game score.");
  lines.push("");
  lines.push("| # | Team | Normalized | Submitted | Coverage | Grade | Seed |");
  lines.push("|---:|---|---:|---:|---:|---|---|");
  rows.forEach((r, i) => {
    lines.push(
      `| ${i + 1} | ${r.team} | ${scoreCell(r.overall.normalized_score)} | ${scoreCell(r.overall.score)} | ${formatPct(r.overall.coverage)} | ${r.overall.grade} | ${r.harness.seed} |`
    );
  });
  lines.push("");
  if (rows[0]) {
    const medals = ["Gold", "Silver", "Bronze"];
    lines.push("## Medals");
    lines.push("");
    rows.slice(0, 3).forEach((r, i) => lines.push(`- **${medals[i]}** — ${r.team} (${scoreCell(r.overall.normalized_score)})`));
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

export function renderGameList(games) {
  const lines = [];
  lines.push("# GAO Bench — 40 games");
  lines.push("");
  lines.push("| # | Game | Family | Mode | Evaluator | Cases |");
  lines.push("|---:|---|---|---|---|---:|");
  games.forEach((g, i) => {
    let cases = "—";
    try {
      cases = g.build("public-v1").length;
    } catch {
      /* leave dash */
    }
    lines.push(`| ${i + 1} | ${g.id} — ${g.name} | ${g.family} | ${g.mode} | ${g.evaluator} | ${cases} |`);
  });
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export function renderDescribe(game) {
  const lines = [];
  lines.push(`# ${game.name} (\`${game.id}\`)`);
  lines.push("");
  lines.push(`**Family:** ${game.family} · **Mode:** ${game.mode} · **Evaluator:** ${game.evaluator} · **Submission:** ${game.submission} · **Version:** ${game.version}`);
  lines.push("");
  lines.push(game.summary);
  lines.push("");
  lines.push("## Rules");
  lines.push("");
  lines.push(game.rules || "_No public rules._");
  lines.push("");
  lines.push("## Instructions");
  lines.push("");
  lines.push(game.instructions || "_See task bundle._");
  lines.push("");
  lines.push("## Limits");
  lines.push("");
  for (const [k, v] of Object.entries(game.limits || {})) lines.push(`- \`${k}\`: ${v}`);
  if (!Object.keys(game.limits || {}).length) lines.push("_No limits published._");
  lines.push("");
  lines.push("## Capability tags");
  lines.push("");
  lines.push((game.capability || []).map((c) => `\`${c}\``).join(" · ") || "—");
  return `${lines.join("\n")}\n`;
}

export function renderTaskReadme(bundle) {
  const g = bundle.game;
  const lines = [];
  lines.push(`# ${g.name} — task bundle`);
  lines.push("");
  lines.push(`Game \`${g.id}\` · seed \`${bundle.seed}\` · submission type \`${g.submission}\` · evaluator \`${g.evaluator}\``);
  lines.push("");
  lines.push(g.summary);
  lines.push("");
  lines.push("## Rules");
  lines.push("");
  lines.push(g.rules || "—");
  lines.push("");
  lines.push("## Instructions");
  lines.push("");
  lines.push(g.instructions || "—");
  lines.push("");
  lines.push("## Limits");
  lines.push("");
  for (const [k, v] of Object.entries(g.limits || {})) lines.push(`- \`${k}\`: ${v}`);
  lines.push("");
  lines.push("## Cases");
  lines.push("");
  for (const c of bundle.cases) {
    lines.push(`### ${c.id}`);
    lines.push("");
    lines.push(c.prompt || "_No prompt._");
    lines.push("");
  }
  lines.push("## Score policy");
  lines.push("");
  lines.push("Every case is scored independently. The game score is the mean case score, with published caps and integrity checks. Hidden tests are not included in this bundle.");
  return `${lines.join("\n")}\n`;
}

export function renderVerifyMarkdown(report) {
  const lines = [];
  lines.push("# GAO reference verification");
  lines.push("");
  lines.push(`**Status:** ${report.ok ? "PASS" : "FAIL"} · **Seed:** \`${report.seed}\``);
  lines.push("");
  lines.push("| Game | Status | Score | Cases | Notes |");
  lines.push("|---|---|---:|---:|---|");
  for (const r of report.rows) {
    lines.push(
      `| ${r.id} | ${r.ok ? "PASS" : "FAIL"} | ${scoreCell(r.score)} | ${r.cases ?? "—"} | ${(r.errors || []).join("; ").slice(0, 120) || "—"} |`
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}


export function renderScoreMarkdown(game, result) {
  const lines = [];
  lines.push(`# ${game.name} — ${result.team || "submission"}`);
  lines.push("");
  lines.push(`**Score:** ${scoreCell(result.score)} · **Status:** ${result.status} · **Cases:** ${result.stats?.passed ?? 0}/${result.stats?.total ?? 0} passed · **Seed:** \`${result.seed}\``);
  lines.push("");
  if (result.warnings?.length || result.errors?.length) {
    lines.push("## Integrity");
    lines.push("");
    for (const e of result.errors || []) lines.push(`- **error:** ${e}`);
    for (const w of result.warnings || []) lines.push(`- warning: ${w}`);
    lines.push("");
  }
  lines.push("## Cases");
  lines.push("");
  lines.push("| Case | Score | Reason |");
  lines.push("|---|---:|---|");
  for (const c of result.cases || []) {
    lines.push(`| ${c.id} | ${scoreCell(c.score)} | ${String(c.reason || "").replace(/\|/g, "\\|").slice(0, 160)} |`);
  }
  return `${lines.join("\n")}\n`;
}

export function renderSummary(result) {
  return [
    `${result.team}: normalized ${formatPct(result.overall.normalized_score)} (${result.overall.grade}), submitted ${scoreCell(result.overall.score)}, coverage ${result.overall.submitted}/${result.overall.total}, CI ${result.overall.ci95[0].toFixed(3)}–${result.overall.ci95[1].toFixed(3)}`,
    `tokens ${result.totals.tokens} · latency ${formatMs(result.totals.latency_ms)} · cost $${result.totals.cost_usd}`,
    `seed ${result.harness.seed} · harness ${result.harness.version}`,
  ].join("\n");
}

export { scoreCell };
