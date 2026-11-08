import { makeRng, randomGraph } from "../lib/games-helpers.mjs";
import { round } from "../lib/util.mjs";

/* ----------------------------- Labyrinth ----------------------------- */

function labyrinthCase(rng, i) {
  const g = randomGraph(rng, {
    nodes: rng.int(11, 17),
    extra: rng.int(12, 20),
    minCost: 1,
    maxCost: 9,
  });
  const best = g.best;
  const c = {
    id: `lab-${i + 1}`,
    nodes: g.nodes,
    edges: g.edges,
    start: g.start,
    goal: g.goal,
    graph: { nodes: g.nodes, edges: g.edges, start: g.start, goal: g.goal },
    answer: { path: best.path, cost: best.cost },
    expectedCost: best.cost,
    expectedPath: best.path,
  };
  c.prompt = `The Labyrinth — heat ${i + 1}\nStart: ${g.start}   Exit: ${g.goal}\nNodes: ${g.nodes.join(", ")}\nEdges (from -> to : cost):\n${g.edges
    .map((e) => `${e.from} -> ${e.to} : ${e.cost}`)
    .join("\n")}\n\nRed herrings are everywhere. Return the cheapest path as { path: [node, ...], cost: number }.`;
  return c;
}

const labyrinth = {
  id: "labyrinth",
  name: "The Labyrinth",
  family: "mind",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["graph-reasoning", "pathfinding", "proof"],
  summary: "Find the cheapest exit through a weighted maze seeded with red herrings.",
  rules:
    "The graph is public. A valid path starts at Start, ends at Exit, never repeats a node, and follows real edges. Score is best-cost divided by your cost.",
  submission: "answers",
  evaluator: "path",
  instructions: "Submit answers[caseId] = { path: [node, ...], cost: number }.",
  limits: { max_file_bytes: 256 * 1024 },
  build(seed) {
    const rng = makeRng(`labyrinth:${seed}`);
    return Array.from({ length: 6 }, (_, i) => labyrinthCase(rng, i));
  },
};

/* ----------------------------- Oracle Duel ----------------------------- */

const FACT_BANK = [
  { subject: "Water", template: "Water boils at {v} °C at sea level.", value: 100 },
  { subject: "Light", template: "Light travels at about {v} km/s in vacuum.", value: 299792 },
  { subject: "Earth", template: "Earth has {v} natural moon(s).", value: 1 },
  { subject: "A triangle", template: "A triangle's interior angles sum to {v} degrees.", value: 180 },
  { subject: "DNA", template: "DNA uses {v} canonical bases.", value: 4 },
  { subject: "The human body", template: "A typical adult human body has {v} bones.", value: 206 },
  { subject: "A leap year", template: "A leap year has {v} days.", value: 366 },
  { subject: "A right angle", template: "A right angle measures {v} degrees.", value: 90 },
  { subject: "Mercury", template: "Mercury is planet number {v} from the Sun.", value: 1 },
  { subject: "The Pacific", template: "The Pacific is the largest ocean; its area rank is {v}.", value: 1 },
  { subject: "Sound", template: "Sound travels faster in steel than in air.", value: null },
  { subject: "Photosynthesis", template: "Photosynthesis converts light energy into chemical energy.", value: null },
];

function oracleCase(rng, i) {
  const facts = rng.sample(FACT_BANK, 6);
  const claims = facts.map((f, j) => {
    const falseClaim = rng.bool(0.4);
    let text;
    if (f.value === null) {
      text = falseClaim
        ? f.template.replace("faster", "slower").replace("into", "away from")
        : f.template;
    } else {
      const delta = falseClaim ? rng.pick([-2, -1, 1, 2, 10]) : 0;
      text = f.template.replace("{v}", String(f.value + delta));
    }
    const evidenceId = `EV${j + 1}`;
    return {
      id: `C${j + 1}`,
      text,
      false: falseClaim,
      evidenceId,
      evidence: `${evidenceId}: ${f.template.replace("{v}", String(f.value ?? "?"))}`,
    };
  });
  // Guarantee at least one false and one true claim.
  if (!claims.some((c) => c.false)) {
    claims[0].false = true;
    if (/\d/.test(claims[0].text)) claims[0].text = claims[0].text.replace(/\d+/, (n) => String(Number(n) + 1));
    else claims[0].text = "The Pacific is the smallest ocean on Earth; its area rank is 8.";
  }
  if (!claims.some((c) => !c.false)) {
    claims[1].false = false;
    claims[1].text = claims[1].evidence.replace(/^EV\d+: /, "");
  }
  const falseClaims = claims.filter((c) => c.false).map((c) => c.id);
  const evidence = Object.fromEntries(claims.filter((c) => c.false).map((c) => [c.id, c.evidenceId]));
  const c = {
    id: `oracle-${i + 1}`,
    claims,
    falseClaims,
    evidence,
    expected: { false_claims: falseClaims, evidence },
    answer: { false_claims: falseClaims, evidence },
  };
  c.prompt = `Oracle Duel — round ${i + 1}\nClaims:\n${claims.map((x) => `- ${x.id}: ${x.text}`).join("\n")}\n\nEvidence cards:\n${claims
    .map((x) => `- ${x.evidence}`)
    .join("\n")}\n\nIdentify every false claim and cite the evidence card that corrects it. Return { false_claims: [claimId], evidence: { claimId: evidenceId } }.`;
  return c;
}

function oracleCheck(answer, c) {
  const actual = new Set(Array.isArray(answer?.false_claims) ? answer.false_claims : []);
  const expected = new Set(c.falseClaims);
  let hit = 0;
  for (const x of expected) if (actual.has(x)) hit++;
  const precision = actual.size ? hit / actual.size : 0;
  const recall = expected.size ? hit / expected.size : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const cited = answer?.evidence && typeof answer.evidence === "object" ? answer.evidence : {};
  const citationHits = c.falseClaims.filter((id) => cited[id] === c.evidence[id]).length;
  const citationScore = c.falseClaims.length ? citationHits / c.falseClaims.length : 1;
  const score = f1 * 0.8 + citationScore * 0.2;
  return {
    score,
    reason: `false-claim F1 ${round(f1, 2)}; citations ${citationHits}/${c.falseClaims.length}`,
    checks: { f1, citationScore },
  };
}

const oracleDuel = {
  id: "oracle-duel",
  name: "Oracle Duel",
  family: "mind",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["reasoning", "verification", "citation"],
  summary: "Separate true claims from altered ones and cite the evidence that corrects each lie.",
  rules:
    "Some claims have been altered. Mark every false claim and pair it with the evidence card that proves the correction. False-claim F1 is 80% of the score; citation accuracy is 20%.",
  submission: "answers",
  evaluator: "json",
  instructions: "Submit answers[caseId] = { false_claims: [claimId], evidence: { claimId: evidenceId } }.",
  limits: { max_file_bytes: 128 * 1024 },
  build(seed) {
    const rng = makeRng(`oracle:${seed}`);
    return Array.from({ length: 6 }, (_, i) => oracleCase(rng, i));
  },
  check(artifact, c) {
    return oracleCheck(artifact, c);
  },
};

/* ----------------------------- Constraint Cage ----------------------------- */

function cspCase(rng, i) {
  const n = rng.int(5, 6);
  const vars = Array.from({ length: n }, (_, j) => `V${j + 1}`);
  const domains = {};
  for (const v of vars) {
    const pool = new Set();
    while (pool.size < rng.int(3, 5)) pool.add(rng.int(1, 7));
    domains[v] = [...pool].sort((a, b) => a - b);
  }
  const seed = Object.fromEntries(vars.map((v) => [v, rng.pick(domains[v])]));
  const constraints = [];
  const add = (con) => {
    if (constraints.some((x) => JSON.stringify(x) === JSON.stringify(con))) return;
    constraints.push(con);
  };
  // Constraints are generated from a known-good seed assignment, so the CSP
  // always has at least one solution.
  for (let k = 0; k < n + 3; k++) {
    const kind = rng.pick(["neq", "lt", "sum", "mod"]);
    if (kind === "neq") {
      const a = rng.pick(vars);
      const b = rng.pick(vars.filter((v) => v !== a));
      if (seed[a] === seed[b]) continue;
      add({ kind, a, b, text: `${a} != ${b}` });
    } else if (kind === "lt") {
      const a = rng.pick(vars);
      const b = rng.pick(vars.filter((v) => v !== a));
      if (!(seed[a] < seed[b])) continue;
      add({ kind, a, b, text: `${a} < ${b}` });
    } else if (kind === "sum") {
      const a = rng.pick(vars);
      const b = rng.pick(vars.filter((v) => v !== a));
      add({ kind, a, b, target: seed[a] + seed[b], text: `${a} + ${b} = ${seed[a] + seed[b]}` });
    } else {
      const a = rng.pick(vars);
      const m = rng.int(2, 4);
      add({ kind, a, b: null, target: m, remainder: seed[a] % m, text: `${a} % ${m} = ${seed[a] % m}` });
    }
  }
  const satisfies = (a) =>
    constraints.every((c) => {
      if (c.kind === "neq") return a[c.a] !== a[c.b];
      if (c.kind === "lt") return a[c.a] < a[c.b];
      if (c.kind === "sum") return a[c.a] + a[c.b] === c.target;
      if (c.kind === "mod") return a[c.a] % c.target === c.remainder;
      return true;
    });
  const all = [];
  const rec = (idx, cur) => {
    if (idx === n) {
      if (satisfies(cur)) all.push({ ...cur });
      return;
    }
    for (const v of domains[vars[idx]]) {
      cur[vars[idx]] = v;
      rec(idx + 1, cur);
    }
  };
  rec(0, {});
  // Keep the task non-trivial but not brittle: at least two valid solutions.
  for (let k = constraints.length - 1; k >= 0 && all.length < 2; k--) {
    constraints.splice(k, 1);
    all.length = 0;
    rec(0, {});
  }
  all.sort((a, b) => vars.reduce((s, v) => s + a[v], 0) - vars.reduce((s, v) => s + b[v], 0));
  const best = all[all.length - 1];
  const baseline = all[0];
  const c = {
    id: `cage-${i + 1}`,
    vars,
    domains,
    constraints,
    answer: { assignment: best },
    expected: { assignment: best },
    optimum: vars.reduce((s, v) => s + best[v], 0),
    baseline: vars.reduce((s, v) => s + baseline[v], 0),
  };
  c.prompt = `Constraint Cage — cell ${i + 1}\nVariables and domains: ${JSON.stringify(domains)}\nConstraints:\n${constraints
    .map((x) => `- ${x.text}`)
    .join("\n")}\n\nMaximise the sum of assigned values. Return { assignment: { variable: value } }.`;
  return c;
}

function validateCsp(answer, c) {
  const a = answer?.assignment;
  if (!a || typeof a !== "object") return { ok: false, reason: "assignment missing" };
  for (const v of c.vars) {
    if (!c.domains[v].includes(a[v])) return { ok: false, reason: `${v}=${a[v]} is outside its domain` };
  }
  for (const con of c.constraints) {
    if (con.kind === "neq" && a[con.a] === a[con.b]) return { ok: false, reason: `${con.text} violated` };
    if (con.kind === "lt" && !(a[con.a] < a[con.b])) return { ok: false, reason: `${con.text} violated` };
    if (con.kind === "sum" && a[con.a] + a[con.b] !== con.target) return { ok: false, reason: `${con.text} violated` };
    if (con.kind === "mod" && a[con.a] % con.target !== con.remainder) return { ok: false, reason: `${con.text} violated` };
  }
  return { ok: true };
}

const constraintCage = {
  id: "constraint-cage",
  name: "Constraint Cage",
  family: "mind",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["constraint-satisfaction", "optimization", "reasoning"],
  summary: "Solve a small CSP under stacked rules and maximise the objective.",
  rules:
    "Assign every variable inside its domain. All constraints must hold. Score is normalised between the worst valid assignment and the best valid assignment.",
  submission: "answers",
  evaluator: "assignment",
  instructions: "Submit answers[caseId] = { assignment: { variable: value } }.",
  limits: { max_file_bytes: 128 * 1024 },
  build(seed) {
    const rng = makeRng(`cage:${seed}`);
    return Array.from({ length: 6 }, (_, i) => cspCase(rng, i));
  },
  validate: validateCsp,
  value(answer) {
    return Object.values(answer.assignment).reduce((s, v) => s + Number(v), 0);
  },
};

/* ----------------------------- Memory Palace ----------------------------- */

const ROOMS = ["atrium", "library", "observatory", "cellar", "gallery", "workshop", "greenhouse", "archive"];
const OBJECTS = ["brass key", "blue ledger", "cracked lens", "silver bell", "folded map", "glass jar", "red thread", "stone seal"];
const COLORS = ["ochre", "indigo", "moss", "amber", "slate", "coral"];

function memoryCase(rng, i) {
  const rooms = rng.sample(ROOMS, 6);
  const facts = [];
  const decoys = [];
  for (let r = 0; r < rooms.length; r++) {
    const obj = rng.pick(OBJECTS);
    const color = rng.pick(COLORS);
    const count = rng.int(2, 9);
    facts.push({ room: rooms[r], obj, color, count });
    decoys.push({
      room: rooms[r],
      obj,
      color: rng.pick(COLORS.filter((c) => c !== color)),
      count: count + rng.pick([-2, -1, 1, 2]),
    });
  }
  const lines = [];
  for (let r = 0; r < rooms.length; r++) {
    lines.push(
      `Room ${r + 1} (${rooms[r]}): the ${facts[r].color} ${facts[r].obj} is stored with ${facts[r].count} matching tags. A later inventory note listed ${decoys[r].count} tags for the ${decoys[r].color} ${facts[r].obj}, but that note was corrected.`
    );
  }
  const doc = lines.join("\n");
  const questions = facts.slice(0, 5).map((f, j) => ({
    id: `q${j + 1}`,
    question: `In the ${f.room}, what color is the ${f.obj} and how many matching tags does it have?`,
    answer: `${f.color}, ${f.count}`,
  }));
  const expected = Object.fromEntries(questions.map((q) => [q.id, q.answer]));
  const c = {
    id: `palace-${i + 1}`,
    doc,
    questions,
    expected,
    answer: expected,
    match: "fields",
  };
  c.prompt = `Memory Palace Raid — palace ${i + 1}\nRead the inventory, then answer the questions. The corrected values are the authoritative ones.\n\n${doc}\n\nQuestions:\n${questions
    .map((q) => `- ${q.id}: ${q.question}`)
    .join("\n")}\n\nReturn an object with one key per question id.`;
  return c;
}

const memoryPalace = {
  id: "memory-palace",
  name: "Memory Palace Raid",
  family: "mind",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["long-context", "retrieval", "attention"],
  summary: "Recover corrected facts from a long inventory full of stale decoys.",
  rules:
    "The document contains corrected and stale values. Answer every question with the corrected fact. Each field is scored independently.",
  submission: "answers",
  evaluator: "json",
  instructions: "Submit answers[caseId] = { q1: 'color, count', ... }.",
  limits: { max_file_bytes: 256 * 1024 },
  build(seed) {
    const rng = makeRng(`palace:${seed}`);
    return Array.from({ length: 3 }, (_, i) => memoryCase(rng, i));
  },
};

/* ----------------------------- Liar's Dice ----------------------------- */

function statementTruth(stmt, roll) {
  const [a, b, c] = roll;
  switch (stmt.kind) {
    case "die":
      return roll[stmt.index] === stmt.value;
    case "sum":
      return a + b + c === stmt.value;
    case "even":
      return roll.filter((x) => x % 2 === 0).length >= stmt.value;
    case "gt":
      return roll[stmt.i] > roll[stmt.j];
    case "distinct":
      return new Set(roll).size === stmt.value;
    case "product":
      return a * b * c === stmt.value;
    case "low":
      return Math.min(...roll) === stmt.value;
    case "high":
      return Math.max(...roll) === stmt.value;
    default:
      return false;
  }
}

function liarCase(rng, i) {
  // Build statements independently of any roll, then search the 216 rolls for
  // a lie-count that exactly one roll produces. That makes the puzzle unique.
  let chosen = null;
  for (let attempt = 0; attempt < 400 && !chosen; attempt++) {
    const kinds = Array.from({ length: 10 }, () => {
      const kind = rng.pick(["die", "sum", "even", "gt", "distinct", "product", "low", "high"]);
      if (kind === "die") return { kind, index: rng.int(0, 2), value: rng.int(1, 6) };
      if (kind === "sum") return { kind, value: rng.int(3, 18) };
      if (kind === "even") return { kind, value: rng.int(1, 3) };
      if (kind === "gt") return { kind, i: rng.int(0, 2), j: rng.int(0, 2) };
      if (kind === "distinct") return { kind, value: rng.int(1, 3) };
      if (kind === "product") return { kind, value: rng.int(1, 216) };
      return { kind, value: rng.int(1, 6) };
    });
    const byCount = new Map();
    for (let a = 1; a <= 6; a++) {
      for (let b = 1; b <= 6; b++) {
        for (let c = 1; c <= 6; c++) {
          const roll = [a, b, c];
          const lies = kinds.filter((k) => !statementTruth(k, roll)).length;
          if (!byCount.has(lies)) byCount.set(lies, []);
          byCount.get(lies).push(roll);
        }
      }
    }
    const unique = [...byCount.entries()].filter(([n, rolls]) => rolls.length === 1 && n >= 2 && n <= 6);
    if (!unique.length) continue;
    const [lieCount, rolls] = unique[0];
    const roll = rolls[0];
    const statements = kinds.map((k, j) => {
      const text = (() => {
        if (k.kind === "die") return `Die ${k.index + 1} shows ${k.value}.`;
        if (k.kind === "sum") return `The sum of all dice is ${k.value}.`;
        if (k.kind === "even") return `At least ${k.value} dice are even.`;
        if (k.kind === "gt") return `Die ${k.i + 1} is greater than die ${k.j + 1}.`;
        if (k.kind === "distinct") return `Exactly ${k.value} distinct values appear.`;
        if (k.kind === "product") return `The product of the dice is ${k.value}.`;
        if (k.kind === "low") return `The lowest die is ${k.value}.`;
        return `The highest die is ${k.value}.`;
      })();
      return { id: `S${j + 1}`, text, truth: statementTruth(k, roll), kind: k };
    });
    chosen = { roll, statements, lieCount, falseIds: statements.filter((s) => !s.truth).map((s) => s.id) };
  }
  if (!chosen) {
    // Extremely unlikely fallback: a hand-built solvable puzzle.
    const roll = [3, 2, 6];
    const statements = [
      { id: "S1", text: "Die 1 shows 3.", truth: true },
      { id: "S2", text: "Die 2 shows 2.", truth: true },
      { id: "S3", text: "Die 3 shows 6.", truth: true },
      { id: "S4", text: "The sum of all dice is 11.", truth: true },
      { id: "S5", text: "At least 2 dice are even.", truth: true },
      { id: "S6", text: "Die 1 is greater than die 2.", truth: true },
      { id: "S7", text: "Exactly 3 distinct values appear.", truth: true },
      { id: "S8", text: "The product of the dice is 30.", truth: false },
      { id: "S9", text: "The lowest die is 1.", truth: false },
      { id: "S10", text: "The highest die is 5.", truth: false },
    ];
    chosen = { roll, statements, lieCount: 3, falseIds: ["S8", "S9", "S10"] };
  }
  const c = {
    id: `liar-${i + 1}`,
    roll: chosen.roll,
    statements: chosen.statements,
    lieCount: chosen.lieCount,
    falseIds: chosen.falseIds,
    answer: { roll: chosen.roll, lies: chosen.falseIds },
    expected: { roll: chosen.roll, lies: chosen.falseIds },
  };
  c.prompt = `Liar's Dice — table ${i + 1}\nExactly ${chosen.lieCount} of these 10 statements are false:\n${chosen.statements
    .map((s) => `- ${s.id}: ${s.text}`)
    .join("\n")}\n\nInfer the three dice and identify the lies. Return { roll: [d1, d2, d3], lies: [statementId] }.`;
  return c;
}

function liarCheck(answer, c) {
  const roll = Array.isArray(answer?.roll) ? answer.roll.map(Number) : [];
  const rollOk = roll.length === 3 && roll.every((v, i) => v === c.roll[i]);
  const actual = new Set(Array.isArray(answer?.lies) ? answer.lies : []);
  const expected = new Set(c.falseIds);
  let hit = 0;
  for (const x of expected) if (actual.has(x)) hit++;
  const precision = actual.size ? hit / actual.size : 0;
  const recall = expected.size ? hit / expected.size : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const score = (rollOk ? 0.6 : 0) + f1 * 0.4;
  return {
    score,
    reason: `roll ${rollOk ? "exact" : "wrong"}; lie F1 ${round(f1, 2)}`,
    checks: { rollOk, f1 },
  };
}

const liarDice = {
  id: "liar-dice",
  name: "Liar's Dice Logic",
  family: "mind",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["logic", "deduction", "set-reasoning"],
  summary: "Infer three hidden dice from ten statements when exactly three are lies.",
  rules:
    "Exactly three statements are false. Recover the three dice and the three lying statement ids. The dice are 60% of the score; lie F1 is 40%.",
  submission: "answers",
  evaluator: "json",
  instructions: "Submit answers[caseId] = { roll: [d1, d2, d3], lies: [statementId] }.",
  limits: { max_file_bytes: 128 * 1024 },
  build(seed) {
    const rng = makeRng(`liar:${seed}`);
    return Array.from({ length: 8 }, (_, i) => liarCase(rng, i));
  },
  check(artifact, c) {
    return liarCheck(artifact, c);
  },
};

export const games = [labyrinth, oracleDuel, constraintCage, memoryPalace, liarDice];