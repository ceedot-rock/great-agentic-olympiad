#!/usr/bin/env node
/**
 * Trusted repair evaluator worker.
 *
 * The submitted source is loaded inside a vm context with no process, fs,
 * require or network access. Hidden tests are trusted modules that call the
 * exported functions through a timeout-wrapped `call`. The verdict is printed
 * by this worker, so submitted source cannot forge it on stdout.
 *
 * Args: <workDir> <entryRel> <hiddenTestAbs> [loadTimeoutMs] [callTimeoutMs]
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { pathToFileURL } from "node:url";
import { crossEqual } from "./util.mjs";

const [workDir, entryRel, hiddenPath, loadTimeoutArg, callTimeoutArg] = process.argv.slice(2);
const loadTimeout = Number(loadTimeoutArg) || 1500;
const callTimeout = Number(callTimeoutArg) || 1000;

const DENY = [
  [/\bconstructor\b/, "constructor"],
  [/\b__proto__\b/, "__proto__"],
  [/\bprocess\b/, "process"],
  [/\brequire\s*\(/, "require"],
  [/\bimport\s*\(/, "dynamic import"],
  [/\bFunction\s*\(/, "Function"],
  [/\beval\s*\(/, "eval"],
  [/\bfetch\s*\(/, "fetch"],
  [/\bchild_process\b/, "child_process"],
  [/\bglobalThis\b/, "globalThis"],
];

function scan(source) {
  const found = DENY.filter(([re]) => re.test(source)).map(([, label]) => label);
  if (found.length) throw new Error(`blocked source constructs: ${[...new Set(found)].join(", ")}`);
}

function toCjs(source) {
  scan(source);
  if (/^\s*import\s+/m.test(source)) throw new Error("import statements are not supported in repair sources");
  const names = [];
  let out = source;
  out = out.replace(/export\s+default\s+/g, "module.exports = ");
  out = out.replace(/export\s+function\s+([A-Za-z_$][\w$]*)/g, (_, name) => {
    names.push(name);
    return `function ${name}`;
  });
  out = out.replace(/export\s+(const|let|var)\s+([A-Za-z_$][\w$]*)/g, (_, kind, name) => {
    names.push(name);
    return `${kind} ${name}`;
  });
  out = out.replace(/export\s*\{([^}]*)\}\s*;?/g, (_, body) => {
    for (const part of body.split(",")) {
      const bits = part.trim().split(/\s+as\s+/);
      if (bits[0]) names.push(bits[1] || bits[0]);
    }
    return "";
  });
  if (names.length && !/module\.exports/.test(source)) {
    out += `\nmodule.exports = { ${names.join(", ")} };\n`;
  }
  return out;
}

function makeAssert() {
  const label = (value) => {
    try {
      return JSON.stringify(value).slice(0, 300);
    } catch {
      return String(value);
    }
  };
  return {
    equal(actual, expected, message) {
      if (actual !== expected) throw new Error(message || `expected ${label(expected)}, got ${label(actual)}`);
    },
    deepEqual(actual, expected, message) {
      if (!crossEqual(actual, expected)) throw new Error(message || `expected ${label(expected)}, got ${label(actual)}`);
    },
    throws(fn, message) {
      try {
        fn();
      } catch {
        return;
      }
      throw new Error(message || "expected a thrown error");
    },
  };
}

async function main() {
  const entryPath = path.join(workDir, entryRel);
  if (!fs.existsSync(entryPath)) throw new Error(`source not found: ${entryRel}`);
  const source = fs.readFileSync(entryPath, "utf8");
  const cjs = toCjs(source);
  const module = { exports: {} };
  const logs = [];
  const context = vm.createContext(
    {
      module,
      exports: module.exports,
      console: {
        log: (...args) => logs.push(args.map(String).join(" ")),
        warn: (...args) => logs.push(args.map(String).join(" ")),
        error: (...args) => logs.push(args.map(String).join(" ")),
      },
      TextEncoder,
      TextDecoder,
      URL,
      URLSearchParams,
      Buffer,
    },
    { codeGeneration: { strings: false, wasm: false }, name: "gao-repair" }
  );
  new vm.Script(cjs, { filename: entryPath }).runInContext(context, { timeout: loadTimeout });
  const api = module.exports;

  const call = (name, args = [], receiver = null) => {
    const fn = receiver ? receiver?.[name] : typeof api === "function" ? api : api?.[name];
    if (typeof fn !== "function") throw new Error(`missing export "${name}"`);
    context.__gaoFn = fn;
    context.__gaoArgs = args;
    context.__gaoThis = receiver;
    context.__gaoResult = undefined;
    new vm.Script("__gaoResult = __gaoFn.apply(__gaoThis, __gaoArgs);", { filename: "gao-repair-test.js" }).runInContext(context, {
      timeout: callTimeout,
    });
    const result = context.__gaoResult;
    if (result && typeof result.then === "function") throw new Error("async exports are not supported");
    return result;
  };

  const hidden = await import(`${pathToFileURL(hiddenPath).href}?v=${Date.now()}`);
  if (typeof hidden.run !== "function") throw new Error("hidden test module has no run() export");
  const result = await hidden.run(call, makeAssert());
  const passed = Number(result?.passed);
  const total = Number(result?.total);
  if (!Number.isFinite(passed) || !Number.isFinite(total) || total <= 0) throw new Error("hidden test returned no verdict");
  return { passed, total, failures: Array.isArray(result.failures) ? result.failures.slice(0, 20) : [] };
}

main()
  .then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  })
  .catch((error) => {
    process.stdout.write(`${JSON.stringify({ passed: 0, total: 1, failures: [String(error.message || error)] })}\n`);
  });
