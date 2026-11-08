import fs from "node:fs";
import path from "node:path";
import { copyDir, ensureDir, hashTree, writeJson, writeText } from "./util.mjs";
import { taskBundle } from "./registry.mjs";
import { initSubmission } from "./submission.mjs";
import { renderTaskReadme } from "./report.mjs";

export function writeTaskBundle(game, dir, seed = "public-v1") {
  const root = path.resolve(dir);
  ensureDir(root);
  const bundle = taskBundle(game, seed);
  writeJson(path.join(root, "task.json"), bundle);
  writeText(path.join(root, "README.md"), renderTaskReadme(bundle));
  const submissionDir = path.join(root, "submission");
  initSubmission(submissionDir, game, "your-team");

  if (game.submission === "repair") {
    for (const c of bundle.cases) {
      const fixture = path.join(game.fixtureRoot, c.fixture);
      if (fs.existsSync(fixture)) copyDir(fixture, path.join(root, "fixture", c.id));
      ensureDir(path.join(submissionDir, "cases", c.id, "files"));
    }
    writeText(
      path.join(root, "FIXTURES.md"),
      `# Fixtures\n\nEach case fixture is copied under \`fixture/<case-id>/\`. Put complete replacement source files under \`submission/cases/<case-id>/files/\`. Do not submit test files or package.json.\n`
    );
  }
  if (game.submission === "code") {
    writeText(
      path.join(root, "submission", "solution.js"),
      `// ${game.name}: export the functions named in task.json.\n// CommonJS only. require/import/fetch/process are blocked by the scorer.\nmodule.exports = {};\n`
    );
  }
  if (game.submission === "strategy") {
    writeText(
      path.join(root, "submission", "strategy.js"),
      `// ${game.name}: export the strategy function named in task.json.\nmodule.exports = {};\n`
    );
  }
  if (game.submission === "html") {
    writeText(
      path.join(root, "submission", "app.html"),
      `<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="utf-8"><title>${game.name}</title></head>\n<body>\n  <main id="app"></main>\n</body>\n</html>\n`
    );
  }
  if (game.submission === "ctf") {
    writeJson(path.join(root, "submission", "flags.json"), { schema: "gao-submission-v1", team: "your-team", flags: {} });
    writeJson(path.join(root, "submission", "findings.json"), { findings: {} });
  }
  const hash = hashTree(root);
  writeJson(path.join(root, "BUNDLE.json"), {
    schema: "gao-task-bundle-v1",
    game: game.id,
    seed,
    harness_version: "2.0.0",
    hash,
    created_at: new Date().toISOString(),
  });
  return { root, bundle, hash };
}

export function writeAllTaskBundles(games, root, seed = "public-v1") {
  ensureDir(root);
  const out = [];
  for (const game of games) {
    out.push(writeTaskBundle(game, path.join(root, game.id), seed));
  }
  return out;
}
