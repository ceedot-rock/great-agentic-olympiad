import vm from "node:vm";
import { crossEqual, round } from "../util.mjs";
import { caseResult, invalidSubmission, summarize } from "./common.mjs";

const DENY = [
  [/\brequire\s*\(/, "require()"],
  [/\bimport\s*\(/, "dynamic import()"],
  [/\bprocess\b/, "process"],
  [/\bglobalThis\b/, "globalThis"],
  [/\bFunction\s*\(/, "Function constructor"],
  [/\beval\s*\(/, "eval"],
  [/\bfetch\s*\(/, "fetch"],
  [/\bXMLHttpRequest\b/, "XMLHttpRequest"],
  [/\bchild_process\b/, "child_process"],
  [/\bDeno\b/, "Deno"],
  [/\bBun\b/, "Bun"],
  [/\bWebAssembly\b/, "WebAssembly"],
  [/\bSharedArrayBuffer\b/, "SharedArrayBuffer"],
  [/\bAtomics\b/, "Atomics"],
  [/\bWorker\b/, "Worker"],
  [/\bimportScripts\b/, "importScripts"],
  [/\bmodule\.require\b/, "module.require"],
  [/\bconstructor\b/, "constructor"],
  [/\b__proto__\b/, "__proto__"],
  [/\bdefineProperty\b/, "defineProperty"],
  [/\bdefineGetter\b/, "defineGetter"],
  [/\bdefineSetter\b/, "defineSetter"],
];

export function scanSource(source) {
  const findings = [];
  for (const [re, label] of DENY) {
    if (re.test(source)) findings.push(label);
  }
  return [...new Set(findings)];
}

function makeContext(game, source) {
  const context = vm.createContext(
    {},
    {
      codeGeneration: { strings: false, wasm: false },
      name: `gao-${game.id}`,
    }
  );
  // Create the module surface inside the context so submitted code never gets
  // a host object (which would expose the host Function constructor).
  new vm.Script(
    `var module = { exports: {} };
     var exports = module.exports;
     var console = { log: function(){}, warn: function(){}, error: function(){} };
     var __gaoNewState = function(){ return { items: [], next: 1 }; };`,
    { filename: "gao-bootstrap.js" }
  ).runInContext(context, { timeout: 200 });
  const newState = context.__gaoNewState;
  const load = new vm.Script(source, { filename: `${game.id}-solution.js` });
  load.runInContext(context, { timeout: Number(game.limits?.load_timeout_ms) || 1500 });
  return { context, module: context.module, newState, logs: [] };
}

/**
 * Resolve an export inside the timeout-bounded context. Reading a vm object's
 * property from the host could invoke a user-defined getter on the host thread.
 */
export function resolveExport(context, name, timeout = 200) {
  context.__gaoName = name;
  context.__gaoFn = null;
  new vm.Script(
    `(function () {
       var target = (typeof module !== "undefined") ? module.exports : null;
       var fn = null;
       if (target) {
         if (typeof target === "function" && (__gaoName === "default" || !__gaoName)) fn = target;
         else if (typeof target[__gaoName] === "function") fn = target[__gaoName];
         else if (target.default && typeof target.default === "function") fn = target.default;
       }
       if (!fn && typeof this[__gaoName] === "function") fn = this[__gaoName];
       __gaoFn = fn;
     }).call(this);`,
    { filename: "gao-resolve-export.js" }
  ).runInContext(context, { timeout });
  return context.__gaoFn || null;
}

function runRaw(context, fn, timeout) {
  context.__gaoFn = fn;
  context.__gaoResult = undefined;
  new vm.Script("__gaoResult = __gaoFn();", { filename: "gao-test-raw.js" }).runInContext(context, { timeout });
  return context.__gaoResult;
}

/**
 * Call a submitted function with JSON-cloned arguments. The result is
 * serialized *inside* the timeout-bounded script, so getters/toJSON cannot
 * escape the per-call deadline and run on the host thread.
 */
export function callInContext(context, fn, args, timeout, refs = []) {
  context.__gaoFn = fn;
  context.__gaoArgsJson = JSON.stringify(args ?? []);
  context.__gaoRefs = refs;
  context.__gaoThis = null;
  context.__gaoResultJson = undefined;
  context.__gaoIsAsync = false;
  const script = new vm.Script(
    `var __gaoParsed = JSON.parse(__gaoArgsJson).map(function (arg) {
       return arg && typeof arg === "object" && typeof arg.__gaoRef === "number" ? __gaoRefs[arg.__gaoRef] : arg;
     });
     var __gaoOut = __gaoFn.apply(__gaoThis, __gaoParsed);
     __gaoIsAsync = !!__gaoOut && typeof __gaoOut.then === "function";
     __gaoResultJson = __gaoOut === undefined ? undefined : JSON.stringify(__gaoOut);`,
    { filename: "gao-test-call.js" }
  );
  script.runInContext(context, { timeout });
  if (context.__gaoIsAsync) {
    throw new Error("async functions are not supported in code tasks; return a value synchronously");
  }
  const json = context.__gaoResultJson;
  return json === undefined ? undefined : JSON.parse(json);
}

function compare(actual, expected, test) {
  if (typeof expected === "number" && typeof actual === "number" && Number.isFinite(test.tolerance)) {
    return Math.abs(actual - expected) <= test.tolerance;
  }
  return crossEqual(actual, expected);
}

function runOneTest({ context, module, newState, game, test, caseDef }) {
  const timeout = Number(test.timeout_ms) || Number(game.limits?.test_timeout_ms) || 1000;
  const call = (name, args = [], refs = []) => {
    const fn = resolveExport(context, name, timeout);
    if (!fn) throw new Error(`missing export "${name}"`);
    return callInContext(context, fn, args, timeout, refs);
  };
  call.newState = () => runRaw(context, newState, timeout);
  if (typeof game.runTest === "function") {
    const result = game.runTest(call, test, caseDef);
    if (typeof game.scoreTest === "function") {
      return { ...game.scoreTest(result, test, caseDef), actual: result };
    }
    return { score: compare(result, test.expected, test) ? 1 : 0, reason: "custom test", actual: result };
  }
  const name = test.fn || caseDef.entry || game.entry || "solve";
  const actual = call(name, test.args || []);
  if (typeof game.scoreTest === "function") {
    return { ...game.scoreTest(actual, test, caseDef), actual };
  }
  const ok = compare(actual, test.expected, test);
  return {
    score: ok ? 1 : 0,
    reason: ok ? "ok" : `expected ${JSON.stringify(test.expected)?.slice(0, 200)}, got ${JSON.stringify(actual)?.slice(0, 200)}`,
    actual,
  };
}

export function evaluateCode(game, cases, sub, ctx = {}) {
  if (!sub.source) return invalidSubmission(sub, "code");
  const findings = scanSource(sub.source);
  if (findings.length) {
    return {
      score: 0,
      cases: [],
      stats: { passed: 0, total: 0, invalid: 1, evaluator: "code" },
      warnings: sub.warnings || [],
      errors: [`blocked source constructs: ${findings.join(", ")}`],
    };
  }

  const detail = [];
  for (const c of cases) {
    let loaded;
    try {
      loaded = makeContext(game, sub.source);
    } catch (error) {
      detail.push(caseResult(c.id, 0, `module failed to load: ${error.message}`, { kind: "code" }));
      continue;
    }
    const tests = c.tests || [];
    const results = [];
    for (const test of tests) {
      try {
        const verdict = runOneTest({ context: loaded.context, module: loaded.module, newState: loaded.newState, game, test, caseDef: c });
        results.push({
          name: test.name,
          score: Math.max(0, Math.min(1, Number(verdict.score) || 0)),
          reason: verdict.reason,
        });
      } catch (error) {
        results.push({ name: test.name, score: 0, reason: String(error.message).slice(0, 200) });
      }
    }
    const passed = results.filter((r) => r.score >= 1).length;
    const score = results.length ? results.reduce((s, r) => s + r.score, 0) / results.length : 0;
    detail.push(
      caseResult(c.id, score, `${passed}/${results.length} tests passed`, {
        kind: "code",
        tests: results,
        logs: loaded.logs.slice(0, 20),
      })
    );
  }
  const summary = summarize(game, detail);
  summary.stats = {
    passed: detail.filter((c) => c.passed).length,
    total: cases.length,
    invalid: 0,
    evaluator: "code",
    test_pass_rate: round(
      detail.reduce((s, c) => s + (c.tests?.filter((t) => t.score >= 1).length || 0), 0) /
        Math.max(1, detail.reduce((s, c) => s + (c.tests?.length || 0), 0))
    ),
  };
  summary.warnings = sub.warnings || [];
  summary.errors = sub.errors || [];
  return summary;
}

export { makeContext, runRaw };
