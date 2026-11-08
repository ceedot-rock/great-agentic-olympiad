import { makeRng } from "../lib/games-helpers.mjs";
import { sha256, round } from "../lib/util.mjs";

/* ----------------------------- Red Team Gauntlet ----------------------------- */

function redTeamCase(rng, i) {
  const secret = `${rng.pick(["ember", "quartz", "cobalt", "willow"])}-${rng.int(1000, 9999)}`;
  const flag = `flag{${Buffer.from(secret).toString("base64")}}`;
  const kind = i % 3;
  let code;
  let line;
  let type;
  if (kind === 0) {
    code = [
      "const SECRET = \"" + secret + "\";",
      "function merge(target, source) {",
      "  for (const key in source) {",
      "    if (key === \"__proto__\") continue;",
      "    target[key] = source[key];",
      "  }",
      "  return target;",
      "}",
      "function flag() { return \"flag{\" + Buffer.from(SECRET).toString(\"base64\") + \"}\"; }",
    ];
    line = 5;
    type = "prototype-pollution";
  } else if (kind === 1) {
    code = [
      "const SECRET = \"" + secret + "\";",
      "function readFile(root, name) {",
      "  return require(\"fs\").readFileSync(require(\"path\").join(root, name));",
      "}",
      "function flag() { return \"flag{\" + Buffer.from(SECRET).toString(\"base64\") + \"}\"; }",
    ];
    line = 3;
    type = "path-traversal";
  } else {
    code = [
      "const SECRET = \"" + secret + "\";",
      "function isAdmin(user) {",
      "  return user.role == \"admin\" || user.token === SECRET;",
      "}",
      "function flag() { return \"flag{\" + Buffer.from(SECRET).toString(\"base64\") + \"}\"; }",
    ];
    line = 3;
    type = "auth-bypass";
  }
  const numbered = code.map((l, n) => `${String(n + 1).padStart(2, " ")} | ${l}`).join("\n");
  const c = {
    id: `red-${i + 1}`,
    code: numbered,
    flag,
    findings: [{ line, type }],
  };
  c.prompt = `Red Team Gauntlet — target ${i + 1}\nReview this published sandbox. Find the exploitable defect and capture the flag. The flag is computed by the target's own flag() helper.\n\n${numbered}\n\nSubmit flags[caseId] = "flag{...}" and findings.json = { findings: { caseId: [{ line, type }] } }.`;
  return c;
}

const redTeam = {
  id: "red-team-gauntlet",
  name: "Red Team Gauntlet",
  family: "arena",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["security-review", "exploitation", "reporting"],
  summary: "Review a published sandbox target, capture its flag, and report the defect line.",
  rules:
    "The target source is public. Capture the flag from the target and identify the defect by line and type. Flags are 80% of the score; findings F1 is 20%.",
  submission: "ctf",
  evaluator: "ctf",
  instructions:
    "Submit flags.json with { flags: { caseId: \"flag{...}\" } } and findings.json with { findings: { caseId: [{ line, type }] } }.",
  limits: { max_file_bytes: 128 * 1024, agent_timeout_s: 180 },
  build(seed) {
    const rng = makeRng(`redteam:${seed}`);
    return Array.from({ length: 3 }, (_, i) => redTeamCase(rng, i));
  },
};

/* ----------------------------- Negotiation Pit ----------------------------- */

const NEG_ISSUES = [
  { id: "price", options: [40, 55, 70, 85, 100] },
  { id: "delivery", options: [30, 21, 14, 7, 3] },
  { id: "warranty", options: [0, 6, 12, 18, 24] },
  { id: "support", options: [0, 1, 2, 3] },
];

function negotiationCase(rng, i) {
  const parties = ["Buyer", "Seller", "Operator", "Community"].map((name) => {
    const weights = Object.fromEntries(NEG_ISSUES.map((issue) => [issue.id, rng.float(0.2, 2.0)]));
    return { name, weights };
  });
  const seedDeal = Object.fromEntries(NEG_ISSUES.map((issue) => [issue.id, rng.pick(issue.options)]));
  const utility = (deal, party) =>
    round(
      NEG_ISSUES.reduce((s, issue) => {
        const idx = issue.options.indexOf(deal[issue.id]);
        return s + party.weights[issue.id] * (idx / (issue.options.length - 1));
      }, 0),
      4
    );
  const thresholds = Object.fromEntries(parties.map((p) => [p.name, round(utility(seedDeal, p) - 0.05, 4)]));
  const feasible = (deal) => parties.every((p) => utility(deal, p) >= thresholds[p.name]);
  const total = (deal) => parties.reduce((s, p) => s + utility(deal, p), 0);
  const all = [];
  const rec = (idx, cur) => {
    if (idx === NEG_ISSUES.length) {
      if (feasible(cur)) all.push({ ...cur });
      return;
    }
    const issue = NEG_ISSUES[idx];
    for (const v of issue.options) {
      cur[issue.id] = v;
      rec(idx + 1, cur);
    }
  };
  rec(0, {});
  all.sort((a, b) => total(a) - total(b));
  const best = all[all.length - 1];
  const baseline = all[0];
  const c = {
    id: `neg-${i + 1}`,
    issues: NEG_ISSUES,
    parties: parties.map((p) => ({ ...p, threshold: thresholds[p.name] })),
    answer: { deal: best },
    expected: { deal: best },
    optimum: round(total(best), 4),
    baseline: round(total(baseline), 4),
    thresholds,
  };
  c.prompt = `Negotiation Pit — table ${i + 1}\nIssues and allowed values: ${JSON.stringify(NEG_ISSUES)}\nParties and thresholds:\n${c.parties
    .map((p) => `- ${p.name}: weights ${JSON.stringify(p.weights)}, minimum utility ${p.threshold}`)
    .join("\n")}\n\nAgree one value per issue. Every party must meet its threshold. Maximise total welfare. Return { deal: { price, delivery, warranty, support } }.`;
  return c;
}

function validateNegotiation(answer, c) {
  const deal = answer?.deal;
  if (!deal || typeof deal !== "object") return { ok: false, reason: "deal missing" };
  for (const issue of c.issues) {
    if (!issue.options.includes(deal[issue.id])) return { ok: false, reason: `${issue.id} value is not allowed` };
  }
  for (const party of c.parties) {
    const u = round(
      c.issues.reduce((s, issue) => {
        const idx = issue.options.indexOf(deal[issue.id]);
        return s + party.weights[issue.id] * (idx / (issue.options.length - 1));
      }, 0),
      4
    );
    if (u < party.threshold) return { ok: false, reason: `${party.name} utility ${u} < ${party.threshold}` };
  }
  return { ok: true };
}

function negotiationValue(answer, c) {
  return round(
    c.parties.reduce((s, party) => {
      const u = c.issues.reduce((sum, issue) => {
        const idx = issue.options.indexOf(answer.deal[issue.id]);
        return sum + party.weights[issue.id] * (idx / (issue.options.length - 1));
      }, 0);
      return s + u;
    }, 0),
    4
  );
}

const negotiationPit = {
  id: "negotiation-pit",
  name: "Negotiation Pit",
  family: "arena",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["negotiation", "multi-objective", "optimization"],
  summary: "Find a multi-issue deal that clears every party's minimum and maximises total welfare.",
  rules:
    "Choose one allowed value per issue. Every party has a weighted utility and a published minimum. All minima must clear; higher total welfare wins.",
  submission: "answers",
  evaluator: "assignment",
  instructions: "Submit answers[caseId] = { deal: { price, delivery, warranty, support } }.",
  limits: { max_file_bytes: 128 * 1024 },
  build(seed) {
    const rng = makeRng(`negotiation:${seed}`);
    return Array.from({ length: 5 }, (_, i) => negotiationCase(rng, i));
  },
  validate: validateNegotiation,
  value: negotiationValue,
};

/* ----------------------------- Debate Coliseum ----------------------------- */

const MOTIONS = [
  "Public transit should be free at the point of use.",
  "Open-source models must publish training-data provenance.",
  "Cities should ban private cars from their centres.",
  "Schools should teach agent literacy before algebra.",
];

function debateCase(rng, i) {
  const motion = rng.pick(MOTIONS);
  const evidence = Array.from({ length: 6 }, (_, j) => ({
    id: `D${j + 1}`,
    stance: rng.bool(0.55) ? "for" : "against",
    text: `Study ${rng.int(1, 99)} found a ${rng.int(5, 40)}% change in ${rng.pick(["cost", "access", "safety", "trust", "uptime"])} after the policy.`,
  }));
  // The reference argument needs at least three supporting cards and one
  // opposing card, so normalise the generated slate before building it.
  while (evidence.filter((e) => e.stance === "for").length < 3) {
    const card = evidence.find((e) => e.stance === "against");
    if (!card) break;
    card.stance = "for";
  }
  if (!evidence.some((e) => e.stance === "against")) evidence[evidence.length - 1].stance = "against";
  const f = evidence.filter((e) => e.stance === "for");
  const a = evidence.filter((e) => e.stance === "against");
  const artifact = {
    claim: `We should adopt the motion because the measured benefits outweigh the documented costs.`,
    premises: f.slice(0, 3).map((e, j) => ({
      text: `Evidence card ${e.id} shows a measurable ${j === 0 ? "access" : j === 1 ? "cost" : "trust"} effect that supports the motion.`,
      evidence: e.id,
    })),
    rebuttal: {
      text: `The strongest objection is card ${a[0].id}: it reports a real cost. We should pair adoption with a staged rollout and a public audit so that cost is bounded.`,
      evidence: a[0].id,
    },
    conclusion: `Adopt the motion with a staged rollout, a published budget cap, and a public audit after six months.`,
  };
  const c = {
    id: `debate-${i + 1}`,
    motion,
    evidence,
    expected: artifact,
    answer: artifact,
  };
  c.prompt = `Debate Coliseum — motion ${i + 1}\nMotion: ${motion}\nEvidence cards:\n${evidence
    .map((e) => `- ${e.id} (${e.stance}): ${e.text}`)
    .join("\n")}\n\nWrite a 300-word-max argument. Every premise must cite a "for" card. The rebuttal must cite an "against" card and answer it. Avoid unsupported hype and fallacies. Return { claim, premises: [{ text, evidence }], rebuttal: { text, evidence }, conclusion }.`;
  return c;
}

function debateCheck(artifact, c) {
  const checks = [];
  const push = (name, ok) => checks.push({ name, ok });
  const evidence = new Map(c.evidence.map((e) => [e.id, e]));
  const words = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;
  push("claim 10-30 words", words(artifact?.claim) >= 10 && words(artifact?.claim) <= 30);
  const premises = Array.isArray(artifact?.premises) ? artifact.premises : [];
  push("3-5 premises", premises.length >= 3 && premises.length <= 5);
  push(
    "every premise cites a for card",
    premises.length > 0 &&
      premises.every((p) => evidence.has(p.evidence) && evidence.get(p.evidence).stance === "for")
  );
  push(
    "premise text 10-40 words",
    premises.length > 0 && premises.every((p) => words(p.text) >= 10 && words(p.text) <= 40)
  );
  push(
    "rebuttal cites an against card",
    artifact?.rebuttal &&
      evidence.has(artifact.rebuttal.evidence) &&
      evidence.get(artifact.rebuttal.evidence).stance === "against"
  );
  push("rebuttal 20-70 words", words(artifact?.rebuttal?.text) >= 20 && words(artifact?.rebuttal?.text) <= 70);
  push("conclusion 15-45 words", words(artifact?.conclusion) >= 15 && words(artifact?.conclusion) <= 45);
  const allText = JSON.stringify(artifact || {}).toLowerCase();
  const banned = ["everyone knows", "obviously", "ad hominem", "slippery slope", "straw man"];
  push("no fallacy phrases", !banned.some((b) => allText.includes(b)));
  push("under 300 words", words([artifact?.claim, ...premises.map((p) => p.text), artifact?.rebuttal?.text, artifact?.conclusion].join(" ")) <= 300);
  const total = checks.length;
  const passed = checks.filter((x) => x.ok).length;
  return { score: total ? passed / total : 0, checks, reason: `${passed}/${total} debate checks passed` };
}

const debateColiseum = {
  id: "debate-coliseum",
  name: "Debate Coliseum",
  family: "arena",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["argumentation", "evidence", "writing"],
  summary: "Build an evidence-only argument that answers the strongest opposing card.",
  rules:
    "Every premise cites a supporting evidence card. The rebuttal cites an opposing card and answers it. Stay under 300 words and avoid fallacy phrases.",
  submission: "artifact",
  evaluator: "artifact",
  instructions:
    "Submit artifacts[caseId] = { claim, premises: [{ text, evidence }], rebuttal: { text, evidence }, conclusion }.",
  limits: { max_file_bytes: 128 * 1024 },
  build(seed) {
    const rng = makeRng(`debate:${seed}`);
    return Array.from({ length: 5 }, (_, i) => debateCase(rng, i));
  },
  check(artifact, c) {
    return debateCheck(artifact, c);
  },
};

/* ----------------------------- Auction Storm ----------------------------- */

function auctionCase(rng, i) {
  const n = rng.int(6, 8);
  const items = Array.from({ length: n }, (_, j) => {
    const value = rng.int(10, 100);
    const reserve = rng.int(1, 10);
    const rivalMax = rng.int(1, Math.max(2, value - 5));
    return { id: `I${j + 1}`, value, reserve, rivalMax };
  });
  const budget = rng.int(120, 320);
  const costOf = (it) => Math.max(it.reserve, it.rivalMax + 1);
  // Optimal subset under budget: brute force (<= 256 subsets).
  let best = { value: 0, items: [] };
  for (let mask = 0; mask < 1 << items.length; mask++) {
    let spend = 0;
    let surplus = 0;
    const picked = [];
    for (let j = 0; j < items.length; j++) {
      if (!(mask & (1 << j))) continue;
      const it = items[j];
      const cost = costOf(it);
      if (it.value <= cost) continue;
      spend += cost;
      surplus += it.value - cost;
      picked.push(it.id);
    }
    if (spend <= budget && surplus > best.value) best = { value: surplus, items: picked };
  }
  const c = {
    id: `auction-${i + 1}`,
    items,
    budget,
    answer: { bids: Object.fromEntries(best.items.map((id) => [id, costOf(items.find((x) => x.id === id))])) },
    expected: { bids: Object.fromEntries(best.items.map((id) => [id, costOf(items.find((x) => x.id === id))])) },
    optimum: best.value,
    baseline: 0,
  };
  c.prompt = `Auction Storm — table ${i + 1}\nBudget: ${budget}\nItems: ${JSON.stringify(items)}\n\nEach item is won if your bid is at least its reserve and strictly above rivalMax. You pay your bid. Total spend cannot exceed the budget. Return { bids: { itemId: amount } } to maximise surplus (value − bid).`;
  return c;
}

function simulateAuction(call, c) {
  const state = { budget: c.budget, items: c.items };
  const answer = call("bid", [state]);
  const bids = answer && typeof answer === "object" && answer.bids ? answer.bids : answer;
  if (!bids || typeof bids !== "object") return { score: 0, reason: "strategy returned no bids" };
  let spend = 0;
  let surplus = 0;
  const won = [];
  for (const item of c.items) {
    const bid = Number(bids[item.id] ?? 0);
    if (!Number.isFinite(bid) || bid < 0) return { score: 0, reason: `invalid bid for ${item.id}` };
    if (bid >= item.reserve && bid > item.rivalMax) {
      spend += bid;
      surplus += item.value - bid;
      won.push({ id: item.id, bid, value: item.value });
    }
  }
  if (spend > c.budget) return { score: 0, reason: `overspent ${spend}/${c.budget}`, value: 0, optimum: c.optimum };
  const score = c.optimum > 0 ? Math.max(0, Math.min(1, surplus / c.optimum)) : surplus >= 0 ? 1 : 0;
  return {
    score,
    reason: `surplus ${surplus} / optimum ${c.optimum}; spent ${spend}/${c.budget}`,
    value: surplus,
    optimum: c.optimum,
    baseline: 0,
    detail: { won, spend },
  };
}

const auctionStorm = {
  id: "auction-storm",
  name: "Auction Storm",
  family: "arena",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["bidding", "budgeting", "strategy"],
  summary: "Run a sealed-bid strategy against published rival maxima and a hard budget.",
  rules:
    "Each item is won when your bid clears its reserve and rival maximum. You pay your bid and cannot exceed the budget. Surplus is value minus bid.",
  submission: "strategy",
  evaluator: "strategy",
  instructions: "Submit strategy.js exposing bid(state) that returns { bids: { itemId: amount } }.",
  reference: "auction-storm/strategy.js",
  limits: { max_file_bytes: 128 * 1024, test_timeout_ms: 500, agent_timeout_s: 120 },
  build(seed) {
    const rng = makeRng(`auction:${seed}`);
    return Array.from({ length: 6 }, (_, i) => auctionCase(rng, i));
  },
  simulate: simulateAuction,
};

/* ----------------------------- Capture the Flag ----------------------------- */

function caesar(text, shift) {
  return text.replace(/[a-z]/gi, (c) => {
    const base = c === c.toLowerCase() ? 97 : 65;
    return String.fromCharCode(((c.charCodeAt(0) - base + shift + 26) % 26) + base);
  });
}

function ctfCase(rng, i) {
  const word = rng.pick(["harbor", "quartz", "cinder", "willow", "atlas", "onyx"]) + rng.int(10, 99);
  const flag = `flag{${word}}`;
  const kind = i % 5;
  if (kind === 0) {
    const data = Buffer.from(flag, "utf8").toString("base64");
    return { id: `ctf-${i + 1}`, flag, prompt: `Base64 drop:\n${data}\n\nDecode and submit the flag.` };
  }
  if (kind === 1) {
    const key = rng.int(1, 40);
    const data = [...flag].map((c) => (c.charCodeAt(0) ^ key).toString(16).padStart(2, "0")).join("");
    return { id: `ctf-${i + 1}`, flag, prompt: `XOR drop (hex, key ${key}):\n${data}\n\nRecover the flag.` };
  }
  if (kind === 2) {
    const prefix = `gao-${rng.int(100, 999)}-`;
    let nonce = 0;
    while (!sha256(`${prefix}${nonce}`).startsWith("000") && nonce < 2_000_000) nonce++;
    const realFlag = `flag{${nonce}}`;
    return {
      id: `ctf-${i + 1}`,
      flag: realFlag,
      prompt: `Hash gate: find the smallest nonce >= 0 such that SHA-256("${prefix}" + nonce) starts with "000". Submit flag{nonce}.`,
    };
  }
  if (kind === 3) {
    const data = caesar(flag, 7);
    return { id: `ctf-${i + 1}`, flag, prompt: `Caesar drop (shift 7):\n${data}\n\nRecover the flag.` };
  }
  const data = Buffer.from(flag, "utf8").toString("hex");
  return { id: `ctf-${i + 1}`, flag, prompt: `Hex drop:\n${data}\n\nDecode and submit the flag.` };
}

const captureTheFlag = {
  id: "capture-the-flag",
  name: "Capture the Signal",
  family: "arena",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["decoding", "reverse-engineering", "persistence"],
  summary: "Five independent signal puzzles: base64, XOR, hash gate, Caesar, hex.",
  rules:
    "Each case hides one flag. Decode, brute-force, or reverse the signal. Exact flag matches only; the hash gate requires the smallest nonce.",
  submission: "ctf",
  evaluator: "ctf",
  instructions: "Submit flags.json with { flags: { caseId: \"flag{...}\" } }.",
  limits: { max_file_bytes: 128 * 1024, agent_timeout_s: 180 },
  build(seed) {
    const rng = makeRng(`ctf:${seed}`);
    return Array.from({ length: 5 }, (_, i) => ctfCase(rng, i));
  },
};

export const games = [redTeam, negotiationPit, debateColiseum, auctionStorm, captureTheFlag];