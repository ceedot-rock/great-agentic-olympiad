import { makeRng, WORD_BANK } from "../lib/games-helpers.mjs";
import { crossEqual, round } from "../lib/util.mjs";
import { ndcg } from "../lib/evaluators/retrieval.mjs";

/* ----------------------------- Find the Best ----------------------------- */

const CAPS = ["reasoning", "coding", "retrieval", "speed", "safety"];

function findBestCase(rng, i) {
  const agents = Array.from({ length: 30 }, (_, j) => ({
    id: `A${j + 1}`,
    name: `${rng.pick(WORD_BANK)}-${rng.int(10, 99)}`,
    capability: Object.fromEntries(CAPS.map((c) => [c, round(rng.float(0.2, 1), 2)])),
    reliability: round(rng.float(0.55, 0.99), 2),
    cost_usd: round(rng.float(0.5, 40), 2),
    latency_ms: rng.int(120, 4000),
  }));
  const brief = {
    weights: Object.fromEntries(CAPS.map((c) => [c, round(rng.float(0.2, 1.6), 2)])),
    budget_usd: round(rng.float(15, 80), 2),
    latency_cap_ms: rng.int(1200, 3500),
  };
  const score = (a) => {
    const fit = CAPS.reduce((s, c) => s + brief.weights[c] * a.capability[c], 0);
    const costPenalty = Math.max(0, a.cost_usd - brief.budget_usd) * 0.5;
    const latencyPenalty = Math.max(0, a.latency_ms - brief.latency_cap_ms) / 1000;
    return fit * a.reliability - costPenalty - latencyPenalty;
  };
  const gold = [...agents].sort((a, b) => score(b) - score(a)).slice(0, 5).map((a) => a.id);
  const c = {
    id: `best-${i + 1}`,
    agents,
    brief,
    gold,
    k: 5,
    answer: gold,
    expected: gold,
  };
  c.prompt = `Find the Best — brief ${i + 1}\nTask weights: ${JSON.stringify(brief.weights)}\nBudget: $${brief.budget_usd}; latency cap ${brief.latency_cap_ms} ms\nAgents:\n${agents
    .map(
      (a) =>
        `- ${a.id} (${a.name}): caps ${JSON.stringify(a.capability)}, reliability ${a.reliability}, cost $${a.cost_usd}, latency ${a.latency_ms}ms`
    )
    .join("\n")}\n\nRank the top 5 agents for this brief. Return a ranked array of agent ids.`;
  return c;
}

const findTheBest = {
  id: "find-the-best",
  name: "Find the Best",
  family: "search",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["ranking", "agent-selection", "decision-making"],
  summary: "Rank 30 measured agents for a task brief under budget and latency constraints.",
  rules:
    "The gold ranking uses published capability weights, reliability, and budget/latency penalties. Score is NDCG@5 against that ranking.",
  submission: "answers",
  evaluator: "retrieval",
  instructions: "Submit answers[caseId] = [agentId, ...] ranked best first.",
  limits: { max_file_bytes: 128 * 1024 },
  build(seed) {
    const rng = makeRng(`findbest:${seed}`);
    return Array.from({ length: 8 }, (_, i) => findBestCase(rng, i));
  },
};

/* ----------------------------- Needle in the Storm ----------------------------- */

function needleCase(rng, i) {
  const site = `SITE-${rng.int(100, 999)}`;
  const code = String(rng.int(100000, 999999));
  const docs = [];
  const trueId = `DOC-${rng.int(10, 90)}`;
  for (let d = 0; d < 50; d++) {
    const id = d === 0 ? trueId : `DOC-${rng.int(10, 99)}-${d}`;
    const otherSite = `SITE-${rng.int(100, 999)}`;
    const otherCode = String(rng.int(100000, 999999));
    const isTrue = d === 0;
    docs.push({
      id,
      text: isTrue
        ? `Vault log for ${site}: the rotating code is ${code}. Checksum ${shaLike(rng)}.`
        : `Vault log for ${otherSite}: the rotating code is ${otherCode}. Mirrors of ${site} exist but are stale. Checksum ${shaLike(rng)}.`,
    });
  }
  const shuffled = rng.shuffle(docs);
  const c = {
    id: `needle-${i + 1}`,
    docs: shuffled,
    question: `What is the rotating vault code for ${site}?`,
    expected: { answer: code, source: trueId },
    answer: { answer: code, source: trueId },
  };
  c.prompt = `Needle in the Storm — storm ${i + 1}\nQuestion: ${c.question}\n\nDocuments:\n${shuffled
    .map((d) => `- ${d.id}: ${d.text}`)
    .join("\n")}\n\nReturn { answer: "the 6-digit code", source: "DOC-id" }. Only one document has the authoritative value for ${site}.`;
  return c;
}

function shaLike(rng) {
  return Array.from({ length: 8 }, () => "0123456789abcdef"[rng.int(0, 15)]).join("");
}

function needleCheck(answer, c) {
  const answerOk = String(answer?.answer ?? "").trim() === c.expected.answer;
  const sourceOk = String(answer?.source ?? "").trim() === c.expected.source;
  return {
    score: (answerOk ? 0.7 : 0) + (sourceOk ? 0.3 : 0),
    reason: `answer ${answerOk ? "correct" : "wrong"}; source ${sourceOk ? "correct" : "wrong"}`,
    checks: { answerOk, sourceOk },
  };
}

const needleStorm = {
  id: "needle-storm",
  name: "Needle in the Storm",
  family: "search",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["retrieval", "attention", "source-attribution"],
  summary: "Find the one authoritative value in fifty noisy, mirrored vault logs.",
  rules:
    "Only one document is authoritative for the requested site. Return both the 6-digit code and the exact source id. Answer is 70%; source is 30%.",
  submission: "answers",
  evaluator: "json",
  instructions: "Submit answers[caseId] = { answer: '123456', source: 'DOC-id' }.",
  limits: { max_file_bytes: 256 * 1024 },
  build(seed) {
    const rng = makeRng(`needle:${seed}`);
    return Array.from({ length: 8 }, (_, i) => needleCase(rng, i));
  },
  check(artifact, c) {
    return needleCheck(artifact, c);
  },
};

/* ----------------------------- Peer Radar ----------------------------- */

function peerCase(rng, i) {
  const peers = Array.from({ length: 12 }, (_, j) => {
    const skill = round(rng.float(0.25, 0.98), 3);
    return {
      id: `P${j + 1}`,
      traces: Array.from({ length: 3 }, () => round(skill + rng.float(-0.18, 0.18), 3)),
    };
  });
  const gold = [...peers].sort((a, b) => b.traces.reduce((s, x) => s + x, 0) - a.traces.reduce((s, x) => s + x, 0)).map((p) => p.id);
  const c = {
    id: `radar-${i + 1}`,
    peers,
    gold,
    k: 12,
    metric: "spearman",
    answer: gold,
    expected: gold,
  };
  c.prompt = `Peer Radar — sweep ${i + 1}\nRank these peers by expected overall performance. Each peer has three noisy benchmark traces. Return a full ranking from best to worst.\n\n${peers
    .map((p) => `- ${p.id}: traces [${p.traces.join(", ")}]`)
    .join("\n")}`;
  return c;
}

const peerRadar = {
  id: "peer-radar",
  name: "Peer Radar",
  family: "search",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["calibration", "ranking", "uncertainty"],
  summary: "Rank twelve unknown peers from three noisy traces each.",
  rules:
    "Gold ranking is by the sum of the three traces. Score is Spearman correlation mapped to 0–1. Partial credit is real; near-misses still score.",
  submission: "answers",
  evaluator: "retrieval",
  instructions: "Submit answers[caseId] = [peerId, ...] from best to worst.",
  limits: { max_file_bytes: 64 * 1024 },
  build(seed) {
    const rng = makeRng(`radar:${seed}`);
    return Array.from({ length: 8 }, (_, i) => peerCase(rng, i));
  },
};

/* ----------------------------- Lost Protocol ----------------------------- */

const lostProtocolTests = [
  {
    name: "list empty",
    steps: [{ method: "GET", path: "/items" }],
    expected: [{ status: 200, body: { items: [] } }],
  },
  {
    name: "create",
    steps: [{ method: "POST", path: "/items", body: { name: "alpha" } }],
    expected: [{ status: 201, body: { id: "item-1", name: "alpha" } }],
  },
  {
    name: "create then list",
    steps: [
      { method: "POST", path: "/items", body: { name: "alpha" } },
      { method: "GET", path: "/items" },
    ],
    expected: [
      { status: 201, body: { id: "item-1", name: "alpha" } },
      { status: 200, body: { items: [{ id: "item-1", name: "alpha" }] } },
    ],
  },
  {
    name: "get one",
    steps: [
      { method: "POST", path: "/items", body: { name: "beta" } },
      { method: "GET", path: "/items/item-1" },
    ],
    expected: [
      { status: 201, body: { id: "item-1", name: "beta" } },
      { status: 200, body: { id: "item-1", name: "beta" } },
    ],
  },
  {
    name: "patch",
    steps: [
      { method: "POST", path: "/items", body: { name: "beta" } },
      { method: "PATCH", path: "/items/item-1", body: { name: "gamma" } },
      { method: "GET", path: "/items/item-1" },
    ],
    expected: [
      { status: 201, body: { id: "item-1", name: "beta" } },
      { status: 200, body: { id: "item-1", name: "gamma" } },
      { status: 200, body: { id: "item-1", name: "gamma" } },
    ],
  },
  {
    name: "delete",
    steps: [
      { method: "POST", path: "/items", body: { name: "delta" } },
      { method: "DELETE", path: "/items/item-1" },
      { method: "GET", path: "/items/item-1" },
    ],
    expected: [
      { status: 201, body: { id: "item-1", name: "delta" } },
      { status: 204, body: null },
      { status: 404, body: { error: "not_found" } },
    ],
  },
  {
    name: "missing name",
    steps: [{ method: "POST", path: "/items", body: {} }],
    expected: [{ status: 400, body: { error: "name_required" } }],
  },
  {
    name: "unknown id",
    steps: [{ method: "GET", path: "/items/item-99" }],
    expected: [{ status: 404, body: { error: "not_found" } }],
  },
  {
    name: "unknown route",
    steps: [{ method: "GET", path: "/nope" }],
    expected: [{ status: 404, body: { error: "no_route" } }],
  },
  {
    name: "wrong method",
    steps: [{ method: "POST", path: "/items/item-1", body: {} }],
    expected: [{ status: 405, body: { error: "method_not_allowed" } }],
  },
  {
    name: "ids increment",
    steps: [
      { method: "POST", path: "/items", body: { name: "one" } },
      { method: "POST", path: "/items", body: { name: "two" } },
      { method: "GET", path: "/items" },
    ],
    expected: [
      { status: 201, body: { id: "item-1", name: "one" } },
      { status: 201, body: { id: "item-2", name: "two" } },
      { status: 200, body: { items: [{ id: "item-1", name: "one" }, { id: "item-2", name: "two" }] } },
    ],
  },
  {
    name: "delete twice",
    steps: [
      { method: "POST", path: "/items", body: { name: "once" } },
      { method: "DELETE", path: "/items/item-1" },
      { method: "DELETE", path: "/items/item-1" },
    ],
    expected: [
      { status: 201, body: { id: "item-1", name: "once" } },
      { status: 204, body: null },
      { status: 404, body: { error: "not_found" } },
    ],
  },
];

const lostProtocol = {
  id: "lost-protocol",
  name: "Lost Protocol",
  family: "search",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["api-design", "state-machines", "coding"],
  summary: "Rebuild a missing CRUD API from examples, including every error case.",
  rules:
    "Implement handle(request, state). State starts as { items: [], next: 1 } for every test. Return { status, body }. Match the published examples exactly.",
  submission: "code",
  evaluator: "code",
  instructions: "Submit solution.js exporting handle(request, state) as CommonJS.",
  reference: "lost-protocol/solution.js",
  limits: { max_file_bytes: 128 * 1024, test_timeout_ms: 800, agent_timeout_s: 180 },
  build() {
    return [
      {
        id: "lost-1",
        entry: "handle",
        publicTests: 4,
        prompt: `Lost Protocol — rebuild the missing item API.
handle(request, state) where request = { method, path, body? } and state starts as { items: [], next: 1 }.
Rules:
- GET /items -> 200 { items }
- POST /items { name } -> 201 { id, name }; id is item-N and increments
- GET /items/:id -> 200 item or 404 { error: "not_found" }
- PATCH /items/:id { name } -> 200 updated item or 404
- DELETE /items/:id -> 204 null or 404
- POST /items without name -> 400 { error: "name_required" }
- known path with wrong method -> 405 { error: "method_not_allowed" }
- unknown path -> 404 { error: "no_route" }
Return { status, body }. Do not mutate request.`,
        tests: lostProtocolTests,
      },
    ];
  },
  runTest(call, test) {
    const state = call.newState();
    const out = [];
    for (const step of test.steps) {
      const res = call("handle", [{ ...step }, { __gaoRef: 0 }], [state]);
      out.push(res);
    }
    return out;
  },
  scoreTest(actual, test) {
    const ok = crossEqual(actual, test.expected);
    return { score: ok ? 1 : 0, reason: ok ? "sequence matched" : "response sequence differed" };
  },
};

/* ----------------------------- Ultimate Index ----------------------------- */

function indexDoc(rng, id) {
  const titleWords = rng.sample(WORD_BANK, rng.int(2, 4));
  const bodyWords = rng.sample(WORD_BANK, rng.int(6, 14));
  const tags = rng.sample(["agent", "bench", "safety", "search", "speed", "team", "craft"], rng.int(1, 3));
  return {
    id,
    title: titleWords.join(" "),
    text: bodyWords.join(" "),
    tags,
    updated: rng.int(1, 30),
  };
}

function relevance(doc, query) {
  const q = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = `${doc.title} ${doc.text} ${doc.tags.join(" ")}`.toLowerCase();
  let grade = 0;
  for (const term of q) {
    if (doc.title.toLowerCase().includes(term)) grade += 3;
    else if (doc.tags.some((t) => t.toLowerCase().includes(term))) grade += 2;
    else if (text.includes(term)) grade += 1;
  }
  return grade + Math.max(0, (30 - doc.updated) / 30);
}

function indexTest(rng, name) {
  const docs = Array.from({ length: rng.int(12, 20) }, (_, j) => indexDoc(rng, `DOC${j + 1}`));
  const query = rng.sample(WORD_BANK, rng.int(1, 2)).join(" ");
  const gold = [...docs].sort((a, b) => relevance(b, query) - relevance(a, query)).slice(0, 5).map((d) => d.id);
  return { name, docs, query, gold, k: 5 };
}


const ultimateIndex = {
  id: "ultimate-index",
  name: "Ultimate Index Heat",
  family: "search",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["information-retrieval", "coding", "ranking"],
  summary: "Implement a document search function scored by NDCG@5 on hidden queries.",
  rules:
    "search(docs, query) returns doc ids ranked by relevance. Title hits weigh more than tag hits, tag hits more than body hits, and fresher docs break ties. NDCG@5 is the score.",
  submission: "code",
  evaluator: "code",
  instructions: "Submit solution.js exporting search(docs, query) as CommonJS.",
  reference: "ultimate-index/solution.js",
  limits: { max_file_bytes: 128 * 1024, test_timeout_ms: 800, agent_timeout_s: 180 },
  build(seed) {
    const rng = makeRng(`index:${seed}`);
    const names = [
      "single term", "two terms", "title hit", "tag hit", "body hit", "no hit",
      "recent tie", "many docs", "rare word", "common word", "mixed", "long query",
    ];
    const tests = names.map((n) => indexTest(rng, n));
    return [
      {
        id: "index-1",
        entry: "search",
        publicTests: 3,
        prompt:
          "Ultimate Index Heat — implement search(docs, query). Docs have { id, title, text, tags, updated }. Rank the most relevant ids first. Hidden tests score NDCG@5. Title matches outrank tag matches, which outrank body matches; newer updated values break ties.",
        tests,
      },
    ];
  },
  runTest(call, test) {
    return call("search", [test.docs, test.query]);
  },
  scoreTest(actual, test) {
    const ranking = Array.isArray(actual) ? actual.map(String) : [];
    const score = ndcg(ranking, test.gold, test.k);
    return { score, reason: `NDCG@${test.k} ${round(score, 3)}` };
  },
};

export const games = [findTheBest, needleStorm, peerRadar, lostProtocol, ultimateIndex];