import crypto from "node:crypto";
import { makeRng } from "../lib/games-helpers.mjs";

/* ----------------------------- Fifty-Hand Machine ----------------------------- */

const SKILLS = ["build", "search", "write", "verify", "coordinate"];

function fiftyCase(rng, i) {
  const perSkill = 10;
  const workers = SKILLS.flatMap((skill) =>
    Array.from({ length: perSkill }, (_, j) => ({ id: `${skill.slice(0, 2).toUpperCase()}${j + 1}`, skill }))
  );
  const tasks = [];
  for (const skill of SKILLS) {
    for (let k = 0; k < 2; k++) {
      tasks.push({
        id: `T${tasks.length + 1}`,
        skill,
        needed: rng.int(2, 5),
        value: rng.int(10, 50),
      });
    }
  }
  const dp = {};
  let optimum = 0;
  let baseline = 0;
  const choice = {};
  for (const skill of SKILLS) {
    const list = tasks.filter((t) => t.skill === skill);
    // dp[c] = best value using c workers of this skill.
    let prev = new Array(perSkill + 1).fill(-Infinity);
    prev[0] = 0;
    const keep = list.map(() => []);
    for (let ti = 0; ti < list.length; ti++) {
      const t = list[ti];
      const next = [...prev];
      const pick = new Array(perSkill + 1).fill(false);
      for (let c = 0; c <= perSkill; c++) {
        if (!Number.isFinite(prev[c])) continue;
        if (c + t.needed <= perSkill && prev[c] + t.value > next[c + t.needed]) {
          next[c + t.needed] = prev[c] + t.value;
          pick[c + t.needed] = true;
        }
      }
      keep[ti] = pick;
      prev = next;
    }
    let bestC = 0;
    for (let c = 1; c <= perSkill; c++) if (prev[c] > prev[bestC]) bestC = c;
    optimum += prev[bestC];
    dp[skill] = { bestC, value: prev[bestC] };
    // Reconstruct which tasks were staffed.
    const staffed = [];
    let c = bestC;
    for (let ti = list.length - 1; ti >= 0; ti--) {
      if (keep[ti][c]) {
        staffed.push(list[ti].id);
        c -= list[ti].needed;
      }
    }
    choice[skill] = staffed.reverse();
    // Baseline: staff in listed order while workers remain.
    let left = perSkill;
    for (const t of list) {
      if (left >= t.needed) {
        baseline += t.value;
        left -= t.needed;
      }
    }
  }
  // Build a concrete assignment for the optimum.
  const assignments = {};
  for (const skill of SKILLS) {
    const pool = workers.filter((w) => w.skill === skill).map((w) => w.id);
    let idx = 0;
    for (const tid of choice[skill]) {
      const t = tasks.find((x) => x.id === tid);
      for (let k = 0; k < t.needed; k++) assignments[pool[idx++]] = tid;
    }
  }
  const c = {
    id: `fifty-${i + 1}`,
    workers,
    tasks,
    answer: { assignments },
    expected: { assignments },
    optimum,
    baseline,
  };
  c.prompt = `Fifty-Hand Machine — heat ${i + 1}\nWorkers by skill: ${SKILLS.map((s) => `${s} (${perSkill})`).join(", ")}\nTasks:\n${tasks
    .map((t) => `- ${t.id}: ${t.skill}, needs ${t.needed} workers, value ${t.value}`)
    .join("\n")}\n\nEach worker takes at most one task. A staffed task needs exactly its worker count, all of the right skill. Maximise total value. Return { assignments: { workerId: taskId or null } }.`;
  return c;
}

function validateFifty(answer, c) {
  const a = answer?.assignments;
  if (!a || typeof a !== "object") return { ok: false, reason: "assignments missing" };
  const counts = {};
  for (const w of c.workers) {
    const t = a[w.id];
    if (t === null || t === undefined) continue;
    const task = c.tasks.find((x) => x.id === t);
    if (!task) return { ok: false, reason: `unknown task ${t}` };
    if (task.skill !== w.skill) return { ok: false, reason: `${w.id} has the wrong skill for ${t}` };
    counts[t] = (counts[t] || 0) + 1;
  }
  for (const task of c.tasks) {
    const n = counts[task.id] || 0;
    if (n !== 0 && n !== task.needed) return { ok: false, reason: `${task.id} has ${n}/${task.needed} workers` };
  }
  return { ok: true };
}

function fiftyValue(answer, c) {
  const counts = {};
  for (const w of c.workers) {
    const t = answer.assignments[w.id];
    if (t) counts[t] = (counts[t] || 0) + 1;
  }
  return c.tasks.reduce((s, t) => s + (counts[t.id] === t.needed ? t.value : 0), 0);
}

const fiftyHand = {
  id: "fifty-hand",
  name: "Fifty-Hand Machine",
  family: "team",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["resource-allocation", "optimization", "team-composition"],
  summary: "Staff ten tasks from a 50-worker roster and maximise delivered value.",
  rules:
    "Each worker takes at most one task. A staffed task needs exactly its declared number of workers, all from the right skill. Score is normalised between the greedy baseline and the optimum.",
  submission: "answers",
  evaluator: "assignment",
  instructions: "Submit answers[caseId] = { assignments: { workerId: taskId or null } }.",
  limits: { max_file_bytes: 128 * 1024 },
  build(seed) {
    const rng = makeRng(`fifty:${seed}`);
    return Array.from({ length: 6 }, (_, i) => fiftyCase(rng, i));
  },
  validate: validateFifty,
  value: fiftyValue,
};

/* ----------------------------- Captain's Call ----------------------------- */

const ACTIONS = ["open", "close", "move", "hold", "scan"];
const TARGETS = ["gate-a", "gate-b", "relay-1", "relay-2", "depot-north", "depot-south", "bridge"];

function captainCase(rng, i) {
  const targetCount = rng.int(4, 6);
  const targets = rng.sample(TARGETS, targetCount);
  const truth = targets.map((target, k) => ({
    id: `K${k + 1}`,
    action: rng.pick(ACTIONS),
    target,
    confidence: rng.float(0.75, 0.99),
    t: rng.int(1, 40),
  }));
  const messages = [];
  for (const cmd of truth) {
    messages.push({
      id: `M${messages.length + 1}`,
      action: cmd.action,
      target: cmd.target,
      confidence: cmd.confidence,
      t: cmd.t,
      stale: false,
    });
    if (rng.bool(0.7)) {
      messages.push({
        id: `M${messages.length + 1}`,
        action: cmd.action,
        target: cmd.target,
        confidence: rng.float(0.2, 0.6),
        t: cmd.t + rng.int(1, 20),
        stale: false,
      });
    }
    if (rng.bool(0.6)) {
      messages.push({
        id: `M${messages.length + 1}`,
        action: rng.pick(ACTIONS.filter((a) => a !== cmd.action)),
        target: cmd.target,
        confidence: rng.float(0.1, 0.95),
        t: cmd.t + rng.int(1, 20),
        stale: true,
      });
    }
  }
  // Ground truth: highest-confidence non-stale message for each target.
  const kept = [];
  for (const target of targets) {
    const candidates = messages.filter((m) => m.target === target && !m.stale);
    candidates.sort((a, b) => b.confidence - a.confidence || a.t - b.t);
    if (candidates[0]) kept.push(candidates[0]);
  }
  kept.sort((a, b) => a.t - b.t);
  const ignored = messages.filter((m) => !kept.includes(m)).map((m) => m.id);
  const c = {
    id: `captain-${i + 1}`,
    messages,
    expected: {
      commands: kept.map((m) => ({ action: m.action, target: m.target })),
      ignored,
    },
    answer: {
      commands: kept.map((m) => ({ action: m.action, target: m.target })),
      ignored,
    },
    kept,
    ignored,
  };
  c.prompt = `Captain's Call — round ${i + 1}\nThe floor is noisy. Ignore messages marked stale. For each target keep the non-stale message with the highest confidence. Return commands ordered by the kept message timestamp.\n\nMessages:\n${messages
    .map((m) => `- ${m.id}: ${m.action} ${m.target} (confidence ${m.confidence.toFixed(2)}, t=${m.t}${m.stale ? ", STALE" : ""})`)
    .join("\n")}\n\nReturn { commands: [{ action, target }], ignored: [messageId] }.`;
  return c;
}

function captainCheck(answer, c) {
  const exp = c.expected;
  const got = Array.isArray(answer?.commands) ? answer.commands : [];
  const seq = (arr) => arr.map((x) => `${x.action}>${x.target}`).join("|");
  const commandOk = seq(got) === seq(exp.commands);
  const actualIgnored = new Set(Array.isArray(answer?.ignored) ? answer.ignored : []);
  const expectedIgnored = new Set(exp.ignored);
  let hit = 0;
  for (const x of expectedIgnored) if (actualIgnored.has(x)) hit++;
  const precision = actualIgnored.size ? hit / actualIgnored.size : 0;
  const recall = expectedIgnored.size ? hit / expectedIgnored.size : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const score = (commandOk ? 0.7 : 0) + f1 * 0.3;
  return { score, reason: `commands ${commandOk ? "exact" : "differ"}; ignored F1 ${f1.toFixed(2)}`, checks: { commandOk, f1 } };
}

const captainCall = {
  id: "captain-call",
  name: "Captain's Call",
  family: "team",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["noise-filtering", "instruction-following", "sequencing"],
  summary: "Recover the captain's real command sequence from a noisy, stale message floor.",
  rules:
    "Drop stale messages. For each target, keep the highest-confidence non-stale message. Order commands by the kept timestamp and list every ignored message id.",
  submission: "answers",
  evaluator: "json",
  instructions: "Submit answers[caseId] = { commands: [{ action, target }], ignored: [messageId] }.",
  limits: { max_file_bytes: 128 * 1024 },
  build(seed) {
    const rng = makeRng(`captain:${seed}`);
    return Array.from({ length: 5 }, (_, i) => captainCase(rng, i));
  },
  check(artifact, c) {
    return captainCheck(artifact, c);
  },
};

/* ----------------------------- Silent Protocol ----------------------------- */

const silentCases = [
  {
    id: "silent-1",
    entry: "encode",
    publicTests: 2,
    prompt: `Silent Protocol — build a compact codec. Export CommonJS functions:
- encode(values): values is an array of integers 0..63. Return a string packet.
- decode(packet): return the original integer array.
The packet budget is ceil(values.length * 6 / 8) + 4 characters (UTF-16 code units). Any non-whitespace characters are allowed. Round-trip must be exact.`,
    tests: [
      { name: "empty", input: [], budget: 4 },
      { name: "single zero", input: [0], budget: 5 },
      { name: "single max", input: [63], budget: 5 },
      { name: "eight values", input: [1, 2, 3, 4, 5, 6, 7, 8], budget: 10 },
      { name: "alternating", input: [0, 63, 0, 63, 0, 63], budget: 9 },
      { name: "all 64", input: Array.from({ length: 64 }, (_, i) => i), budget: 52 },
      { name: "sixty four max", input: Array.from({ length: 64 }, () => 63), budget: 52 },
      { name: "three values", input: [7, 31, 62], budget: 7 },
      { name: "long run", input: Array.from({ length: 100 }, (_, i) => i % 64), budget: 79 },
      { name: "sparse", input: [5, 0, 0, 0, 9], budget: 8 },
    ],
  },
];

const silentProtocol = {
  id: "silent-protocol",
  name: "Silent Protocol",
  family: "team",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["encoding", "compression", "protocol-design"],
  summary: "Pack six-bit team messages into the smallest reliable packet.",
  rules:
    "Encode an array of 0..63 integers into a printable packet and decode it exactly. The published budget is ceil(n*6/8)+4 characters. Every test must round-trip exactly.",
  submission: "code",
  evaluator: "code",
  instructions: "Submit solution.js exporting encode(values) and decode(packet) as CommonJS.",
  reference: "silent-protocol/solution.js",
  limits: { max_file_bytes: 128 * 1024, test_timeout_ms: 1000, agent_timeout_s: 180 },
  build() {
    return silentCases;
  },
  runTest(call, test) {
    const packet = call("encode", [test.input]);
    const back = call("decode", [packet]);
    return { back, packet, length: String(packet).length };
  },
  scoreTest(result, test) {
    const exact = JSON.stringify(result.back) === JSON.stringify(test.input);
    const within = result.length <= test.budget;
    return {
      score: exact && within ? 1 : 0,
      reason: `${exact ? "round-trip" : "round-trip failed"}; ${result.length}/${test.budget} chars`,
    };
  },
};

/* ----------------------------- Ratio Lock Rumble ----------------------------- */

function ratioCase(rng, i) {
  const humans = Array.from({ length: 24 }, (_, j) => ({ id: `H${j + 1}`, type: "human" }));
  const autos = Array.from({ length: 24 }, (_, j) => ({ id: `A${j + 1}`, type: "autonomous" }));
  const agents = [...humans, ...autos];
  const tasks = Array.from({ length: 10 }, (_, j) => {
    const size = rng.int(3, 6);
    return { id: `R${j + 1}`, size, value: rng.int(10, 50) };
  });
  // DP over (humans, autos) with task choices. State is small: 25*25.
  const dp = Array.from({ length: 25 }, () => new Array(25).fill(-Infinity));
  dp[0][0] = 0;
  const choice = [];
  for (const task of tasks) {
    const next = dp.map((row) => row.slice());
    const pick = Array.from({ length: 25 }, () => new Array(25).fill(null));
    for (let h = 0; h <= 24; h++) {
      for (let a = 0; a <= 24; a++) {
        if (!Number.isFinite(dp[h][a])) continue;
        for (let th = 0; th <= task.size; th++) {
          const ta = task.size - th;
          if (th > 24 - h || ta > 24 - a) continue;
          const ratio = task.size ? th / task.size : 0;
          if (ratio < 0.3 || ratio > 0.7) continue;
          const val = dp[h][a] + task.value;
          if (val > next[h + th][a + ta]) {
            next[h + th][a + ta] = val;
            pick[h + th][a + ta] = { h, a, th, ta };
          }
        }
      }
    }
    dp.splice(0, dp.length, ...next);
    choice.push(pick);
  }
  let best = { h: 0, a: 0, value: 0 };
  for (let h = 0; h <= 24; h++) for (let a = 0; a <= 24; a++) if (dp[h][a] > best.value) best = { h, a, value: dp[h][a] };
  // Reconstruct.
  let state = { h: best.h, a: best.a };
  const staffed = [];
  for (let ti = tasks.length - 1; ti >= 0; ti--) {
    const p = choice[ti][state.h][state.a];
    if (p) {
      staffed.push({ task: tasks[ti].id, h: p.th, a: p.ta });
      state = { h: p.h, a: p.a };
    }
  }
  staffed.reverse();
  const assignments = {};
  let hi = 0;
  let ai = 0;
  for (const s of staffed) {
    for (let k = 0; k < s.h; k++) assignments[humans[hi++].id] = s.task;
    for (let k = 0; k < s.a; k++) assignments[autos[ai++].id] = s.task;
  }
  // Greedy baseline.
  let bh = 0;
  let ba = 0;
  let baseline = 0;
  for (const task of tasks) {
    for (let th = 0; th <= task.size; th++) {
      const ta = task.size - th;
      const ratio = task.size ? th / task.size : 0;
      if (ratio < 0.3 || ratio > 0.7) continue;
      if (bh + th <= 24 && ba + ta <= 24) {
        baseline += task.value;
        bh += th;
        ba += ta;
        break;
      }
    }
  }
  const c = {
    id: `ratio-${i + 1}`,
    agents,
    tasks,
    answer: { assignments },
    expected: { assignments },
    optimum: best.value,
    baseline,
  };
  c.prompt = `Ratio Lock Rumble — round ${i + 1}\nAgents: 24 human (H1–H24), 24 autonomous (A1–A24).\nTasks:\n${tasks
    .map((t) => `- ${t.id}: ${t.size} seats, value ${t.value}`)
    .join("\n")}\n\nEvery staffed task needs exactly its seat count. The human share must stay between 30% and 70% inclusive. Each agent takes one task. Maximise value. Return { assignments: { agentId: taskId } }.`;
  return c;
}

function validateRatio(answer, c) {
  const a = answer?.assignments;
  if (!a || typeof a !== "object") return { ok: false, reason: "assignments missing" };
  const counts = {};
  for (const agent of c.agents) {
    const t = a[agent.id];
    if (t == null) continue;
    if (!c.tasks.some((x) => x.id === t)) return { ok: false, reason: `unknown task ${t}` };
    if (!counts[t]) counts[t] = { h: 0, a: 0 };
    if (agent.type === "human") counts[t].h++;
    else counts[t].a++;
  }
  for (const task of c.tasks) {
    const n = counts[task.id];
    if (!n) continue;
    if (n.h + n.a !== task.size) return { ok: false, reason: `${task.id} has ${n.h + n.a}/${task.size} seats` };
    const ratio = n.h / task.size;
    if (ratio < 0.3 || ratio > 0.7) return { ok: false, reason: `${task.id} ratio ${ratio.toFixed(2)} is outside 30–70%` };
  }
  return { ok: true };
}

function ratioValue(answer, c) {
  const counts = {};
  for (const agent of c.agents) {
    const t = answer.assignments[agent.id];
    if (!t) continue;
    if (!counts[t]) counts[t] = 0;
    counts[t]++;
  }
  return c.tasks.reduce((s, t) => s + (counts[t.id] === t.size ? t.value : 0), 0);
}

const ratioLock = {
  id: "ratio-lock-rumble",
  name: "Ratio Lock Rumble",
  family: "team",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["team-composition", "constraints", "optimization"],
  summary: "Staff mixed human/autonomous teams without ever breaking the 30–70 ratio.",
  rules:
    "Every staffed task needs exactly its seat count, with a human share between 30% and 70%. Each agent takes one task. Maximise delivered value.",
  submission: "answers",
  evaluator: "assignment",
  instructions: "Submit answers[caseId] = { assignments: { agentId: taskId } }.",
  limits: { max_file_bytes: 128 * 1024 },
  build(seed) {
    const rng = makeRng(`ratio:${seed}`);
    return Array.from({ length: 5 }, (_, i) => ratioCase(rng, i));
  },
  validate: validateRatio,
  value: ratioValue,
};

/* ----------------------------- Handoff Heist ----------------------------- */

function hmac(secret, text) {
  return crypto.createHmac("sha256", secret).update(text).digest("hex");
}

function handoffCase(rng, i) {
  const secret = `baton-${seedPart(rng)}`;
  const names = ["Mara", "Ivo", "Sable", "Ren", "Tala", "Oren", "Vale", "Nia"];
  const sequence = rng.sample(names, rng.int(5, 8));
  const handoffs = [];
  let prev = hmac(secret, "genesis");
  for (let k = 0; k < sequence.length - 1; k++) {
    const from = sequence[k];
    const to = sequence[k + 1];
    const nonce = rng.int(1000, 9999);
    const mac = hmac(secret, `${prev}:${from}:${to}:${nonce}`);
    handoffs.push({ from, to, nonce, mac });
    prev = mac;
  }
  const answer = { handoffs, final: prev };
  const c = {
    id: `heist-${i + 1}`,
    secret,
    sequence,
    answer,
    expected: answer,
  };
  c.prompt = `Handoff Heist — run ${i + 1}\nShared secret: ${secret}\nRelay order: ${sequence.join(" -> ")}\n\nStart: H0 = HMAC-SHA256(secret, "genesis") (hex).\nFor each handoff i: nonce is your integer; H(i) = HMAC-SHA256(secret, H(i-1) + ":" + from + ":" + to + ":" + nonce) (hex).\nFinal = H(last) (hex).\nReturn { handoffs: [{ from, to, nonce, mac }], final }.`;
  return c;
}

function seedPart(rng) {
  return rng.int(100000, 999999).toString(36);
}

function verifyHandoff(answer, c) {
  const handoffs = Array.isArray(answer?.handoffs) ? answer.handoffs : [];
  let prev = hmac(c.secret, "genesis");
  let valid = 0;
  for (let i = 0; i < c.sequence.length - 1; i++) {
    const h = handoffs[i];
    const from = c.sequence[i];
    const to = c.sequence[i + 1];
    const ok =
      h &&
      h.from === from &&
      h.to === to &&
      Number.isFinite(Number(h.nonce)) &&
      String(h.mac).toLowerCase() === hmac(c.secret, `${prev}:${from}:${to}:${Number(h.nonce)}`);
    if (!ok) break;
    valid++;
    prev = String(h.mac).toLowerCase();
  }
  const finalOk = String(answer?.final || "").toLowerCase() === prev;
  const total = c.sequence.length - 1;
  const score = (valid / total) * (finalOk ? 1 : 0.9);
  return { score, reason: `${valid}/${total} handoffs verified; final ${finalOk ? "sealed" : "mismatch"}` };
}

const handoffHeist = {
  id: "handoff-heist",
  name: "Handoff Heist",
  family: "team",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["cryptography", "protocol", "audit"],
  summary: "Pass a signed baton through a relay and seal an auditable handoff chain.",
  rules:
    "Every hop is an HMAC over the previous hash, the two agents and a nonce. The final hash seals the chain. Invalid hops break the audit at that point.",
  submission: "answers",
  evaluator: "chain",
  instructions: "Submit answers[caseId] = { handoffs: [{ from, to, nonce, mac }], final }.",
  limits: { max_file_bytes: 128 * 1024 },
  build(seed) {
    const rng = makeRng(`heist:${seed}`);
    return Array.from({ length: 4 }, (_, i) => handoffCase(rng, i));
  },
  verify: verifyHandoff,
};

export const games = [fiftyHand, captainCall, silentProtocol, ratioLock, handoffHeist];