import { makeRng, WORD_BANK } from "../lib/games-helpers.mjs";
import { round, sha256 } from "../lib/util.mjs";

function xorCipher(text, key) {
  const out = [];
  for (let i = 0; i < text.length; i++) out.push(String.fromCharCode(text.charCodeAt(i) ^ (key % 251)));
  return out.join("");
}

function routeCase(rng, i) {
  const a = rng.int(11, 49);
  const b = rng.int(3, 19);
  const kind = i % 5;
  if (kind === 0) {
    const answer = a * b;
    return {
      id: `lite-${i + 1}`,
      prompt: `${a} × ${b} = ?\nAnswer with the integer only.`,
      answer: String(answer),
      normalize: "integer",
    };
  }
  if (kind === 1) {
    const km = rng.int(10, 400);
    const miles = round(km * 0.621371, 2);
    return {
      id: `lite-${i + 1}`,
      prompt: `${km} kilometres is how many miles? Use 1 km = 0.621371 mi. Answer with the number only, rounded to 2 decimals.`,
      answer: String(miles),
      normalize: "number",
    };
  }
  if (kind === 2) {
    const start = Date.UTC(2026, rng.int(0, 11), rng.int(1, 27));
    const days = rng.int(10, 120);
    const d = new Date(start + days * 86400000);
    const iso = d.toISOString().slice(0, 10);
    return {
      id: `lite-${i + 1}`,
      prompt: `What date is ${new Date(start).toISOString().slice(0, 10)} plus ${days} days? Answer as YYYY-MM-DD.`,
      answer: iso,
      normalize: "text",
    };
  }
  if (kind === 3) {
    const p = rng.int(2, 9);
    const q = rng.int(2, 9);
    return {
      id: `lite-${i + 1}`,
      prompt: `If every ${p}-unit block contains one red bead, and you have ${p * q} units, how many red beads? Answer with the integer only.`,
      answer: String(q),
      normalize: "integer",
    };
  }
  const n = rng.int(3, 7);
  const sorted = Array.from({ length: n }, () => rng.int(1, 20));
  const answer = [...sorted].sort((x, y) => x - y).join(",");
  return {
    id: `lite-${i + 1}`,
    prompt: `Sort these numbers ascending: ${sorted.join(", ")}. Answer as comma-separated integers with no spaces.`,
    answer,
    normalize: "set",
  };
}

const lightningReply = {
  id: "lightning-reply",
  name: "Lightning Reply",
  family: "speed",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["speed", "arithmetic", "instruction-following"],
  summary: "Twenty exact answers under a per-case token budget and a hard latency budget.",
  rules:
    "Every answer is graded exactly after normalisation. The token and latency budgets are published; runs that exceed them lose speed credit but keep accuracy credit.",
  submission: "answers",
  evaluator: "exact",
  instructions:
    "Submit answers[caseId] = string. Also include meta.tokens (total) and meta.latency_ms (total) so the speed gate can be verified.",
  limits: { max_tokens: 100, latency_ms_cap: 3000, max_file_bytes: 256 * 1024, agent_timeout_s: 120 },
  build(seed) {
    const rng = makeRng(`lightning:${seed}`);
    return Array.from({ length: 20 }, (_, i) => routeCase(rng, i));
  },
};

function relayCase(rng, i) {
  const kind = i % 5;
  if (kind === 0) {
    const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71];
    const n = rng.int(5, 18);
    return {
      id: `relay100-${i + 1}`,
      prompt: `What is the ${n}th prime? Answer with the integer only.`,
      answer: String(primes[n - 1]),
      normalize: "integer",
    };
  }
  if (kind === 1) {
    const a = rng.int(100, 999);
    const b = rng.int(100, 999);
    return {
      id: `relay100-${i + 1}`,
      prompt: `Compute ${a} + ${b} − ${a % 10}. Answer with the integer only.`,
      answer: String(a + b - (a % 10)),
      normalize: "integer",
    };
  }
  if (kind === 2) {
    const words = rng.sample(WORD_BANK, 4);
    const answer = [...words].sort().join(",");
    return {
      id: `relay100-${i + 1}`,
      prompt: `Alphabetise these words: ${words.join(", ")}. Answer as comma-separated words with no spaces.`,
      answer,
      normalize: "set",
    };
  }
  if (kind === 3) {
    const code = `x${rng.int(10, 99)}`;
    return {
      id: `relay100-${i + 1}`,
      prompt: `A variable is named "${code}". Return the suffix after the leading x. Answer with digits only.`,
      answer: code.slice(1),
      normalize: "integer",
    };
  }
  const n = rng.int(11, 40);
  return {
    id: `relay100-${i + 1}`,
    prompt: `What is ${n} squared, minus ${n}? Answer with the integer only.`,
    answer: String(n * n - n),
    normalize: "integer",
  };
}

const relay100 = {
  id: "relay-100",
  name: "100-Token Dash",
  family: "speed",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["speed", "precision", "short-answers"],
  summary: "Ten precision answers with an even tighter 100-token and 2-second budget.",
  rules:
    "Answers are exact. The token budget is 100 per case and the latency budget is 2000 ms per case; both are reported by the submission.",
  submission: "answers",
  evaluator: "exact",
  instructions: "Submit answers[caseId] = string plus meta.tokens and meta.latency_ms.",
  limits: { max_tokens: 100, latency_ms_cap: 2000, max_file_bytes: 128 * 1024, agent_timeout_s: 90 },
  build(seed) {
    const rng = makeRng(`relay100:${seed}`);
    return Array.from({ length: 10 }, (_, i) => relayCase(rng, i));
  },
};

function hotSwapCase(rng, i) {
  const taskCount = rng.int(5, 7);
  const tools = ["compiler", "indexer", "renderer", "verifier"];
  const tasks = Array.from({ length: taskCount }, (_, j) => {
    const tool = rng.pick(tools);
    const duration = rng.int(1, 4);
    const deps = j === 0 ? [] : rng.sample(tasksSoFar(j), rng.int(0, Math.min(2, j))).filter(Boolean);
    return {
      id: `T${j + 1}`,
      tool,
      duration,
      deps,
    };
  });
  function tasksSoFar(j) {
    return Array.from({ length: j }, (_, k) => `T${k + 1}`);
  }
  // Build availability from a known-valid natural schedule so every generated
  // case is feasible, then add a little slack to leave room for optimisation.
  const totalDuration = tasks.reduce((sum, t) => sum + t.duration, 0);
  const horizon = totalDuration + 6;
  const naturalTimes = {};
  let cursor = 0;
  for (const t of tasks) {
    naturalTimes[t.id] = { start: cursor, end: cursor + t.duration };
    cursor += t.duration;
  }
  const availability = {};
  for (const tool of tools) {
    const list = tasks.filter((t) => t.tool === tool);
    if (!list.length) {
      availability[tool] = [[0, horizon]];
      continue;
    }
    const minStart = Math.max(0, Math.min(...list.map((t) => naturalTimes[t.id].start)) - rng.int(0, 2));
    const maxEnd = Math.min(horizon, Math.max(...list.map((t) => naturalTimes[t.id].end)) + rng.int(0, 2));
    availability[tool] = [[minStart, maxEnd]];
  }
  const caseDef = {
    id: `swap-${i + 1}`,
    tasks,
    tools,
    availability,
    horizon,
  };
  const plan = solveHotSwap(caseDef, rng) || {
    steps: tasks.map((t) => ({ task: t.id, tool: t.tool, start: naturalTimes[t.id].start, end: naturalTimes[t.id].end })),
    makespan: totalDuration,
    baseline: totalDuration,
  };
  caseDef.answer = plan;
  caseDef.expected = plan;
  caseDef.optimum = -plan.makespan;
  caseDef.baseline = -plan.baseline;
  caseDef.prompt = `Hot-swap plan ${i + 1}\nTasks (id, tool, duration, dependencies):\n${tasks
    .map((t) => `- ${t.id}: ${t.tool}, ${t.duration} round(s), deps [${t.deps.join(", ")}]`)
    .join("\n")}\nTool availability (start,end): ${JSON.stringify(availability)}\n\nReturn { steps: [{ task, tool, start, end }] } in execution order. Steps run sequentially, so start equals the previous end unless you deliberately idle.`;
  return caseDef;
}

function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) out.push([arr[i], ...p]);
  }
  return out;
}

function scheduleFor(order, c) {
  let time = 0;
  const steps = [];
  for (const id of order) {
    const task = c.tasks.find((t) => t.id === id);
    const windows = c.availability[task.tool] || [[0, c.horizon]];
    let start = time;
    let end = start + task.duration;
    let fit = windows.find(([a, b]) => start >= a && end <= b);
    if (!fit) {
      // Wait for the next window that can hold the task.
      fit = windows.find(([a, b]) => b - a >= task.duration && a >= start);
      if (!fit) return null;
      start = fit[0];
      end = start + task.duration;
    }
    steps.push({ task: id, tool: task.tool, start, end });
    time = end;
  }
  return { steps, makespan: time };
}

function solveHotSwap(c, rng) {
  const ids = c.tasks.map((t) => t.id);
  let best = null;
  for (const order of permutations(ids)) {
    const ok = c.tasks.every((t) => t.deps.every((d) => order.indexOf(d) < order.indexOf(t.id)));
    if (!ok) continue;
    const sched = scheduleFor(order, c);
    if (!sched) continue;
    if (!best || sched.makespan < best.makespan) best = sched;
  }
  const natural = scheduleFor(ids, c);
  const baseline = natural ? natural.makespan : c.horizon;
  return { ...best, baseline };
}

function validateHotSwap(answer, c) {
  const steps = answer?.steps;
  if (!Array.isArray(steps) || steps.length !== c.tasks.length) return { ok: false, reason: "steps must cover every task" };
  const seen = new Set();
  const byTask = new Map(c.tasks.map((t) => [t.id, t]));
  let lastEnd = 0;
  for (const s of steps) {
    if (!byTask.has(s.task) || seen.has(s.task)) return { ok: false, reason: `duplicate or unknown task ${s.task}` };
    seen.add(s.task);
    const t = byTask.get(s.task);
    if (s.tool !== t.tool) return { ok: false, reason: `${s.task} must use ${t.tool}` };
    if (!Number.isFinite(s.start) || !Number.isFinite(s.end) || s.end - s.start !== t.duration) {
      return { ok: false, reason: `${s.task} duration must be ${t.duration}` };
    }
    if (s.start < lastEnd) return { ok: false, reason: "steps overlap" };
    const windows = c.availability[t.tool] || [[0, c.horizon]];
    if (!windows.some(([a, b]) => s.start >= a && s.end <= b)) return { ok: false, reason: `${t.tool} unavailable at ${s.start}` };
    for (const d of t.deps) if (!seen.has(d)) return { ok: false, reason: `${s.task} ran before dependency ${d}` };
    lastEnd = s.end;
  }
  return { ok: true };
}

const hotSwap = {
  id: "hot-swap",
  name: "Hot Swap Sprint",
  family: "speed",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["planning", "tool-use", "constraints"],
  summary: "Plan a task DAG against tool availability windows and minimise the makespan.",
  rules:
    "Every task runs once, in dependency order, with its declared tool and duration. A step must fit entirely inside a published availability window. Lower makespan wins.",
  submission: "answers",
  evaluator: "assignment",
  instructions: "Submit answers[caseId] = { steps: [{ task, tool, start, end }] } in execution order.",
  limits: { max_file_bytes: 128 * 1024 },
  build(seed) {
    const rng = makeRng(`hotswap:${seed}`);
    return Array.from({ length: 5 }, (_, i) => hotSwapCase(rng, i));
  },
  validate: validateHotSwap,
  value(answer, c) {
    return -Math.max(...answer.steps.map((s) => s.end));
  },
};

function deadDropCase(rng, i) {
  const secret = `${rng.pick(WORD_BANK)}-${rng.int(100, 999)}`;
  const key = rng.int(1, 250);
  const cipher = xorCipher(secret, key);
  const hash = sha256(`${secret}:${key}`);
  const tampered = i % 4 === 3;
  let payload = cipher;
  let expectedHash = hash;
  if (tampered) {
    payload = cipher.slice(0, -1) + String.fromCharCode(cipher.charCodeAt(cipher.length - 1) ^ 1);
  }
  const sealed = Buffer.from(payload, "utf8").toString("base64");
  return {
    id: `drop-${i + 1}`,
    prompt: `Sealed payload (base64): ${sealed}\nXOR key: ${key}\nExpected SHA-256(secret:key): ${expectedHash}\n\nDecode the payload, XOR it with the key (one byte, repeated), and verify SHA-256(secret + ":" + key). If the hash matches, deliver the secret. If it does not, deliver TAMPERED.`,
    answer: tampered ? "TAMPERED" : secret,
    expectedHash,
    sealed,
    tampered,
  };
}

const deadDrop = {
  id: "dead-drop",
  name: "Dead Drop Delivery",
  family: "speed",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["encoding", "hashing", "verification"],
  summary: "Decode a sealed payload, verify its hash, and deliver the secret — or call the tamper.",
  rules:
    "The payload is base64 text XORed with a one-byte repeating key. The expected SHA-256 covers secret:key. Deliver the secret only if the hash matches; otherwise deliver TAMPERED.",
  submission: "answers",
  evaluator: "exact",
  instructions: "Submit answers[caseId] = secret string or TAMPERED.",
  limits: { max_file_bytes: 128 * 1024 },
  build(seed) {
    const rng = makeRng(`deaddrop:${seed}`);
    return Array.from({ length: 8 }, (_, i) => deadDropCase(rng, i));
  },
};

function clockworkCase(rng, i) {
  const n = rng.int(6, 8);
  const stations = Array.from({ length: n }, (_, j) => ({
    id: `S${j + 1}`,
    duration: rng.int(1, 5),
  }));
  const deps = {};
  for (const s of stations) deps[s.id] = [];
  for (let j = 1; j < n; j++) {
    const pool = stations.slice(0, j).map((s) => s.id);
    const d = rng.sample(pool, rng.int(0, Math.min(2, pool.length)));
    deps[stations[j].id] = d;
  }
  const travel = {};
  for (const a of stations) {
    travel[a.id] = {};
    for (const b of stations) travel[a.id][b.id] = a.id === b.id ? 0 : rng.int(1, 9);
  }
  const c = { id: `clock-${i + 1}`, stations, deps, travel };
  const solved = solveClockwork(c);
  c.answer = { order: solved.order };
  c.expected = c.answer;
  c.optimum = -solved.time;
  c.baseline = -solved.baseline;
  c.prompt = `Clockwork circuit ${i + 1}\nStations (id, duration): ${stations.map((s) => `${s.id}(${s.duration})`).join(", ")}\nPrecedence: ${JSON.stringify(deps)}\nTravel times: ${JSON.stringify(travel)}\n\nReturn { order: [stationId, ...] }. Time = sum of station durations + travel between consecutive stations.`;
  return c;
}

function clockworkTime(order, c) {
  let time = 0;
  for (let i = 0; i < order.length; i++) {
    const s = c.stations.find((x) => x.id === order[i]);
    time += s.duration;
    if (i > 0) time += c.travel[order[i - 1]][order[i]];
  }
  return time;
}

function solveClockwork(c) {
  const ids = c.stations.map((s) => s.id);
  let best = { order: ids, time: Infinity };
  for (const order of permutations(ids)) {
    const ok = ids.every((id) => c.deps[id].every((d) => order.indexOf(d) < order.indexOf(id)));
    if (!ok) continue;
    const time = clockworkTime(order, c);
    if (time < best.time) best = { order, time };
  }
  return { ...best, baseline: clockworkTime(ids, c) };
}

const clockwork = {
  id: "clockwork",
  name: "Clockwork Circuit",
  family: "speed",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["scheduling", "optimization", "graph-reasoning"],
  summary: "Order a multi-station circuit with precedence and travel times, against the clock.",
  rules:
    "Every station runs once, after its prerequisites. Total time is station durations plus travel between consecutive stations. Lowest time wins.",
  submission: "answers",
  evaluator: "assignment",
  instructions: "Submit answers[caseId] = { order: [stationId, ...] }.",
  limits: { max_file_bytes: 128 * 1024 },
  build(seed) {
    const rng = makeRng(`clockwork:${seed}`);
    return Array.from({ length: 6 }, (_, i) => clockworkCase(rng, i));
  },
  validate(answer, c) {
    const order = answer?.order;
    if (!Array.isArray(order) || order.length !== c.stations.length) return { ok: false, reason: "order must list every station once" };
    if (new Set(order).size !== order.length) return { ok: false, reason: "duplicate station" };
    if (order.some((id) => !c.stations.some((s) => s.id === id))) return { ok: false, reason: "unknown station" };
    for (const s of c.stations) {
      for (const d of c.deps[s.id]) {
        if (order.indexOf(d) > order.indexOf(s.id)) return { ok: false, reason: `${s.id} ran before ${d}` };
      }
    }
    return { ok: true };
  },
  value(answer, c) {
    return -clockworkTime(answer.order, c);
  },
};

export const games = [lightningReply, relay100, hotSwap, deadDrop, clockwork];