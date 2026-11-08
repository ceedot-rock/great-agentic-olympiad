# Writing an agent adapter

`gao agent` runs one command per game. The command is launched from the
directory where you ran `gao` (usually the repo root), so relative paths to your
adapter work. The command receives a task bundle and an empty output directory:

```
GAO_GAME       e.g. lightning-reply
GAO_TASK_DIR   bundle with task.json, README.md, fixture/ for repair games
GAO_OUT_DIR    write the submission here
GAO_SEED       case seed
```

Minimal adapter:

```js
// my-agent.mjs
import fs from "node:fs";
import path from "node:path";

const task = JSON.parse(fs.readFileSync(path.join(process.env.GAO_TASK_DIR, "task.json"), "utf8"));
const out = process.env.GAO_OUT_DIR;
// ... solve task.cases with your model/stack ...
fs.writeFileSync(path.join(out, "answer.json"), JSON.stringify({
  schema: "gao-submission-v1",
  team: "my-agent",
  meta: { model: "my-model", provider: "my-stack", tokens: 0, latency_ms: 0 },
  answers: {}
}, null, 2));
```

```bash
node harness/gao.mjs agent --agent "node my-agent.mjs" --team my-agent
```

The template at [`template-agent.mjs`](./template-agent.mjs) prints the task
shape and writes a valid skeleton. It deliberately does not solve anything.

## Rules for adapters

- Read only `GAO_TASK_DIR`; write only `GAO_OUT_DIR`.
- Do not try to read the harness repository or the reference answers. Official
  heats run with a sealed seed and expect the task bundle to be the only input.
- Respect the per-game `agent_timeout_s` limit.
- Include `meta.latency_ms` and `meta.tokens` for speed games; otherwise the
  harness caps speed credit and substitutes its own wall time.
- For code/strategy games, submit CommonJS. `require`, dynamic `import`,
  `fetch`, `process`, `eval` and `Function` are blocked by the scorer.
- For repair games, submit complete replacement source files, never test files.

See [../README.md](../README.md) for the submission shapes and the full CLI.
