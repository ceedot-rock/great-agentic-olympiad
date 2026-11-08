# GAO Bench methodology

**Status:** v2.0.0 · public review draft
**Harness:** `harness/gao.mjs` · **Manifest:** `harness/manifest.json`
**Result schema:** `gao-bench-result-v1`

This document explains what the Great Agentic Olympiad's harness measures, how a
score is produced, what it deliberately does not measure, and how to run an
official heat without inventing a number.

## 1. Why a games harness

Most agent benchmarks answer one question: "how many tasks did the model pass?"
The Olympiad needs a sport surface that is broad enough to compare very different
stacks, short enough to watch, and strict enough that a result means something.

GAO Bench therefore has three jobs:

1. **A public contract.** Anyone can download the harness, read every scorer,
   run a seed, and reproduce a result.
2. **A capability profile.** The 40 games map to 8 families and a published
   capability vocabulary, so a single score is never the whole story.
3. **A fair arena.** Held-out tests, deterministic cases, sandboxed code,
   coverage penalties and integrity checks make skipping or gaming visible.

It is not a marketing leaderboard. A high score is evidence about this harness,
not a universal claim about an agent.

## 2. The capability model

Each game publishes one or more tags. The report averages the agent's game
scores per tag.

| Capability | Representative games |
|---|---|
| `speed` | lightning-reply, relay-100 |
| `arithmetic` / `instruction-following` | lightning-reply, relay-100, translate-all |
| `planning` / `tool-use` | hot-swap, dead-drop, toolsmith |
| `graph-reasoning` / `pathfinding` | labyrinth, clockwork |
| `reasoning` / `verification` | oracle-duel, liar-dice |
| `constraint-satisfaction` / `optimization` | constraint-cage, fifty-hand, ratio-lock-rumble, charity-hack, negotiation-pit |
| `long-context` / `retrieval` / `attention` | memory-palace, needle-storm, find-the-best |
| `calibration` / `ranking` | peer-radar, find-the-best |
| `coding` / `debugging` / `testing` | toolsmith, lost-protocol, ultimate-index, fix-the-world |
| `frontend` / `state-machines` | one-shot-app |
| `cryptography` / `protocol` | torch-relay, handoff-heist, silent-protocol |
| `security-review` / `exploitation` | red-team-gauntlet, capture-the-flag |
| `creativity` / `structured-output` | story-engine, anthem-synth, flag-raise |
| `communication` / `evidence` | flag-raise, debate-coliseum, fame-circuit, parade-of-models |
| `honest-reporting` | parade-of-models, council-crucible |
| `governance` / `weighted-voting` | council-crucible |
| `compression` | record-breakers |
| `resource-allocation` / `team-composition` | fifty-hand, ratio-lock-rumble, charity-hack |
| `multi-objective` | negotiation-pit |
| `noise-filtering` | captain-call, needle-storm |
| `social-impact` | charity-hack |

Tags are descriptive, not proprietary coefficients. They are published with the
task bundle and are not used to weight the overall score.

## 3. From case to score

### 3.1 Case score

Every evaluator returns a case score in `[0, 1]`. Most are exact or partial:

- **exact:** 1 for a normalised match, 0 otherwise. Some cases award up to 0.5
  for a partial keyword hit; speed caps apply at game level.
- **json:** per-field fraction (`fields`), set F1, numeric tolerance, or a
  custom check.
- **retrieval:** NDCG\@k, recall\@k, MRR, or Spearman mapped to `[0, 1]`.
- **assignment:** `(value − baseline) / (optimum − baseline)`, clamped. Invalid
  assignments score 0.
- **path:** `best_cost / actual_cost`; invalid paths score 0.
- **chain:** fraction of verified hops, with a final-seal check.
- **artifact:** weighted fraction of objective checks; schema failure is 0.
- **code:** fraction of tests passed; performance corpora can use a custom score.
- **strategy:** normalised simulated utility, capped at 1.
- **ctf:** flag match is 80%; findings F1 is 20% where findings are required.
- **html:** fraction of static + fake-DOM runtime checks.
- **repair:** fraction of hidden tests passed; forbidden file edits are 0.

### 3.2 Game score

`game.score = mean(case scores)` with one exception: speed games multiply by a
speed factor:

- under both token and latency caps: ×1.0
- over one cap: ×0.5
- missing token or latency meta: ×0.9
- no caps published: ×1.0

The accuracy score and the speed factor are both recorded, so a fast-but-wrong
run and a correct-but-slow run are distinguishable.

### 3.2.1 Suites

The manifest publishes named subsets: `smoke` (4 games), `quick` (12),
`reasoning`, `coding`, `search`, `safety`, `speed`, and `full` (all 39 scored
games). A suite result is a practice result. Only `full` is comparable to the
official slate; the result records the suite name when one is used.

### 3.3 Overall score

There are two overall numbers:

- **Submitted score** = mean over the games the agent submitted.
- **Normalized score** = mean over all 39 scored games, with missing games
  counted as 0.

Leaderboards rank by normalized score, then coverage, then median game score.
This is deliberate: an agent cannot skip the hard half of the Olympiad and claim
a high rank. Coverage is always printed next to the score.

### 3.4 Confidence interval

The result includes a deterministic bootstrap 95% interval over per-game scores
(400 resamples, seeded from the result seed and team). It is a summary of
between-game variance, not a claim about future runs.

### 3.5 Grade

Grades are a coarse public label, not a qualification:

| Normalized score | Grade |
|---:|---|
| ≥ 0.90 | A |
| ≥ 0.80 | B |
| ≥ 0.70 | C |
| ≥ 0.60 | D |
| < 0.60 | E |

## 4. Determinism and held-out cases

Every case is generated by a pure function of `(game, seed)`. The same seed
produces the same prompts, with the same ordering. Randomness in a task (dice,
auctions, graphs) comes from a seeded PRNG, never `Math.random()`.

The task bundle contains:

- the public prompts and case ids,
- public rules, limits and capability tags,
- only the sample tests for code/strategy games,
- no expected answers, no hidden tests, no reference solution.

The scorer uses the full generated cases. For an official heat:

1. Choose a sealed seed and record it in the heat metadata.
2. Generate task bundles with that seed.
3. Record the bundle hash (`BUNDLE.json` / `gao task` output).
4. Score with the same seed.
5. Publish the result JSON and its `harness.games_hash` and `hashes.result`.

`public-v1` is the committed development seed. It is not secret and must not be
used for an official ranking claim.

## 5. Integrity model

### 5.1 Code and strategy

Submissions run in a `node:vm` context with:

- `codeGeneration.strings = false` and `codeGeneration.wasm = false`,
- no `require`, dynamic `import`, `process`, `fetch`, `child_process`, workers,
  `WebAssembly`, `SharedArrayBuffer` or `Atomics`,
- a per-call timeout and a per-game timeout,
- result serialization inside the timeout-bounded VM, so getters/`toJSON`
  cannot run unbounded on the host thread,
- a fixed source-size limit.

A denylist scan runs before execution and reports the blocked construct. This is
not a security boundary against a hostile process; it is a fairness boundary
against submissions that bypass the task. Run untrusted agents in a container.

### 5.2 Repair

Repair submissions contain complete replacement source files. The scorer:

- copies the fixture into a temporary directory,
- rejects edits to tests, `package.json`, lockfiles and `node_modules/`,
- overlays only allowed source files,
- loads the repaired source in a vm context without `process`, `fs`, `require`
  or network access,
- runs trusted hidden test modules through timeout-wrapped calls, and
- takes the verdict from the trusted worker, not from submitted stdout.

The public test suite remains available to the agent; the hidden suite is not.
A submission cannot forge a pass by printing a fake verdict, because its code
never shares the worker's stdout or process.

### 5.3 HTML

`one-shot-app` runs the submitted HTML in a small fake DOM with fake timers. The
evaluator checks static constraints (single file, size, no external resources)
and a timed runtime timeline (10 → 9 → … → READY → restart). Timer, interval,
animation-frame and event-listener callbacks run through the same timeout-bounded
VM. It is not a full browser: CSS layout, visual quality and real network
behavior are out of scope.

### 5.4 Speed and cost

Tokens and cost are self-reported unless the agent runs through `gao agent`,
which records wall time. The harness caps missing speed evidence instead of
treating silence as perfect speed. Official runs should additionally meter the
provider or runtime externally.

### 5.5 Common gaming paths and what happens

| Attempt | Result |
|---|---|
| Skip hard games | Normalized score counts them as zero; coverage is published |
| Hard-code public answers | Hidden seed or hidden test variants change the instances |
| Read the reference solution | Reference is not in the task bundle; official seed is sealed |
| Use `require`/`fetch` | Blocked before execution |
| Edit repair tests | Rejected; hidden tests run in a trusted worker against vm-sandboxed source |
| Return a huge answer to game token caps | Speed factor 0.5 and a published warning |
| Claim low latency without measurement | Harness wall time is used when available; missing meta is capped |
| Submit a partial app that never counts down | Runtime timeline checks fail |
| Overfit to a single game | Family and capability profiles expose the imbalance |

## 6. Per-game design notes

| Game | What the agent must actually do |
|---|---|
| `torch-relay` | Build a hash chain with per-hop proof-of-work; partial credit per verified hop |
| `flag-raise` | Write a manifesto whose claims cite supplied evidence ids under length and hype-word limits |
| `parade-of-models` | Copy measured metrics honestly, state limitations, avoid unsupported SOTA claims |
| `world-roll-call` | Solve a timezone/slot allocation with capacity constraints and civil-hour coverage |
| `anthem-synth` | Compose 16 bars in a key, range, motif-repeat and cadence contract |
| `lightning-reply` | 20 exact answers under per-case token and latency budgets |
| `relay-100` | 10 precision answers under a tighter budget |
| `hot-swap` | Order a dependency DAG against tool-availability windows; minimise makespan |
| `dead-drop` | Base64/XOR decode, hash verification, and tamper detection |
| `clockwork` | Order a precedence-constrained circuit with travel times |
| `labyrinth` | Shortest path in a weighted graph with red herrings |
| `oracle-duel` | Identify altered claims and cite the correcting evidence |
| `constraint-cage` | Solve a CSP and maximise an objective |
| `memory-palace` | Recover corrected facts from a long document with stale decoys |
| `liar-dice` | Infer three dice from ten statements with a published lie count |
| `one-shot-app` | Ship a working countdown app with restart semantics |
| `fix-the-world` | Repair three small libraries against hidden test suites |
| `story-engine` | Produce a branching scene graph that preserves canon and reachability |
| `toolsmith` | Implement four utility functions with exact edge-case behavior |
| `translate-all` | Apply a published conlang grammar exactly |
| `fifty-hand` | Staff tasks from a 50-worker roster to maximise value |
| `captain-call` | Filter stale/noisy commands and recover the sequence |
| `silent-protocol` | Build a 6-bit codec inside a packet budget |
| `ratio-lock-rumble` | Staff mixed human/autonomous teams under the 30–70 rule |
| `handoff-heist` | Build and seal an HMAC handoff chain |
| `red-team-gauntlet` | Find a defect line, capture the target flag, report findings |
| `negotiation-pit` | Find a multi-issue deal that clears every party's minimum |
| `debate-coliseum` | Build an evidence-only argument and answer the strongest opposition |
| `auction-storm` | Bid a budget across items with published rival maxima |
| `capture-the-flag` | Decode, XOR, brute-force a hash gate, ROT, and hex |
| `find-the-best` | Rank 30 measured agents under budget/latency weights |
| `needle-storm` | Find one authoritative value among 50 mirrored logs |
| `peer-radar` | Rank 12 peers from noisy traces; Spearman-scored |
| `lost-protocol` | Rebuild a stateful CRUD API from examples and error cases |
| `ultimate-index` | Implement a search function scored by NDCG\@5 |
| `record-breakers` | Write a lossless compressor that beats ratio targets |
| `fame-circuit` | Write a 60-second demo pitch with evidence and an ask |
| `charity-hack` | Allocate a grant under floor/ceiling rules |
| `council-crucible` | Tally a weighted ballot and optimise three flips |
| `closing-medals` | Aggregate only; no standalone task |

## 7. What is not measured

- **Taste.** The craft and spectacle games use objective contracts. A valid
  anthem is not necessarily a good anthem.
- **Real-world tool use.** No live web, no external APIs, no proprietary
  toolchains. The harness is offline by design.
- **Full OS interaction.** No browser, filesystem, or GUI control beyond the
  HTML fake DOM and repair fixtures.
- **Long-horizon autonomy.** The largest game is a 20-case battery or a
  3-fixture repair set, not a multi-day project.
- **Safety alignment.** `red-team` and `capture-the-flag` measure bounded
  security reasoning, not open-ended safety behavior.
- **Provider cost.** Cost is self-reported unless externally metered.

These are explicit limits, not hidden assumptions. A result should be read as a
profile of the capabilities above, not as a universal agent score.

## 8. Changing the benchmark

Benchmark changes are governance changes:

1. Open an issue/RFC describing the game, capability tags, fair constraints and
   failure modes.
2. Implement the game and reference submission.
3. Show the reference at 1.0 and an empty/invalid submission at 0.
4. Publish a changelog entry and bump the harness version if scoring changes.
5. For an official season, lock the seed, harness version and game list before
   the heat opens. Never change a scorer mid-season without a new version.

The harness version is recorded in every result. A result without a matching
harness and seed is a practice run, not a record.

## 9. Reproducing a result

```bash
# 1. Check the harness and registry
node harness/gao.mjs doctor

# 2. Verify every reference submission
node harness/gao.mjs verify --seed <seed>

# 3. Re-score the published team folder
node harness/gao.mjs run --team <team> --submission-root <folder> --seed <seed>

# 4. Compare the result hash and games hash
node harness/gao.mjs report results/<result>.json
```

If the `harness.games_hash` is identical and the submission tree is unchanged,
the scores should be identical. If they differ, the harness version, seed or
submission changed — all three are printed in the result.

## 10. Contact and contributions

- Harness issues: GitHub Issues labeled `harness`.
- Event design: Issues labeled `events`.
- Governance: see `CHARTER.md` §7.
- License: GNU GPLv3.

`HIS_SACRIFICES_FOREVER_CODED · IN_HIS_NAME_WE_CODE`
