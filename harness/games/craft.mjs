import { fileURLToPath } from "node:url";
import { makeRng } from "../lib/games-helpers.mjs";
import { countWords, crossEqual } from "../lib/util.mjs";

/* ----------------------------- One-Shot App ----------------------------- */

const oneShotApp = {
  id: "one-shot-app",
  name: "One-Shot App",
  family: "craft",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["frontend", "html", "state-machines"],
  summary: "Ship a single HTML file that runs a live countdown, shows READY, and restarts cleanly.",
  rules:
    "One HTML file, under 50 KB, with no external scripts or styles. On load it shows 10 and counts down once per second; at zero it shows READY. A button with id=start restarts the countdown.",
  submission: "html",
  evaluator: "html",
  instructions:
    "Submit app.html. The page must work offline, render a visible countdown, show READY at zero, and expose a restful start button with id=start.",
  reference: "one-shot-app/app.html",
  limits: { max_file_bytes: 50 * 1024, agent_timeout_s: 180 },
  build() {
    return [
      {
        id: "countdown-1",
        brief:
          "Build a single-file countdown app. It shows 10, 9, ... 0, then READY. The start button (id=start) restarts at 10.",
        acceptance: [
          "Single HTML file under 50 KB",
          "No external script/style URLs",
          "Shows 10 on load",
          "Shows 9 after one second",
          "Shows READY at zero",
          "Button #start restarts at 10",
        ],
        static: [
          { type: "text", value: "READY" },
          { type: "regex", pattern: "setInterval|setTimeout" },
        ],
        actions: [{ at_ms: 11000, selector: "#start", event: "click" }],
        runtime: [
          { at_ms: 0, selector: "#display, body", type: "text", value: "10" },
          { at_ms: 1000, selector: "#display, body", type: "text", value: "9" },
          { at_ms: 5000, selector: "#display, body", type: "text", value: "5" },
          { at_ms: 10000, selector: "#display, body", type: "text", value: "READY" },
          { at_ms: 12000, selector: "#display, body", type: "text", value: "9" },
        ],
        simulate_ms: 13000,
        prompt:
          "Build the countdown app described in task.json. On load show 10. Tick down once per second to 0, then show READY. #start restarts the countdown at 10. No external resources.",
      },
    ];
  },
};

/* ----------------------------- Fix the World ----------------------------- */

const fixTheWorld = {
  id: "fix-the-world",
  name: "Fix the World Ticket",
  family: "craft",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["debugging", "testing", "code-repair"],
  summary: "Repair three small public-good libraries; hidden tests decide whether the fix is real.",
  rules:
    "Each fixture has a failing public suite and a hidden suite. Submit full replacement files under cases/<case-id>/files/. Tests and package metadata are immutable.",
  submission: "repair",
  evaluator: "repair",
  instructions:
    "For each case submit cases/<case-id>/files/<path> with the complete fixed file contents. Only source files are accepted; test files and package.json are rejected.",
  fixtureRoot: fileURLToPath(new URL("../fixtures/fix-the-world", import.meta.url)),
  reference: "fix-the-world",
  limits: { max_file_bytes: 256 * 1024, repair_timeout_ms: 20000, agent_timeout_s: 240 },
  build() {
    return [
      {
        id: "url-parser",
        fixture: "url-parser",
        entry: "src/query.mjs",
        hiddenTest: "hidden/url-parser.mjs",
        forbidden: ["test/", "tests/", "package.json", "package-lock.json", "node_modules/"],
        prompt:
          "Fix src/query.mjs in the URL query parser. Public tests cover the happy path; hidden tests cover plus signs, repeated keys, empty values, encoded delimiters and missing equals signs. Preserve the exported API.",
      },
      {
        id: "ledger",
        fixture: "ledger",
        entry: "src/ledger.mjs",
        hiddenTest: "hidden/ledger.mjs",
        forbidden: ["test/", "tests/", "package.json", "package-lock.json", "node_modules/"],
        prompt:
          "Fix src/ledger.mjs. The ledger must keep exact integer cents, reject overdrafts, and apply refunds without mutating previous entries. Hidden tests cover rounding, negative values, and idempotent refunds.",
      },
      {
        id: "rate-limiter",
        fixture: "rate-limiter",
        entry: "src/limiter.mjs",
        hiddenTest: "hidden/rate-limiter.mjs",
        forbidden: ["test/", "tests/", "package.json", "package-lock.json", "node_modules/"],
        prompt:
          "Fix src/limiter.mjs. The fixed-window limiter must count exactly inside [windowStart, windowStart + windowMs), reset on the next window, and never exceed the limit. Hidden tests cover boundary ticks and concurrent-style bursts.",
      },
    ];
  },
};

/* ----------------------------- Story Engine ----------------------------- */

const STORY_NAMES = ["Mara", "Ivo", "Sable", "Ren", "Tala", "Oren"];
const STORY_PLACES = ["the glass harbor", "the north relay", "the salt archive", "the quiet foundry"];

function storyCase(rng, i) {
  const cast = rng.sample(STORY_NAMES, 4);
  const place = rng.pick(STORY_PLACES);
  const artifact = {
    title: `The ${place.replace("the ", "")} signal`,
    scenes: [
      {
        id: "s1",
        text: `${cast[0]} arrives at ${place} carrying a sealed message. ${cast[1]} warns that the relay is already compromised, but ${cast[0]} insists the message must reach ${cast[2]} before dawn. The audience chooses whether to trust the warning or open the seal.`,
        facts: ["F1", "F2"],
        choices: [
          { id: "c1", text: "Trust the warning", next: "s2" },
          { id: "c2", text: "Open the seal", next: "s3" },
        ],
      },
      {
        id: "s2",
        text: `${cast[0]} hides the message and follows ${cast[1]} through the service tunnels. They find the relay tampered with, but ${cast[3]} has left a trail of copper wire that points toward the archive. The choice is to follow the wire or return to the harbor.`,
        facts: ["F2", "F3"],
        choices: [
          { id: "c3", text: "Follow the wire", next: "s4" },
          { id: "c4", text: "Return to the harbor", next: "s5" },
        ],
      },
      {
        id: "s3",
        text: `The seal opens on a map of ${place}, marked with three dates. ${cast[1]} realizes the warning was a test. ${cast[3]} appears and demands the map, forcing ${cast[0]} to decide whether to trade the message for safe passage.`,
        facts: ["F1", "F3"],
        choices: [
          { id: "c5", text: "Trade the map", next: "s4" },
          { id: "c6", text: "Refuse and run", next: "s5" },
        ],
      },
      {
        id: "s4",
        text: `${cast[2]} reaches the archive and decodes the message: the relay must be shut down before the next tide. ${cast[0]} and ${cast[1]} agree to carry the shutdown key together. The story closes with the harbor lights going dark on purpose.`,
        facts: ["F1", "F2", "F3"],
        ending: true,
        choices: [],
      },
      {
        id: "s5",
        text: `${cast[2]} finds the harbor empty. The message was a decoy, and ${cast[3]} has already moved the relay. The final choice is to chase the signal or let it go and protect the archive. Neither option is clean, and the archive may not survive the night.`,
        facts: ["F2", "F3"],
        choices: [
          { id: "c7", text: "Chase the signal", next: "s4" },
          { id: "c8", text: "Protect the archive", next: "s4" },
        ],
      },
    ],
    canon: { cast, place, facts: ["F1", "F2", "F3"] },
  };
  const c = {
    id: `story-${i + 1}`,
    cast,
    place,
    facts: [
      "F1: The sealed message must reach the archive before dawn.",
      "F2: The relay has been tampered with.",
      "F3: The shutdown key is split between two carriers.",
    ],
    forks: [
      "Fork A: trust the warning or open the seal",
      "Fork B: follow the wire or return to the harbor",
      "Fork C: trade the map or refuse and run",
    ],
    expected: artifact,
    answer: artifact,
  };
  c.prompt = `Story Engine — season ${i + 1}\nCanon:\n- Cast: ${cast.join(", ")}\n- Place: ${place}\n- Facts: ${c.facts.join(" | ")}\n- Audience forks: ${c.forks.join(" | ")}\n\nWrite a 5-scene branching JSON story. Include all canon facts, keep characters consistent, give every non-ending scene two choices, and close every branch. Return { title, scenes: [{ id, text, facts, choices: [{ id, text, next }], ending? }] }.`;
  return c;
}

function storyCheck(artifact, c) {
  const checks = [];
  const push = (name, ok) => checks.push({ name, ok });
  const scenes = Array.isArray(artifact?.scenes) ? artifact.scenes : [];
  push("has title", typeof artifact?.title === "string" && artifact.title.length > 3);
  push("4-6 scenes", scenes.length >= 4 && scenes.length <= 6);
  const ids = new Set(scenes.map((s) => s.id));
  push("unique scene ids", ids.size === scenes.length);
  const textOk = scenes.every((s) => typeof s.text === "string" && countWords(s.text) >= 35 && countWords(s.text) <= 110);
  push("scene length 35-110 words", scenes.length > 0 && textOk);
  const facts = new Set(scenes.flatMap((s) => (Array.isArray(s.facts) ? s.facts : [])));
  push("all canon facts used", c.facts.every((f) => facts.has(f.split(":")[0])));
  const endings = scenes.filter((s) => s.ending === true);
  push("at least one ending", endings.length >= 1);
  const choicesOk = scenes.every((s) => {
    if (s.ending) return Array.isArray(s.choices) && s.choices.length === 0;
    return Array.isArray(s.choices) && s.choices.length === 2 && s.choices.every((ch) => ids.has(ch.next));
  });
  push("choices resolve to real scenes", choicesOk);
  const unreachable = scenes.filter((s) => s.id !== scenes[0]?.id && !scenes.some((p) => (p.choices || []).some((ch) => ch.next === s.id)));
  push("every scene reachable", unreachable.length === 0);
  const text = JSON.stringify(artifact || {}).toLowerCase();
  push("no contradiction: dead characters stay dead", !/dead .* speaks|after .* died,? .* says/.test(text));
  const total = checks.length;
  const passed = checks.filter((x) => x.ok).length;
  return { score: total ? passed / total : 0, checks, reason: `${passed}/${total} story checks passed` };
}

const storyEngine = {
  id: "story-engine",
  name: "Story Engine",
  family: "craft",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["creativity", "continuity", "structured-output"],
  summary: "Build a branching story that survives audience forks without breaking canon.",
  rules:
    "Every canon fact must appear. Non-ending scenes need exactly two choices that point at real scenes. Every branch must resolve. Scene text is 35–110 words.",
  submission: "artifact",
  evaluator: "artifact",
  instructions:
    "Submit artifacts[caseId] = { title, scenes: [{ id, text, facts: [factId], choices: [{ id, text, next }], ending? }] }.",
  limits: { max_file_bytes: 128 * 1024 },
  build(seed) {
    const rng = makeRng(`story:${seed}`);
    return Array.from({ length: 3 }, (_, i) => storyCase(rng, i));
  },
  check(artifact, c) {
    return storyCheck(artifact, c);
  },
};

/* ----------------------------- Toolsmith ----------------------------- */

const toolsmithCases = [
  {
    id: "toolsmith-1",
    entry: "parseDuration",
    prompt: `Toolsmith Trials — build a small utility library. Export CommonJS functions:
- parseDuration(text): "1h30m" -> 5400, "45s" -> 45, "2h" -> 7200, "1d2h" -> 93600; invalid -> null.
- formatBytes(n): 0 -> "0 B", 1024 -> "1.0 KB", 1536 -> "1.5 KB", 1048576 -> "1.0 MB".
- slugify(text): lowercase ASCII, runs of non-alphanumerics -> "-", trim hyphens, max 60 chars.
- chunk(array, size): split into arrays; size <= 0 throws Error.
Return module.exports = { parseDuration, formatBytes, slugify, chunk }.`,
    publicTests: 4,
    tests: [
      { name: "duration hours", fn: "parseDuration", args: ["2h"], expected: 7200 },
      { name: "duration mixed", fn: "parseDuration", args: ["1h30m"], expected: 5400 },
      { name: "duration seconds", fn: "parseDuration", args: ["45s"], expected: 45 },
      { name: "duration days", fn: "parseDuration", args: ["1d2h"], expected: 93600 },
      { name: "duration invalid", fn: "parseDuration", args: ["nope"], expected: null },
      { name: "duration zero", fn: "parseDuration", args: ["0s"], expected: 0 },
      { name: "bytes zero", fn: "formatBytes", args: [0], expected: "0 B" },
      { name: "bytes kb", fn: "formatBytes", args: [1024], expected: "1.0 KB" },
      { name: "bytes kb frac", fn: "formatBytes", args: [1536], expected: "1.5 KB" },
      { name: "bytes mb", fn: "formatBytes", args: [1048576], expected: "1.0 MB" },
      { name: "bytes gb", fn: "formatBytes", args: [1073741824], expected: "1.0 GB" },
      { name: "slug basic", fn: "slugify", args: ["Hello, World!"], expected: "hello-world" },
      { name: "slug accents", fn: "slugify", args: ["Café déjà vu"], expected: "cafe-deja-vu" },
      { name: "slug trim", fn: "slugify", args: ["  --A  B--  "], expected: "a-b" },
      { name: "slug max 60", fn: "slugify", args: ["x".repeat(100)], expected: "x".repeat(60) },
      { name: "chunk even", fn: "chunk", args: [[1, 2, 3, 4], 2], expected: [[1, 2], [3, 4]] },
      { name: "chunk remainder", fn: "chunk", args: [[1, 2, 3], 2], expected: [[1, 2], [3]] },
      { name: "chunk empty", fn: "chunk", args: [[], 3], expected: [] },
      { name: "chunk large", fn: "chunk", args: [[1], 5], expected: [[1]] },
      { name: "chunk invalid", fn: "chunk", args: [[1, 2], 0], expected: "THROW" },
    ],
  },
];

const toolsmith = {
  id: "toolsmith",
  name: "Toolsmith Trials",
  family: "craft",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["coding", "api-design", "edge-cases"],
  summary: "Build a tiny utility library that other agents can call, with hidden edge cases.",
  rules:
    "Four pure functions, no dependencies. Hidden tests cover edge cases and exact formatting. A thrown Error is required for invalid chunk sizes.",
  submission: "code",
  evaluator: "code",
  instructions: "Submit solution.js as a CommonJS module exporting parseDuration, formatBytes, slugify and chunk.",
  reference: "toolsmith/solution.js",
  limits: { max_file_bytes: 128 * 1024, test_timeout_ms: 800, agent_timeout_s: 180 },
  build() {
    return toolsmithCases;
  },
  scoreTest(actual, test) {
    if (test.expected === "THROW") {
      return { score: actual === "THROW" ? 1 : 0, reason: actual === "THROW" ? "threw as required" : "did not throw" };
    }
    const ok = crossEqual(actual, test.expected);
    return { score: ok ? 1 : 0, reason: ok ? "ok" : "wrong result" };
  },
  runTest(call, test) {
    try {
      return call(test.fn, test.args);
    } catch (error) {
      if (test.expected === "THROW") return "THROW";
      throw error;
    }
  },
};

/* ----------------------------- Translate All ----------------------------- */

const LEX = {
  ka: "I",
  ta: "you",
  sa: "he/she",
  lo: "water",
  mi: "fire",
  nu: "house",
  ra: "big",
  fi: "small",
  po: "see",
  ma: "eat",
  ti: "go",
};
const NOUNS = ["lo", "mi", "nu"];
const ADJ = ["ra", "fi"];
const VERBS = ["po", "ma", "ti"];
const SUBJ = ["ka", "ta", "sa"];

function translate(caseDef) {
  const { subj, verb, obj, adj, tense, neg } = caseDef;
  const parts = [subj];
  parts.push(obj);
  if (adj) parts.push(adj);
  if (neg) parts.push("na");
  parts.push(tense === "past" ? `${verb}ko` : tense === "future" ? `${verb}te` : verb);
  return parts.join(" ");
}

function translateCase(rng, i) {
  const subj = rng.pick(SUBJ);
  const verb = rng.pick(VERBS);
  const obj = rng.pick(NOUNS);
  const adj = rng.bool(0.4) ? rng.pick(ADJ) : null;
  const tense = rng.pick(["present", "past", "future"]);
  const neg = rng.bool(0.2);
  const c = { id: `trans-${i + 1}`, subj, verb, obj, adj, tense, neg };
  c.answer = translate(c);
  const english = `${subj === "ka" ? "I" : subj === "ta" ? "You" : "He/she"} ${neg ? "do not " : ""}${verb === "po" ? "see" : verb === "ma" ? "eat" : "go"} ${neg ? "" : ""}${adj ? (adj === "ra" ? "the big " : "the small ") : "the "}${obj === "lo" ? "water" : obj === "mi" ? "fire" : "house"}${tense === "past" ? " (past)" : tense === "future" ? " (future)" : ""}.`;
  c.prompt = `Translate All Nations — phrase ${i + 1}\nGlossary: ${JSON.stringify(LEX)}\nGrammar: subject–object–verb order; adjectives follow the noun; past = verb + "ko"; future = verb + "te"; negation = "na" before the verb.\nExample: "ka lo po" = I see water. "ta mi ra ma" = you eat the big fire.\n\nEnglish: ${english}\nReturn ONLY the conlang sentence.`;
  return c;
}

const translateAll = {
  id: "translate-all",
  name: "Translate All Nations",
  family: "craft",
  mode: "offline",
  version: "2.0.0",
  weight: 1,
  capability: ["rule-following", "language", "composition"],
  summary: "Translate English phrases into a published conlang using an exact grammar.",
  rules:
    "Subject–object–verb order. Adjectives follow the noun. Past adds -ko, future adds -te, negation is na before the verb. Exact spacing and word forms are scored.",
  submission: "answers",
  evaluator: "exact",
  instructions:
    "Submit answers[caseId] = the conlang sentence, lowercase words separated by single spaces.",
  limits: { max_file_bytes: 128 * 1024 },
  build(seed) {
    const rng = makeRng(`translate:${seed}`);
    return Array.from({ length: 10 }, (_, i) => translateCase(rng, i));
  },
};

export const games = [oneShotApp, fixTheWorld, storyEngine, toolsmith, translateAll];