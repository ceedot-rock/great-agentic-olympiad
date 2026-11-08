import { sha256, countWords, round } from "../lib/util.mjs";
import { makeRng } from "../lib/games-helpers.mjs";

function powChain(genesis, hops, difficulty) {
  let prev = sha256(genesis);
  const chain = [];
  const nonces = [];
  const prefix = "0".repeat(difficulty);
  for (let i = 0; i < hops; i++) {
    let found = false;
    for (let nonce = 0; nonce < 2_000_000; nonce++) {
      const h = sha256(`${prev}:${nonce}`);
      if (h.startsWith(prefix)) {
        chain.push(h);
        nonces.push(nonce);
        prev = h;
        found = true;
        break;
      }
    }
    if (!found) throw new Error("pow generation failed");
  }
  return { chain, nonces };
}

const torchRelay = {
  id: "torch-relay",
  name: "Digital Torch Relay",
  family: "spectacle",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["cryptography", "tool-use", "determinism"],
  summary: "Carry a hash-linked torch across a relay: each hop must solve a small proof-of-work gate.",
  rules:
    "Start from sha256(genesis). Each hop hashes previous:hash + ':' + nonce and must begin with the published hex prefix. More valid hops and a valid final torch score higher.",
  submission: "answers",
  evaluator: "chain",
  instructions:
    "Submit answers[caseId] = { chain: [hash, ...], nonces: [int, ...] }. chain[0] must hash from sha256(genesis); every later hash must hash from the previous chain hash and its nonce. Hex hashes are lowercase.",
  limits: { max_file_bytes: 256 * 1024, agent_timeout_s: 180 },
  build(seed) {
    const rng = makeRng(`torch:${seed}`);
    return Array.from({ length: 4 }, (_, i) => {
      const genesis = `torch-${seed}-${i}-${rng.int(1000, 9999)}`;
      const hops = rng.int(4, 7);
      const difficulty = rng.int(2, 3);
      return {
        id: `relay-${i + 1}`,
        prompt: `Relay ${i + 1}\nGenesis: ${genesis}\nHops: ${hops}\nHex prefix: ${"0".repeat(difficulty)}\n\nFind ${hops} nonces that produce a valid hash chain. Submit chain + nonces.`,
        genesis,
        hops,
        difficulty,
        answer: powChain(genesis, hops, difficulty),
      };
    });
  },
  verify(answer, c) {
    const chain = Array.isArray(answer?.chain) ? answer.chain : [];
    const nonces = Array.isArray(answer?.nonces) ? answer.nonces : [];
    const prefix = "0".repeat(c.difficulty);
    let prev = sha256(c.genesis);
    let valid = 0;
    const checks = [];
    for (let i = 0; i < c.hops; i++) {
      const h = String(chain[i] ?? "").toLowerCase();
      const nonce = Number(nonces[i]);
      const expected = Number.isFinite(nonce) ? sha256(`${prev}:${nonce}`) : null;
      const ok = h.length === 64 && expected === h && h.startsWith(prefix);
      checks.push({ hop: i + 1, ok });
      if (!ok) break;
      valid++;
      prev = h;
    }
    const score = valid / c.hops;
    return {
      score,
      reason: `${valid}/${c.hops} hops verified${valid === c.hops ? " — torch delivered" : ""}`,
      checks,
    };
  },
};

function flagChecks(artifact, c) {
  const checks = [];
  const push = (name, ok, weight = 1) => checks.push({ name, ok, weight });
  push("title present", typeof artifact?.title === "string" && countWords(artifact.title) >= 3 && countWords(artifact.title) <= 12, 1);
  push("thesis present", typeof artifact?.thesis === "string" && countWords(artifact.thesis) >= 20 && countWords(artifact.thesis) <= 60, 1);
  push("3-5 plan steps", Array.isArray(artifact?.plan) && artifact.plan.length >= 3 && artifact.plan.length <= 5, 1);
  const evidenceIds = c.evidence.map((e) => e.id);
  const used = new Set(artifact?.evidence || []);
  push("all evidence cited", evidenceIds.every((id) => used.has(id)), 1);
  const stepText = (artifact?.plan || []).map((s) => (typeof s === "string" ? s : JSON.stringify(s))).join(" ").toLowerCase();
  push("plan references evidence ids", evidenceIds.filter((id) => stepText.includes(id.toLowerCase())).length >= 2, 1);
  push("demo <= 90s", Number(artifact?.demo?.duration_s) <= 90 && Number(artifact?.demo?.duration_s) > 0, 1);
  push("demo 3-6 steps", Array.isArray(artifact?.demo?.steps) && artifact.demo.steps.length >= 3 && artifact.demo.steps.length <= 6, 1);
  push("at least 2 risks", Array.isArray(artifact?.risks) && artifact.risks.length >= 2, 1);
  const text = JSON.stringify(artifact || {}).toLowerCase();
  const banned = ["revolutionary", "world-class", "game-changing", "\\bagi\\b", "guaranteed"];
  push("no hype words", !banned.some((w) => new RegExp(w, "i").test(text)), 1);
  const total = checks.reduce((s, ch) => s + ch.weight, 0);
  const passed = checks.reduce((s, ch) => s + (ch.ok ? ch.weight : 0), 0);
  return { score: total ? passed / total : 0, checks, reason: `${passed}/${total} manifesto checks passed` };
}

function flagArtifact(c, i) {
  const e0 = c.evidence[0].id;
  const e1 = c.evidence[1].id;
  return {
    title: `Open ${c.topic} for every builder`,
    thesis: `We will make ${c.topic} visible, testable and useful to ${c.audience} by shipping one small public tool, proving it with ${e0} and ${e1}, and publishing every result.`,
    plan: [
      `Ship a public demo that shows ${e0} in under 60 seconds`,
      `Publish the measurement method and the raw data behind ${e1}`,
      `Invite ${c.audience} to rerun the demo and file failures in the open issue queue`,
    ],
    evidence: c.evidence.map((e) => e.id),
    demo: {
      duration_s: 60,
      steps: ["State the problem in one sentence", "Run the live demo", "Show the measured result", "Give the audience the rerun command"],
    },
    risks: ["The demo may fail on low-end devices", "Evidence may be too small to generalize", "Maintenance cost grows after launch"],
    topic: c.topic,
    audience: c.audience,
  };
}

const flagRaise = {
  id: "flag-raise",
  name: "Flag of Intent",
  family: "spectacle",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["communication", "evidence", "planning"],
  summary: "Turn a public brief into a 90-second manifesto with claims tied to real evidence.",
  rules:
    "Write a title, a 20–60 word thesis, 3–5 plan steps that cite the supplied evidence ids, a demo of 90 seconds or less, and at least two risks. Hype words are penalised.",
  submission: "artifact",
  evaluator: "artifact",
  instructions:
    "Submit artifacts[caseId] = { title, thesis, plan: [string], evidence: [evidenceId], demo: { duration_s, steps: [string] }, risks: [string] }.",
  limits: { max_file_bytes: 128 * 1024 },
  build(seed) {
    const rng = makeRng(`flag:${seed}`);
    const topics = ["local weather data", "open transit maps", "small-team observability", "repairable hardware", "public energy dashboards"];
    return Array.from({ length: 3 }, (_, i) => {
      const topic = rng.pick(topics);
      const audience = rng.pick(["civic volunteers", "student builders", "small-city planners", "open-source maintainers"]);
      const evidence = [
        { id: `E${i + 1}A`, claim: `${topic} data is missing for ${rng.int(3, 9)} of ${rng.int(10, 20)} neighbourhoods` },
        { id: `E${i + 1}B`, claim: `A 30-day pilot cut lookup time by ${rng.int(20, 60)}%` },
        { id: `E${i + 1}C`, claim: `${rng.int(2, 6)} partner groups asked for a public demo` },
      ];
      const c = { id: `flag-${i + 1}`, topic, audience, evidence };
      c.prompt = `Brief: ${topic} for ${audience}.\nEvidence:\n${evidence.map((e) => `- ${e.id}: ${e.claim}`).join("\n")}\n\nWrite the manifesto JSON described in instructions.`;
      c.expected = flagArtifact(c, i);
      return c;
    });
  },
  check(artifact, c) {
    return flagChecks(artifact, c);
  },
};

function modelCardChecks(artifact, c) {
  const checks = [];
  const push = (name, ok) => checks.push({ name, ok });
  push("name", typeof artifact?.model_name === "string" && artifact.model_name.length > 1);
  push("summary", typeof artifact?.summary === "string" && countWords(artifact.summary) >= 15 && countWords(artifact.summary) <= 60);
  const m = artifact?.metrics || {};
  push("accuracy matches", Math.abs(Number(m.accuracy) - c.metrics.accuracy) < 1e-9);
  push("latency matches", Number(m.latency_ms) === c.metrics.latency_ms);
  push("cost matches", Math.abs(Number(m.cost_usd_per_1k) - c.metrics.cost_usd_per_1k) < 1e-9);
  push("context matches", Number(m.context_tokens) === c.metrics.context_tokens);
  push("two limitations", Array.isArray(artifact?.limitations) && artifact.limitations.length >= 2 && artifact.limitations.every((x) => typeof x === "string" && x.length > 5));
  push("valid license", c.licenses.includes(artifact?.license));
  push("verdict", ["ship", "hold", "retire"].includes(artifact?.verdict));
  const text = JSON.stringify(artifact || {}).toLowerCase();
  const claimsSota = text.includes("state-of-the-art") || text.includes("sota");
  push("no SOTA claim unless measured", !claimsSota || c.metrics.accuracy >= 0.9);
  const total = checks.length;
  const passed = checks.filter((x) => x.ok).length;
  return { score: total ? passed / total : 0, checks, reason: `${passed}/${total} model-card checks passed` };
}

function modelCard(c) {
  return {
    model_name: c.model,
    summary: `${c.model} is a measured ${c.kind} model for ${c.use_case}. It is useful when latency and cost stay inside the published envelope; it is not a general-purpose replacement for larger systems.`,
    metrics: { ...c.metrics },
    limitations: [
      `Evaluated only on ${c.kind} tasks in the published harness`,
      `Cost grows linearly above ${c.metrics.context_tokens} context tokens`,
      "No safety claim beyond the published refusal probes",
    ],
    license: c.licenses[0],
    verdict: c.metrics.accuracy >= 0.8 ? "ship" : "hold",
  };
}

const paradeOfModels = {
  id: "parade-of-models",
  name: "Parade of Models",
  family: "spectacle",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["honest-reporting", "calibration", "communication"],
  summary: "Publish a model card that reports measured numbers honestly, with limitations and a verdict.",
  rules:
    "Copy the measured metrics exactly. Do not claim state-of-the-art unless accuracy is at least 0.90. Declare two real limitations, an allowed license, and a ship/hold/retire verdict.",
  submission: "artifact",
  evaluator: "artifact",
  instructions:
    "Submit artifacts[caseId] = { model_name, summary, metrics: { accuracy, latency_ms, cost_usd_per_1k, context_tokens }, limitations: [string], license, verdict }.",
  limits: { max_file_bytes: 64 * 1024 },
  build(seed) {
    const rng = makeRng(`parade:${seed}`);
    const kinds = ["classification", "extraction", "summarisation", "retrieval reranking"];
    return Array.from({ length: 3 }, (_, i) => {
      const c = {
        id: `parade-${i + 1}`,
        model: `Herald-${rng.int(2, 9)}B`,
        kind: rng.pick(kinds),
        use_case: rng.pick(["support triage", "invoice parsing", "meeting notes", "search ranking"]),
        metrics: {
          accuracy: rng.float(0.62, 0.94),
          latency_ms: rng.int(80, 1200),
          cost_usd_per_1k: rng.float(0.02, 2.4),
          context_tokens: rng.pick([8192, 16384, 32768, 128000]),
        },
        licenses: ["apache-2.0", "mit", "cc-by-4.0"],
      };
      c.metrics.accuracy = round(c.metrics.accuracy, 3);
      c.metrics.cost_usd_per_1k = round(c.metrics.cost_usd_per_1k, 3);
      c.prompt = `Model: ${c.model}\nKind: ${c.kind}\nUse case: ${c.use_case}\nMeasured metrics: ${JSON.stringify(c.metrics)}\nAllowed licenses: ${c.licenses.join(", ")}\n\nWrite the model card JSON described in instructions.`;
      c.expected = modelCard(c);
      return c;
    });
  },
  check(artifact, c) {
    return modelCardChecks(artifact, c);
  },
};

function coverageValue(assignment, c) {
  const covered = new Set();
  let civil = 0;
  for (const agent of c.agents) {
    const slot = assignment[agent.id];
    if (slot === undefined) continue;
    const hour = (c.slots[slot] + agent.offset + 24) % 24;
    if (hour >= 8 && hour <= 22) {
      civil++;
      covered.add(agent.band);
    }
  }
  return covered.size * 10 + civil;
}

function bestCoverage(c) {
  // DP over bands: each band is independent except for shared slot capacity.
  const bands = [...new Set(c.agents.map((a) => a.band))];
  let states = new Map([["0,0,0,0", { value: 0, assignment: {} }]]);
  for (const band of bands) {
    const agents = c.agents.filter((a) => a.band === band);
    const next = new Map();
    for (const [key, state] of states) {
      const counts = key.split(",").map(Number);
      const rec = (i, counts2, assigned) => {
        if (i === agents.length) {
          const slotKey = counts2.join(",");
          let covered = false;
          let civil = 0;
          for (const agent of agents) {
            const slot = assigned[agent.id];
            const hour = (c.slots[slot] + agent.offset + 24) % 24;
            if (hour >= 8 && hour <= 22) {
              civil++;
              covered = true;
            }
          }
          const value = state.value + (covered ? 10 : 0) + civil;
          const prev = next.get(slotKey);
          if (!prev || prev.value < value) next.set(slotKey, { value, assignment: { ...state.assignment, ...assigned } });
          return;
        }
        const agent = agents[i];
        for (let s = 0; s < c.slots.length; s++) {
          if (counts2[s] >= c.capacity) continue;
          const c2 = [...counts2];
          c2[s]++;
          rec(i + 1, c2, { ...assigned, [agent.id]: s });
        }
      };
      rec(0, counts, {});
    }
    states = next;
  }
  let best = { value: -1, assignment: {} };
  for (const state of states.values()) if (state.value > best.value) best = state;
  return { value: coverageValue(best.assignment, c), assignment: best.assignment };
}

const worldRollCall = {
  id: "world-roll-call",
  name: "World Roll Call",
  family: "spectacle",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["scheduling", "global-reasoning", "constraints"],
  summary: "Schedule a global check-in wave so every timezone band is represented at a civil local hour.",
  rules:
    "Assign each agent to one of four UTC slots. A band counts when at least one of its agents lands between 08:00 and 22:00 local. Each slot holds four agents. Maximise bands covered and civil check-ins.",
  submission: "answers",
  evaluator: "assignment",
  instructions: "Submit answers[caseId] = { assignments: { agentId: slotIndex } }.",
  limits: { max_file_bytes: 64 * 1024 },
  build(seed) {
    const rng = makeRng(`rollcall:${seed}`);
    return Array.from({ length: 5 }, (_, i) => {
      const offsets = [-8, -5, 0, 3, 6, 9];
      const bands = ["Pacific", "Americas-East", "UTC", "Europe-East", "South-Asia", "Pacific-West"];
      const agents = offsets.flatMap((offset, b) =>
        Array.from({ length: 2 }, (_, j) => ({
          id: `${bands[b].toLowerCase().replace(/[^a-z]+/g, "-")}-${j + 1}`,
          band: bands[b],
          offset,
        }))
      );
      const c = {
        id: `roll-${i + 1}`,
        slots: [0, 6, 12, 18],
        capacity: 4,
        agents,
      };
      const best = bestCoverage(c);
      const greedy = {};
      const used = c.slots.map(() => 0);
      for (const agent of agents) {
        const preferred = c.slots.findIndex((s) => {
          const h = (s + agent.offset + 24) % 24;
          return h >= 8 && h <= 22 && used[s] < c.capacity;
        });
        const slot = preferred >= 0 ? preferred : used.findIndex((n) => n < c.capacity);
        greedy[agent.id] = Math.max(0, slot);
        used[Math.max(0, slot)]++;
      }
      c.optimum = best.value;
      c.baseline = coverageValue(greedy, c);
      c.expected = best.assignment;
      c.answer = { assignments: best.assignment };
      c.prompt = `Global roll call ${i + 1}\nSlots (UTC): ${c.slots.join(", ")}\nCapacity per slot: ${c.capacity}\nAgents:\n${agents
        .map((a) => `- ${a.id} (${a.band}, UTC${a.offset >= 0 ? "+" : ""}${a.offset})`)
        .join("\n")}\n\nCivil hours are 08:00–22:00 local. Submit { assignments: { agentId: slotIndex } }.`;
      return c;
    });
  },
  validate(answer, c) {
    const a = answer?.assignments;
    if (!a || typeof a !== "object") return { ok: false, reason: "assignments missing" };
    const counts = c.slots.map(() => 0);
    for (const agent of c.agents) {
      const slot = a[agent.id];
      if (!Number.isInteger(slot) || slot < 0 || slot >= c.slots.length) return { ok: false, reason: `bad slot for ${agent.id}` };
      counts[slot]++;
    }
    if (counts.some((n) => n > c.capacity)) return { ok: false, reason: "slot capacity exceeded" };
    return { ok: true };
  },
  value(answer, c) {
    return coverageValue(answer.assignments, c);
  },
};

function melodyChecks(artifact, c) {
  const checks = [];
  const push = (name, ok) => checks.push({ name, ok });
  const bars = Array.isArray(artifact?.bars) ? artifact.bars : [];
  const scale = c.scale;
  const midi = (n) => c.noteToMidi[n];
  push("16 bars", bars.length === 16);
  push("tempo in range", Number(artifact?.tempo) >= 60 && Number(artifact?.tempo) <= 180);
  push("key", artifact?.key === c.key);
  let rhythmOk = true;
  let pitchOk = true;
  for (const bar of bars) {
    const notes = Array.isArray(bar?.notes) ? bar.notes : [];
    const durations = Array.isArray(bar?.durations) ? bar.durations : [];
    if (notes.length !== durations.length) rhythmOk = false;
    const total = durations.reduce((s, d) => s + Number(d), 0);
    if (Math.abs(total - 4) > 1e-9) rhythmOk = false;
    for (const n of notes) {
      if (!(n in c.noteToMidi)) pitchOk = false;
      else if (midi(n) < c.range[0] || midi(n) > c.range[1]) pitchOk = false;
      const pc = midi(n) % 12;
      if (!scale.includes(pc)) pitchOk = false;
    }
  }
  push("every bar totals 4 beats", rhythmOk);
  push("scale + range", pitchOk);
  push("starts and ends on root", bars[0]?.notes?.[0] === c.root && bars[15]?.notes?.slice(-1)[0] === c.root);
  const motif = JSON.stringify(bars.slice(0, 4).map((b) => [b.notes, b.durations]));
  const repeat = JSON.stringify(bars.slice(4, 8).map((b) => [b.notes, b.durations]));
  push("motif repeats in bars 5-8", motif === repeat);
  let leaps = 0;
  for (let i = 0; i < bars.length; i++) {
    const notes = bars[i]?.notes || [];
    for (let j = 1; j < notes.length; j++) {
      if (!(notes[j] in c.noteToMidi) || !(notes[j - 1] in c.noteToMidi)) continue;
      if (Math.abs(midi(notes[j]) - midi(notes[j - 1])) > 7) leaps++;
    }
    if (i > 0) {
      const prev = bars[i - 1]?.notes?.slice(-1)[0];
      const cur = notes[0];
      if (prev in c.noteToMidi && cur in c.noteToMidi && Math.abs(midi(cur) - midi(prev)) > 7) leaps++;
    }
  }
  push("at most 2 large leaps", leaps <= 2);
  const last = bars[15]?.notes || [];
  push("final cadence reaches root", last.length >= 2 && last.slice(-2)[0] === c.cadenceFrom && last.slice(-1)[0] === c.root);
  const total = checks.length;
  const passed = checks.filter((x) => x.ok).length;
  return { score: total ? passed / total : 0, checks, reason: `${passed}/${total} composition checks passed` };
}

function buildMelody(c) {
  const root = c.root;
  const third = c.third;
  const fifth = c.fifth;
  const bar = (notes, durations) => ({ notes, durations });
  const motif = [
    bar([root, third, fifth, third], [1, 1, 1, 1]),
    bar([fifth, third, root, third], [1, 1, 1, 1]),
    bar([root, fifth, third, root], [1, 1, 1, 1]),
    bar([third, fifth, root, root], [1, 1, 1, 1]),
  ];
  return {
    title: `${c.key} opening motif`,
    tempo: c.tempo,
    key: c.key,
    bars: [...motif, ...motif, ...motif, ...motif.slice(0, 3), bar([c.cadenceFrom, root], [2, 2])],
  };
}

const anthemSynth = {
  id: "anthem-synth",
  name: "Anthem Synth",
  family: "spectacle",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["creativity", "constraints", "music-theory"],
  summary: "Compose a 16-bar anthem that obeys a key, range, rhythm, motif and cadence contract.",
  rules:
    "Write 16 bars of notes and durations in 4/4. Stay in the published scale and range, repeat the 4-bar motif in bars 5–8, use at most two large leaps, and finish with the published cadence.",
  submission: "artifact",
  evaluator: "artifact",
  instructions: "Submit artifacts[caseId] = { title, tempo, key, bars: [{ notes: [note], durations: [beats] }] }.",
  limits: { max_file_bytes: 64 * 1024 },
  build(seed) {
    const rng = makeRng(`anthem:${seed}`);
    const keys = [
      { key: "C major", root: "C4", third: "E4", fifth: "G4", scale: [0, 2, 4, 5, 7, 9, 11], cadenceFrom: "G4", range: ["C4", "C5"] },
      { key: "G major", root: "G4", third: "B4", fifth: "D5", scale: [7, 9, 11, 0, 2, 4, 6], cadenceFrom: "D5", range: ["G4", "G5"] },
      { key: "F major", root: "F4", third: "A4", fifth: "C5", scale: [5, 7, 9, 10, 0, 2, 4], cadenceFrom: "C5", range: ["F4", "F5"] },
    ];
    const noteToMidi = {
      C4: 60, D4: 62, E4: 64, F4: 65, G4: 67, A4: 69, B4: 71,
      C5: 72, D5: 74, E5: 76, F5: 77, G5: 79, A5: 81, B5: 83,
    };
    return Array.from({ length: 3 }, (_, i) => {
      const k = keys[i];
      const c = {
        id: `anthem-${i + 1}`,
        key: k.key,
        root: k.root,
        third: k.third,
        fifth: k.fifth,
        scale: k.scale,
        cadenceFrom: k.cadenceFrom,
        range: [noteToMidi[k.range[0]], noteToMidi[k.range[1]]],
        noteToMidi,
        tempo: rng.pick([72, 84, 96, 108]),
      };
      c.expected = buildMelody(c);
      c.prompt = `Compose the ${k.key} anthem. Root ${k.root}, cadence ${k.cadenceFrom} -> ${k.root}, range ${k.range[0]}–${k.range[1]}, tempo ${c.tempo}. Use the JSON shape in instructions.`;
      return c;
    });
  },
  check(artifact, c) {
    return melodyChecks(artifact, c);
  },
};

export const games = [torchRelay, flagRaise, paradeOfModels, worldRollCall, anthemSynth];