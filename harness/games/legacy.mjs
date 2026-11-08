import { makeRng, WORD_BANK } from "../lib/games-helpers.mjs";
import { clamp, round } from "../lib/util.mjs";

/* ----------------------------- Record Breakers ----------------------------- */

function corpusText(rng, n) {
  const sentences = Array.from({ length: 40 }, () => {
    const words = rng.sample(WORD_BANK, rng.int(4, 9));
    return `${words.join(" ")} ${rng.pick([".", "!", "?"])}`;
  });
  let out = "";
  while (out.length < n) out += `${rng.pick(sentences)} `;
  return out.slice(0, n);
}

function corpusJson(rng, n) {
  const rows = [];
  while (JSON.stringify(rows).length < n) {
    rows.push({
      id: rows.length + 1,
      name: rng.pick(WORD_BANK),
      score: rng.int(1, 100),
      tags: rng.sample(["agent", "bench", "safety", "search", "team"], rng.int(1, 3)),
    });
  }
  return JSON.stringify(rows).slice(0, n);
}

function corpusDna(rng, n) {
  const motif = Array.from({ length: rng.int(6, 14) }, () => "ACGT"[rng.int(0, 3)]).join("");
  let out = "";
  while (out.length < n) out += motif + "ACGT"[rng.int(0, 3)] + motif;
  return out.slice(0, n);
}

function recordCase(rng, i) {
  const size = 12000;
  const corpora = [
    { name: "prose", text: corpusText(rng, size), target: 2.2 },
    { name: "json", text: corpusJson(rng, size), target: 2.6 },
    { name: "dna", text: corpusDna(rng, size), target: 2.4 },
  ];
  return {
    id: `record-${i + 1}`,
    entry: "encode",
    publicTests: 1,
    prompt:
      "Record Breakers — build a lossless compressor. Export encode(text) -> string and decode(packet) -> original text. The score is original bytes / packet bytes, capped by each hidden target. Round-trip must be exact.",
    tests: corpora.map((c) => ({ name: c.name, text: c.text, target: c.target })),
  };
}

const recordBreakers = {
  id: "record-breakers",
  name: "Record Breakers",
  family: "legacy",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["compression", "coding", "optimization"],
  summary: "Write a lossless compressor and beat the published ratio targets.",
  rules:
    "encode/decode must round-trip exactly. Score per corpus is min(1, original/packet ÷ target). A failed round-trip scores zero for that corpus.",
  submission: "code",
  evaluator: "code",
  instructions: "Submit solution.js exporting encode(text) and decode(packet) as CommonJS.",
  reference: "record-breakers/solution.js",
  limits: { max_file_bytes: 256 * 1024, test_timeout_ms: 3000, agent_timeout_s: 240 },
  build(seed) {
    const rng = makeRng(`record:${seed}`);
    return Array.from({ length: 2 }, (_, i) => recordCase(rng, i));
  },
  runTest(call, test) {
    const started = Date.now();
    const packet = call("encode", [test.text]);
    const back = call("decode", [packet]);
    const elapsed = Date.now() - started;
    return { back, packet, length: String(packet).length, elapsed };
  },
  scoreTest(result, test) {
    const ok = result.back === test.text;
    const original = Buffer.byteLength(test.text, "utf8");
    const packed = Buffer.byteLength(String(result.packet), "utf8");
    const ratio = packed > 0 ? original / packed : Infinity;
    const score = ok ? clamp(ratio / test.target) : 0;
    return {
      score,
      reason: `${ok ? "round-trip" : "ROUND-TRIP FAILED"}; ratio ${round(ratio, 2)} target ${test.target}; ${result.elapsed}ms`,
    };
  },
};

/* ----------------------------- Fame Circuit ----------------------------- */

function fameCase(rng, i) {
  const project = rng.pick(["open transit map", "repair cafe", "civic sensor kit", "language tutor", "flood alert"]);
  const evidence = [
    { id: `P${i + 1}A`, claim: `${rng.int(20, 90)} people used the pilot in ${rng.int(2, 8)} weeks` },
    { id: `P${i + 1}B`, claim: `${rng.int(10, 60)}% faster than the old workflow` },
    { id: `P${i + 1}C`, claim: `${rng.int(2, 12)} partner groups asked to keep it running` },
  ];
  const artifact = {
    hook: `A ${project} that anyone can rerun from one public command.`,
    story: `We built ${project} because the current workflow wastes time and hides its failures. The pilot ran for ${rng.int(
      3,
      8
    )} weeks with a public log. People used it without a training session, and the failures were visible enough to fix. The demo shows the whole loop: open, run, measure, publish. The log includes the failures, not just the wins. Anyone can rerun the command and check the same numbers.`,
    evidence: evidence.map((e) => e.id),
    ask: "Adopt the pilot for one more quarter and publish the audit.",
    duration_s: rng.int(45, 90),
    audience: rng.pick(["civic volunteers", "student builders", "small-city planners"]),
    project,
    evidenceCards: evidence,
  };
  const c = { id: `fame-${i + 1}`, project, evidence, expected: artifact, answer: artifact };
  c.prompt = `Fame Circuit — demo ${i + 1}\nProject: ${project}\nEvidence cards: ${evidence.map((e) => `${e.id}: ${e.claim}`).join("; ")}\n\nWrite a 60-second public demo JSON: { hook, story, evidence: [id], ask, duration_s, audience }. Every evidence card must be cited. Stay under 90 seconds and avoid guarantees.`;
  return c;
}

function fameCheck(artifact, c) {
  const checks = [];
  const push = (name, ok) => checks.push({ name, ok });
  const words = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;
  push("hook <= 20 words", words(artifact?.hook) >= 5 && words(artifact?.hook) <= 20);
  push("story 60-140 words", words(artifact?.story) >= 60 && words(artifact?.story) <= 140);
  push("all evidence cited", c.evidence.every((e) => (artifact?.evidence || []).includes(e.id)));
  push("ask <= 25 words", words(artifact?.ask) >= 5 && words(artifact?.ask) <= 25);
  push("duration 45-90s", Number(artifact?.duration_s) >= 45 && Number(artifact?.duration_s) <= 90);
  push("audience named", typeof artifact?.audience === "string" && artifact.audience.length > 3);
  const text = JSON.stringify(artifact || {}).toLowerCase();
  push("no guarantees", !/guarantee|risk-free|always works/.test(text));
  const total = checks.length;
  const passed = checks.filter((x) => x.ok).length;
  return { score: total ? passed / total : 0, checks, reason: `${passed}/${total} demo checks passed` };
}

const fameCircuit = {
  id: "fame-circuit",
  name: "Fame Circuit",
  family: "legacy",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["communication", "storytelling", "evidence"],
  summary: "Pitch a public demo in JSON: hook, story, evidence, ask, and a 90-second clock.",
  rules:
    "Cite every evidence card. Hook is at most 20 words; story is 60–140 words; the ask is at most 25 words; duration is 45–90 seconds. No guarantees.",
  submission: "artifact",
  evaluator: "artifact",
  instructions: "Submit artifacts[caseId] = { hook, story, evidence: [id], ask, duration_s, audience }.",
  limits: { max_file_bytes: 128 * 1024 },
  build(seed) {
    const rng = makeRng(`fame:${seed}`);
    return Array.from({ length: 3 }, (_, i) => fameCase(rng, i));
  },
  check(artifact, c) {
    return fameCheck(artifact, c);
  },
};

/* ----------------------------- Charity Hack Relay ----------------------------- */

const CAUSES = ["clean water", "open textbooks", "repair clinics", "flood sensors", "legal aid", "vaccine logistics", "tree nurseries", "mental-health lines"];

function charityCase(rng, i) {
  const causes = CAUSES.map((name, j) => ({
    id: `C${j + 1}`,
    name,
    impactPerUnit: rng.int(1, 10),
    min: rng.int(0, 4),
    max: rng.int(8, 30),
  }));
  const budget = rng.int(80, 120);
  // DP over integer units.
  const dp = Array.from({ length: causes.length + 1 }, () => new Array(budget + 1).fill(-Infinity));
  dp[0][0] = 0;
  const take = Array.from({ length: causes.length + 1 }, () => new Array(budget + 1).fill(0));
  for (let ci = 0; ci < causes.length; ci++) {
    const c = causes[ci];
    for (let b = 0; b <= budget; b++) {
      if (!Number.isFinite(dp[ci][b])) continue;
      for (let x = c.min; x <= c.max && b + x <= budget; x++) {
        const val = dp[ci][b] + x * c.impactPerUnit;
        if (val > dp[ci + 1][b + x]) {
          dp[ci + 1][b + x] = val;
          take[ci + 1][b + x] = x;
        }
      }
    }
  }
  let bestB = 0;
  for (let b = 1; b <= budget; b++) if (dp[causes.length][b] > dp[causes.length][bestB]) bestB = b;
  const optimum = dp[causes.length][bestB];
  const allocations = {};
  let b = bestB;
  for (let ci = causes.length; ci >= 1; ci--) {
    const x = take[ci][b];
    allocations[causes[ci - 1].id] = x;
    b -= x;
  }
  // Greedy baseline: fund minimums, then fill highest impact/unit.
  const baselineAlloc = Object.fromEntries(causes.map((c) => [c.id, c.min]));
  let left = budget - causes.reduce((s, c) => s + c.min, 0);
  const order = [...causes].sort((a, b2) => b2.impactPerUnit - a.impactPerUnit);
  for (const c of order) {
    const add = Math.min(left, c.max - baselineAlloc[c.id]);
    baselineAlloc[c.id] += add;
    left -= add;
  }
  const baseline = causes.reduce((s, c) => s + baselineAlloc[c.id] * c.impactPerUnit, 0);
  const c = {
    id: `charity-${i + 1}`,
    causes,
    budget,
    answer: { allocations },
    expected: { allocations },
    optimum,
    baseline,
  };
  c.prompt = `Charity Hack Relay — round ${i + 1}\nBudget: ${budget} units\nCauses:\n${causes
    .map((x) => `- ${x.id} ${x.name}: impact ${x.impactPerUnit}/unit, min ${x.min}, max ${x.max}`)
    .join("\n")}\n\nAllocate integer units. Every cause must be at least its minimum and at most its maximum; total may not exceed the budget. Maximise total impact. Return { allocations: { causeId: units } }.`;
  return c;
}

function validateCharity(answer, c) {
  const a = answer?.allocations;
  if (!a || typeof a !== "object") return { ok: false, reason: "allocations missing" };
  let total = 0;
  for (const cause of c.causes) {
    const x = a[cause.id] ?? 0;
    if (!Number.isInteger(x)) return { ok: false, reason: `${cause.id} is not an integer` };
    if (x < cause.min || x > cause.max) return { ok: false, reason: `${cause.id} outside [${cause.min}, ${cause.max}]` };
    total += x;
  }
  if (total > c.budget) return { ok: false, reason: `over budget ${total}/${c.budget}` };
  return { ok: true };
}

function charityValue(answer, c) {
  return c.causes.reduce((s, cause) => s + (answer.allocations[cause.id] ?? 0) * cause.impactPerUnit, 0);
}

const charityHack = {
  id: "charity-hack",
  name: "Charity Hack Relay",
  family: "legacy",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["allocation", "optimization", "social-impact"],
  summary: "Allocate a fixed grant across public-good causes under floor and ceiling rules.",
  rules:
    "Integer units only. Every cause has a minimum and maximum. Total cannot exceed the budget. Score is normalised between the greedy baseline and the optimum.",
  submission: "answers",
  evaluator: "assignment",
  instructions: "Submit answers[caseId] = { allocations: { causeId: units } }.",
  limits: { max_file_bytes: 128 * 1024 },
  build(seed) {
    const rng = makeRng(`charity:${seed}`);
    return Array.from({ length: 5 }, (_, i) => charityCase(rng, i));
  },
  validate: validateCharity,
  value: charityValue,
};

/* ----------------------------- Council Crucible ----------------------------- */

const BLOCS = ["labor", "civic", "industry", "research", "youth", "rural", "health", "housing"];

function councilCase(rng, i) {
  const blocs = rng.sample(BLOCS, 6).map((name) => ({
    id: name,
    weight: rng.int(5, 30),
    stance: rng.pick(["for", "against", "undecided"]),
  }));
  // Ensure at least one undecided and a real contest.
  if (!blocs.some((b) => b.stance === "undecided")) blocs[0].stance = "undecided";
  if (!blocs.some((b) => b.stance === "for")) blocs[1].stance = "for";
  if (!blocs.some((b) => b.stance === "against")) blocs[2].stance = "against";
  const baseYes = blocs.filter((b) => b.stance === "for").reduce((s, b) => s + b.weight, 0);
  const baseNo = blocs.filter((b) => b.stance === "against").reduce((s, b) => s + b.weight, 0);
  const undecided = blocs.filter((b) => b.stance === "undecided");
  const flips = [...undecided].sort((a, b) => b.weight - a.weight).slice(0, 3).map((b) => b.id);
  const yesWeight = baseYes + flips.reduce((s, id) => s + blocs.find((b) => b.id === id).weight, 0);
  const noWeight = baseNo;
  const passes = yesWeight / Math.max(1, yesWeight + noWeight) >= 0.66;
  const c = {
    id: `council-${i + 1}`,
    blocs,
    threshold: 0.66,
    baseYes,
    baseNo,
    flips,
    expected: { passes, yes_weight: yesWeight, no_weight: noWeight, flips },
    answer: { passes, yes_weight: yesWeight, no_weight: noWeight, flips },
  };
  c.prompt = `Council Crucible — session ${i + 1}\nProposal: adopt the open audit rule. Threshold: ${c.threshold * 100}% of cast weight.\nBlocs:\n${blocs
    .map((b) => `- ${b.id}: weight ${b.weight}, stance ${b.stance}`)
    .join("\n")}\n\nYou may flip up to 3 undecided blocs. Return { passes, yes_weight, no_weight, flips: [blocId] }.`;
  return c;
}

function councilCheck(answer, c) {
  const exp = c.expected;
  const yesOk = Number(answer?.yes_weight) === exp.yes_weight;
  const noOk = Number(answer?.no_weight) === exp.no_weight;
  const passOk = Boolean(answer?.passes) === exp.passes;
  const actual = new Set(Array.isArray(answer?.flips) ? answer.flips : []);
  const expected = new Set(exp.flips);
  let hit = 0;
  for (const x of expected) if (actual.has(x)) hit++;
  const precision = actual.size ? hit / actual.size : 0;
  const recall = expected.size ? hit / expected.size : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const score = (yesOk ? 0.25 : 0) + (noOk ? 0.25 : 0) + (passOk ? 0.2 : 0) + f1 * 0.3;
  return { score, reason: `yes ${yesOk ? "ok" : "wrong"}; no ${noOk ? "ok" : "wrong"}; outcome ${passOk ? "ok" : "wrong"}; flips F1 ${f1.toFixed(2)}`, checks: { yesOk, noOk, passOk, f1 } };
}

const councilCrucible = {
  id: "council-crucible",
  name: "Council Crucible",
  family: "legacy",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["governance", "weighted-voting", "optimization"],
  summary: "Tally a weighted ballot and spend three persuasion points on the best flips.",
  rules:
    "Only undecided blocs can flip, up to three. Compute the final weighted yes/no tally and whether it clears 66% of cast weight.",
  submission: "answers",
  evaluator: "json",
  instructions: "Submit answers[caseId] = { passes, yes_weight, no_weight, flips: [blocId] }.",
  limits: { max_file_bytes: 128 * 1024 },
  build(seed) {
    const rng = makeRng(`council:${seed}`);
    return Array.from({ length: 6 }, (_, i) => councilCase(rng, i));
  },
  check(artifact, c) {
    return councilCheck(artifact, c);
  },
};

/* ----------------------------- Closing Medals ----------------------------- */

const closingMedals = {
  id: "closing-medals",
  name: "Closing Medals",
  family: "legacy",
  mode: "aggregate",
  version: "2.0.0",
  weight: 1,
  capability: ["aggregation", "records"],
  summary: "The closing ceremony: gold, silver and bronze derived from the full benchmark report.",
  rules:
    "This event has no standalone task. `gao report` and `gao leaderboard` compute medals from the scored games, with coverage and tie-breaks published.",
  submission: "live",
  evaluator: "aggregate",
  instructions: "No submission. Reported by the harness aggregate.",
  limits: {},
  build() {
    return [{ id: "medals", prompt: "Computed from all scored games by gao report." }];
  },
};

export const games = [recordBreakers, fameCircuit, charityHack, councilCrucible, closingMedals];