# GAO Bench — the open agent harness

**40 games. One deterministic harness. Any stack.**

GAO Bench turns the Olympiad's 40 events into a runnable benchmark set for AI
agents. It is offline, dependency-free (Node 20+), deterministic under a seed,
and designed to be scored by anyone. It is not a leaderboard of models: it is a
task contract that any agent, model, workflow, or human+agent team can attempt.

```bash
node harness/gao.mjs list          # all 40 games
node harness/gao.mjs verify        # every reference submission must score 1.0
node harness/gao.mjs task lightning-reply --out tasks/lightning-reply
node harness/gao.mjs run --team my-team --submission-root submissions/my-team
node harness/gao.mjs agent --agent "node my-agent.mjs" --team my-agent
```

The legacy wave-1 smoke command still works:

```bash
node harness/run-all.mjs
```

## What is measured

| Layer | What it answers |
|---|---|
| **Case** | Did the agent solve this exact instance? |
| **Game** | Mean case score, with published caps and integrity checks |
| **Family** | How does the agent do across spectacle, speed, mind, craft, team, arena, search, legacy? |
| **Capability** | Where does the agent actually win: coding, retrieval, planning, security, crypto, negotiation, compression, long-context, calibration? |
| **Coverage** | How many of the 39 scored games were attempted? |
| **Normalized score** | Mean over all scored games, with missing games counting as zero — skipping hard events cannot inflate a rank. |
| **Cost / latency** | Reported per submission; harness-measured wall time is used when the agent does not report latency. |

`closing-medals` is the 40th game and is an aggregate: it has no standalone task.
`gao report` and `gao leaderboard` compute the medals from the scored games.

## The 40 games

| # | Game | Family | Evaluator | Public cases |
|---:|---|---|---|---:|
| 1 | `torch-relay` | spectacle | chain | 4 |
| 2 | `flag-raise` | spectacle | artifact | 3 |
| 3 | `parade-of-models` | spectacle | artifact | 3 |
| 4 | `world-roll-call` | spectacle | assignment | 5 |
| 5 | `anthem-synth` | spectacle | artifact | 3 |
| 6 | `lightning-reply` | speed | exact | 20 |
| 7 | `relay-100` | speed | exact | 10 |
| 8 | `hot-swap` | speed | assignment | 5 |
| 9 | `dead-drop` | speed | exact | 8 |
| 10 | `clockwork` | speed | assignment | 6 |
| 11 | `labyrinth` | mind | path | 6 |
| 12 | `oracle-duel` | mind | json | 6 |
| 13 | `constraint-cage` | mind | assignment | 6 |
| 14 | `memory-palace` | mind | json | 3 |
| 15 | `liar-dice` | mind | json | 8 |
| 16 | `one-shot-app` | craft | html | 1 |
| 17 | `fix-the-world` | craft | repair | 3 |
| 18 | `story-engine` | craft | artifact | 3 |
| 19 | `toolsmith` | craft | code | 1 (20 tests) |
| 20 | `translate-all` | craft | exact | 10 |
| 21 | `fifty-hand` | team | assignment | 6 |
| 22 | `captain-call` | team | json | 5 |
| 23 | `silent-protocol` | team | code | 1 (10 tests) |
| 24 | `ratio-lock-rumble` | team | assignment | 5 |
| 25 | `handoff-heist` | team | chain | 4 |
| 26 | `red-team-gauntlet` | arena | ctf | 3 |
| 27 | `negotiation-pit` | arena | assignment | 5 |
| 28 | `debate-coliseum` | arena | artifact | 5 |
| 29 | `auction-storm` | arena | strategy | 6 |
| 30 | `capture-the-flag` | arena | ctf | 5 |
| 31 | `find-the-best` | search | retrieval | 8 |
| 32 | `needle-storm` | search | json | 8 |
| 33 | `peer-radar` | search | retrieval | 8 |
| 34 | `lost-protocol` | search | code | 1 (12 tests) |
| 35 | `ultimate-index` | search | code | 1 (12 tests) |
| 36 | `record-breakers` | legacy | code | 2 (6 corpora) |
| 37 | `fame-circuit` | legacy | artifact | 3 |
| 38 | `charity-hack` | legacy | assignment | 5 |
| 39 | `council-crucible` | legacy | json | 6 |
| 40 | `closing-medals` | legacy | aggregate | 0 |

The exact case count is generated from the seed. `gao manifest` emits the
machine-readable list with counts and capabilities.

## Agent contract

`gao agent` gives each game its own task bundle and output directory:

```
GAO_GAME       game id
GAO_TASK_DIR   task bundle (task.json, README.md, fixture/ for repair)
GAO_OUT_DIR    where the agent must write its submission
GAO_SEED       the case seed
```

The agent command runs with `cwd` set to the directory you invoked `gao` from
(usually the repo root) and a per-game timeout from
`game.limits.agent_timeout_s`. Use `GAO_TASK_DIR` and `GAO_OUT_DIR` for all file
access; do not assume a working directory. An agent may read anything in the
task bundle and write only to `GAO_OUT_DIR`. It does not receive expected
answers or hidden tests.

### Submission shapes

| Game type | Files in `GAO_OUT_DIR` | Shape |
|---|---|---|
| `answers` (exact/json/assignment/path/retrieval/chain) | `answer.json` | `{ schema, team, meta, answers: { caseId: value } }` |
| `artifact` | `artifact.json` | `{ schema, team, meta, artifacts: { caseId: object } }` |
| `ctf` | `flags.json`, optional `findings.json` | `{ flags: { caseId: "flag{...}" } }`; `{ findings: { caseId: [{ line, type }] } }` |
| `code` | `solution.js` | CommonJS exports named in `task.json` |
| `strategy` | `strategy.js` | CommonJS exports the strategy function |
| `html` | `app.html` | One self-contained HTML file |
| `repair` | `cases/<case-id>/files/<path>` | Complete replacement source files |

`meta` is optional but recommended:

```json
{
  "meta": {
    "model": "my-agent",
    "provider": "my-stack",
    "tokens": 1234,
    "latency_ms": 4321,
    "cost_usd": 0.01
  }
}
```

Speed games use `tokens` and `latency_ms` to apply the published caps. If the
agent omits latency, the harness substitutes its own wall-clock measurement. If
tokens are missing, the speed score is capped at 0.9 instead of pretending the
run was free.

## Seeds and held-out cases

Every task is generated deterministically from a seed:

```bash
node harness/gao.mjs task lightning-reply --seed official-q1 --out tasks/lightning
node harness/gao.mjs run --team my-team --seed official-q1
```

The seed is shared by the task bundle and the scorer, so the agent sees the
same prompts/instances. What it does **not** see is the answers, hidden tests, or
the reference solution. For official runs, organizers use a sealed seed and
publish the resulting result hash. `public-v1` is the development seed committed
for CI and local work.

Code and strategy games publish only a sample of tests in the task bundle
(`public_tests`); the rest are applied at scoring time. `fix-the-world` ships
the fixture but not the hidden suite. `one-shot-app` publishes the brief and
static acceptance criteria, but the runtime timeline is scored privately.

## Integrity

GAO Bench is deliberately strict about what a score means:

- **Sandboxed code.** Code and strategy submissions run in a `node:vm` context
  with string code generation and WASM disabled. `require`, dynamic `import`,
  `process`, `fetch`, `child_process`, `Function`, `eval`, workers and
  `WebAssembly` are rejected before execution.
- **Time limits.** Module load, each test call, the whole game, and the agent
  command all have published timeouts. Infinite loops fail the case. Return
  values are JSON-serialized inside the timeout-bounded VM before the host
  compares them, so getters/`toJSON` cannot escape the deadline.
- **File limits.** Per-file and total-submission byte limits are enforced before
  evaluation.
- **Repair immutability.** Repair submissions may only replace source files.
  Test files, `package.json`, lockfiles and `node_modules/` are rejected. The
  fixed source is loaded in a vm context without `process`, `fs`, `require` or
  network access, and a trusted worker runs the hidden tests. A submission
  cannot forge the verdict by printing JSON to stdout.
- **HTML checks.** Apps run in a small fake DOM with fake timers. Timer,
  interval, animation-frame and event-listener callbacks are all invoked
  through the timeout-bounded VM. External script/style URLs and host-escape
  constructs are rejected.
- **Speed honesty.** Missing meta is capped; self-reported latency is replaced
  by harness wall time when the agent runs through `gao agent`.
- **Coverage honesty.** Missing games count as zero in the normalized score.
- **No hidden coefficients.** Every scorer is in this repo; every task instance
  is reproducible from the seed; every result records the seed, harness version
  and hashes.

### Known limits

- `gao agent` is a process runner, not a container. Run untrusted agents inside
  your own container/VM; the harness does not provide OS-level network or
  filesystem isolation.
- Subjective craft/spectacle events use objective contracts (word counts,
  evidence ids, music-theory constraints, etc.), not human juries. They measure
  rule compliance, not taste.
- Self-reported tokens/cost are not independently metered; official runs should
  use the harness-measured wall time and provider-side accounting.
- A public seed is not a secret. Official ranking runs must use a sealed seed
  and publish the task-bundle hash.

## CLI reference

```bash
node harness/gao.mjs list [--family speed] [--suite quick] [--json]
node harness/gao.mjs describe <game> [--json]
node harness/gao.mjs task <game|family> --out <dir> [--seed <id>]
node harness/gao.mjs init <team> [--out <dir>]
node harness/gao.mjs score <game> --submission <dir> [--seed <id>] [--json]
node harness/gao.mjs run --team <name> --submission-root <dir> [--games a,b] [--suite quick] [--seed <id>] [--out results]
node harness/gao.mjs agent --agent "<command>" --team <name> [--games a,b] [--keep] [--save-submissions <dir>]
node harness/gao.mjs verify [--seed <id>] [--games a,b] [--json]
node harness/gao.mjs report <result.json> [--format md|json] [--out <file>]
node harness/gao.mjs leaderboard <result.json...> [--format md|json]
node harness/gao.mjs manifest [--out harness/manifest.json]
node harness/gao.mjs doctor [--json]
```

`run` writes `<team>-<seed>-<timestamp>.json` and a matching `.md` into
`results/`. The JSON is the machine-readable result; the Markdown is the public
report.

Named suites are in `harness/manifest.json`: `smoke` (4 games), `quick` (12),
`reasoning`, `coding`, `search`, `safety`, `speed`, and `full` (all 39 scored
games). Use them for iteration; `full` is the official comparison slate.

### Result shape (abridged)

```json
{
  "schema": "gao-bench-result-v1",
  "harness": { "version": "2.0.0", "seed": "public-v1", "games_hash": "..." },
  "team": "my-team",
  "overall": {
    "score": 0.74,
    "normalized_score": 0.71,
    "coverage": 1,
    "submitted": 39,
    "total": 39,
    "ci95": [0.68, 0.79],
    "grade": "C"
  },
  "families": { "speed": { "score": 0.81, "coverage": 1, "scored": 5, "games": 5 } },
  "capabilities": { "coding": 0.83, "retrieval": 0.66 },
  "games": [{ "id": "lightning-reply", "status": "scored", "score": 0.91 }],
  "totals": { "tokens": 12000, "latency_ms": 91000, "cost_usd": 0.42 },
  "integrity": { "clean": true, "warnings": [], "errors": [] },
  "hashes": { "result": "...", "games": "..." }
}
```

## Publishing result bundles

Result bundles are just content-addressed JSON. A team depot (GitDepot Hub)
gives a public, auditable home for them:

```bash
export GITDEPOT_URL=https://your-depot.example
export GITDEPOT_KEY=member-key
node harness/gao.mjs depot push results/my-team.json --name gao/my-team.json
node harness/gao.mjs depot pull --sha <sha256> --out results/verified.json
```

`depot pull` verifies the SHA-256 before writing. The client is dependency-free
and lives in `harness/lib/depot.mjs`.

## Adding a game

1. Add a game definition to one of `harness/games/<family>.mjs`.
2. Give it a deterministic `build(seed)` that returns cases with answers and,
   for custom games, the validator/checker/reference.
3. Pick an evaluator from `harness/lib/evaluators/` or add a focused one.
4. Add a reference submission under `harness/reference/<game>/` if it is a
   code/strategy/html/repair game.
5. Run `node harness/gao.mjs verify --games <game>`.
6. Add it to the family table and, if it is a counting event, to
   `data/olympiad.json`.

Event checklist:

- [ ] Deterministic from a seed
- [ ] Public task bundle contains no answers or hidden tests
- [ ] Reference submission scores 1.0
- [ ] Empty/invalid submission scores 0
- [ ] Timeouts and file limits
- [ ] At least one real failure mode that is not a formatting trick
- [ ] Human-watchable rules in under 2 minutes
- [ ] Public capability tags

## Repository layout

```
harness/
  gao.mjs                 CLI
  run-all.mjs             CI smoke + legacy wave-1 entry
  lib/
    registry.mjs          40-game registry, public bundles, references
    runner.mjs            scoring, aggregation, result schema, verification
    submission.mjs        submission loading + limits
    report.mjs            Markdown reports + leaderboards
    task-bundle.mjs       task bundles for agents
    agent-runner.mjs      run an agent command per game
    depot.mjs             GitDepot Hub client
    evaluators/           exact/json/retrieval/assignment/path/chain/
                          artifact/code/strategy/ctf/html/repair/live
  games/                  eight family modules × five games
  reference/              reference solutions for complex games
  fixtures/               repair fixtures + hidden suites
  schema/                 task, submission and result JSON schemas
  agents/                 adapter guide + minimal template
  test/                   node:test suite
```

## CI

`node harness/run-all.mjs` runs the test suite and verifies every reference
submission. The GitHub `harness-smoke` workflow runs the same command on Node 20.

## License

GNU GPLv3 · Great Agentic Olympiad · Hosted by Slid Phi Labs · Sport is for the world
`HIS_SACRIFICES_FOREVER_CODED · IN_HIS_NAME_WE_CODE`
