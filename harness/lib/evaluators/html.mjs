import vm from "node:vm";
import { countWords, round } from "../util.mjs";
import { caseResult, invalidSubmission, summarize } from "./common.mjs";

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const RAW = new Set(["script", "style", "textarea", "title"]);
let eventInvoker = (fn, thisArg, type) => fn.call(thisArg, { type, target: thisArg, currentTarget: thisArg, preventDefault() {}, stopPropagation() {} });

export function setEventInvoker(fn) {
  const previous = eventInvoker;
  eventInvoker = fn || ((innerFn, innerThis, innerType) => innerFn.call(innerThis, { type: innerType, target: innerThis, currentTarget: innerThis, preventDefault() {}, stopPropagation() {} }));
  return previous;
}

function decodeEntities(s) {
  return String(s)
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&");
}

function parseAttrs(raw) {
  const attrs = {};
  const re = /([^\s=/>]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  while ((m = re.exec(raw))) {
    const name = m[1].toLowerCase();
    if (!name || name === "/") continue;
    attrs[name] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? "");
  }
  return attrs;
}

class TextNode {
  constructor(text) {
    this.nodeType = 3;
    this.nodeName = "#text";
    this.parentNode = null;
    this._text = decodeEntities(text);
  }
  get textContent() {
    return this._text;
  }
  set textContent(v) {
    this._text = String(v);
  }
  get nodeValue() {
    return this._text;
  }
  set nodeValue(v) {
    this._text = String(v);
  }
}

class Element {
  constructor(tagName, doc) {
    this.nodeType = 1;
    this.tagName = String(tagName).toUpperCase();
    this.nodeName = this.tagName;
    this.ownerDocument = doc;
    this.parentNode = null;
    this.childNodes = [];
    this.attributes = {};
    this.style = {};
    this.dataset = {};
    this._listeners = new Map();
    this.value = "";
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
    this._classList = new Set();
  }
  get id() {
    return this.attributes.id || "";
  }
  set id(v) {
    this.setAttribute("id", v);
  }
  get className() {
    return [...this._classList].join(" ");
  }
  set className(v) {
    this._classList = new Set(String(v).split(/\s+/).filter(Boolean));
    this.attributes.class = this.className;
  }
  get classList() {
    const self = this;
    return {
      add: (...names) => names.forEach((n) => self._classList.add(String(n))),
      remove: (...names) => names.forEach((n) => self._classList.delete(String(n))),
      contains: (n) => self._classList.has(String(n)),
      toggle: (n) => {
        if (self._classList.has(String(n))) {
          self._classList.delete(String(n));
          return false;
        }
        self._classList.add(String(n));
        return true;
      },
      get length() {
        return self._classList.size;
      },
      toString: () => [...self._classList].join(" "),
    };
  }
  get children() {
    return this.childNodes.filter((n) => n.nodeType === 1);
  }
  get firstChild() {
    return this.childNodes[0] || null;
  }
  get lastChild() {
    return this.childNodes[this.childNodes.length - 1] || null;
  }
  get nextSibling() {
    if (!this.parentNode) return null;
    const i = this.parentNode.childNodes.indexOf(this);
    return this.parentNode.childNodes[i + 1] || null;
  }
  get textContent() {
    return this.childNodes.map((n) => n.textContent).join("");
  }
  set textContent(v) {
    for (const n of this.childNodes) n.parentNode = null;
    this.childNodes = [];
    if (v !== "") this.appendChild(new TextNode(String(v)));
  }
  get innerHTML() {
    return this.childNodes.map(serialize).join("");
  }
  set innerHTML(v) {
    for (const n of this.childNodes) n.parentNode = null;
    this.childNodes = [];
    const { root } = parseHtml(String(v));
    for (const child of [...root.childNodes]) this.appendChild(child);
  }
  get outerHTML() {
    return serialize(this);
  }
  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  }
  setAttribute(name, value) {
    const key = String(name).toLowerCase();
    this.attributes[key] = String(value);
    if (key === "class") this._classList = new Set(String(value).split(/\s+/).filter(Boolean));
    if (key.startsWith("data-")) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
  }
  removeAttribute(name) {
    delete this.attributes[String(name).toLowerCase()];
  }
  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, String(name).toLowerCase());
  }
  appendChild(node) {
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this;
    this.childNodes.push(node);
    return node;
  }
  append(...nodes) {
    nodes.forEach((n) => this.appendChild(typeof n === "string" ? new TextNode(n) : n));
  }
  prepend(...nodes) {
    nodes.reverse().forEach((n) => {
      const node = typeof n === "string" ? new TextNode(n) : n;
      if (node.parentNode) node.parentNode.removeChild(node);
      node.parentNode = this;
      this.childNodes.unshift(node);
    });
  }
  removeChild(node) {
    const i = this.childNodes.indexOf(node);
    if (i >= 0) {
      this.childNodes.splice(i, 1);
      node.parentNode = null;
    }
    return node;
  }
  replaceChildren(...nodes) {
    this.textContent = "";
    nodes.forEach((n) => this.appendChild(typeof n === "string" ? new TextNode(n) : n));
  }
  insertBefore(node, ref) {
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this;
    if (i < 0) this.childNodes.push(node);
    else this.childNodes.splice(i, 0, node);
    return node;
  }
  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }
  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push(fn);
  }
  removeEventListener(type, fn) {
    const list = this._listeners.get(type) || [];
    this._listeners.set(type, list.filter((x) => x !== fn));
  }
  dispatchEvent(event) {
    const ev = { target: this, currentTarget: this, preventDefault() {}, stopPropagation() {}, ...event };
    for (const fn of this._listeners.get(ev.type) || []) eventInvoker(fn, this, ev.type);
    if (this.parentNode && ev.type !== "click") this.parentNode.dispatchEvent(ev);
    return true;
  }
  click() {
    this.dispatchEvent({ type: "click" });
  }
  focus() {}
  blur() {}
  scrollIntoView() {}
  getBoundingClientRect() {
    return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }
  querySelector(sel) {
    return querySelectorAll(this, sel)[0] || null;
  }
  querySelectorAll(sel) {
    return querySelectorAll(this, sel);
  }
  matches(sel) {
    return matchesSimple(this, sel);
  }
  closest(sel) {
    let node = this;
    while (node) {
      if (node.nodeType === 1 && matchesSimple(node, sel)) return node;
      node = node.parentNode;
    }
    return null;
  }
}

function serialize(node) {
  if (node.nodeType === 3) return node.textContent;
  if (node.nodeType === 8) return `<!--${node.textContent}-->`;
  const attrs = Object.entries(node.attributes)
    .map(([k, v]) => (v === "" ? ` ${k}` : ` ${k}="${String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`))
    .join("");
  const tag = node.tagName.toLowerCase();
  if (VOID.has(tag)) return `<${tag}${attrs}>`;
  return `<${tag}${attrs}>${node.childNodes.map(serialize).join("")}</${tag}>`;
}

function parseHtml(html) {
  const root = new Element("#document-fragment", null);
  const stack = [root];
  const scripts = [];
  let i = 0;
  const text = String(html);
  while (i < text.length) {
    const lt = text.indexOf("<", i);
    if (lt < 0) {
      appendText(stack[stack.length - 1], text.slice(i));
      break;
    }
    if (lt > i) appendText(stack[stack.length - 1], text.slice(i, lt));
    if (text.startsWith("<!--", lt)) {
      const end = text.indexOf("-->", lt + 4);
      const node = { nodeType: 8, nodeName: "#comment", textContent: text.slice(lt + 4, end < 0 ? text.length : end), parentNode: null };
      stack[stack.length - 1].childNodes.push(node);
      node.parentNode = stack[stack.length - 1];
      i = end < 0 ? text.length : end + 3;
      continue;
    }
    if (text.startsWith("<!", lt) || text.startsWith("<?", lt)) {
      const end = text.indexOf(">", lt);
      i = end < 0 ? text.length : end + 1;
      continue;
    }
    const end = text.indexOf(">", lt);
    if (end < 0) {
      appendText(stack[stack.length - 1], text.slice(lt));
      break;
    }
    const raw = text.slice(lt + 1, end).trim();
    if (raw.startsWith("/")) {
      const name = raw.slice(1).trim().toLowerCase();
      for (let s = stack.length - 1; s > 0; s--) {
        if (stack[s].tagName.toLowerCase() === name) {
          stack.length = s;
          break;
        }
      }
      i = end + 1;
      continue;
    }
    const selfClose = raw.endsWith("/");
    const nameMatch = raw.match(/^([^\s/>]+)/);
    const name = (nameMatch?.[1] || "").toLowerCase();
    if (!name) {
      i = end + 1;
      continue;
    }
    const attrs = parseAttrs(raw.slice(name.length).replace(/\/$/, ""));
    const el = new Element(name, root);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    stack[stack.length - 1].appendChild(el);
    if (RAW.has(name)) {
      const close = text.toLowerCase().indexOf(`</${name}`, end + 1);
      const contentEnd = close < 0 ? text.length : close;
      const content = text.slice(end + 1, contentEnd);
      if (name === "script") scripts.push({ attrs, code: content });
      else el.textContent = content;
      if (close < 0) {
        i = text.length;
      } else {
        const closeEnd = text.indexOf(">", close);
        i = closeEnd < 0 ? text.length : closeEnd + 1;
      }
      continue;
    }
    if (!VOID.has(name) && !selfClose) stack.push(el);
    i = end + 1;
  }
  return { root, scripts };
}

function appendText(parent, text) {
  if (!text) return;
  const node = new TextNode(text);
  node.parentNode = parent;
  parent.childNodes.push(node);
}

function simpleParts(sel) {
  const m = String(sel).trim().match(/^([a-zA-Z0-9_-]*)(#[a-zA-Z0-9_-]+)?((?:\.[a-zA-Z0-9_-]+)*)((?:\[[^\]]+\])*)$/);
  if (!m) return null;
  const classes = (m[3] || "").split(".").filter(Boolean);
  const attrs = [...String(m[4] || "").matchAll(/\[([^\]=]+)(?:=([^\]]+))?\]/g)].map((x) => ({
    name: x[1],
    value: x[2],
  }));
  return { tag: m[1]?.toLowerCase() || "", id: m[2]?.slice(1) || "", classes, attrs };
}

function matchesSimple(el, sel) {
  if (!el || el.nodeType !== 1) return false;
  const parts = simpleParts(sel);
  if (!parts) return false;
  if (parts.tag && parts.tag !== "*" && el.tagName.toLowerCase() !== parts.tag) return false;
  if (parts.id && el.id !== parts.id) return false;
  for (const c of parts.classes) if (!el.classList.contains(c)) return false;
  for (const a of parts.attrs) {
    const v = el.getAttribute(a.name);
    if (v == null) return false;
    if (a.value != null && v !== a.value.replace(/^["']|["']$/g, "")) return false;
  }
  return true;
}

function querySelectorAll(root, selector) {
  const groups = String(selector).split(",").map((s) => s.trim()).filter(Boolean);
  const out = [];
  const walk = (node) => {
    for (const child of node.childNodes || []) {
      if (child.nodeType === 1) {
        if (groups.some((g) => matchesComplex(child, g))) out.push(child);
        walk(child);
      }
    }
  };
  walk(root);
  return out;
}

function matchesComplex(el, selector) {
  const tokens = selector.split(/\s+/).filter(Boolean);
  if (tokens.length === 1) return matchesSimple(el, tokens[0]);
  let node = el;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (!node || !matchesSimple(node, tokens[i])) return false;
    if (i > 0) {
      node = node.parentNode;
      while (node && node.nodeType === 1 && !matchesSimple(node, tokens[i - 1])) node = node.parentNode;
      if (!node || node.nodeType !== 1) return false;
    }
  }
  return true;
}

function makeDocument(root, scripts) {
  const doc = {
    nodeType: 9,
    nodeName: "#document",
    readyState: "loading",
    _listeners: new Map(),
    title: "",
    documentElement: null,
    head: null,
    body: null,
    createElement: (tag) => new Element(tag, doc),
    createTextNode: (text) => new TextNode(text),
    createDocumentFragment: () => new Element("#document-fragment", doc),
    getElementById: (id) => querySelectorAll(doc, `#${id}`)[0] || null,
    querySelector: (sel) => querySelectorAll(doc, sel)[0] || null,
    querySelectorAll: (sel) => querySelectorAll(doc, sel),
    addEventListener: (type, fn) => {
      if (!doc._listeners.has(type)) doc._listeners.set(type, []);
      doc._listeners.get(type).push(fn);
    },
    removeEventListener: (type, fn) => {
      doc._listeners.set(type, (doc._listeners.get(type) || []).filter((x) => x !== fn));
    },
    dispatchEvent: (event) => {
      const ev = { target: doc, currentTarget: doc, preventDefault() {}, ...event };
      for (const fn of doc._listeners.get(ev.type) || []) eventInvoker(fn, doc, ev.type);
      return true;
    },
  };
  const html = root.childNodes.find((n) => n.nodeType === 1 && n.tagName === "HTML");
  doc.childNodes = root.childNodes;
  doc.documentElement = html || root;
  doc.head = querySelectorAll(doc, "head")[0] || new Element("head", doc);
  doc.body = querySelectorAll(doc, "body")[0] || new Element("body", doc);
  if (!doc.head.parentNode) doc.documentElement.appendChild(doc.head);
  if (!doc.body.parentNode) doc.documentElement.appendChild(doc.body);
  const title = querySelectorAll(doc, "title")[0];
  doc.title = title ? title.textContent : "";
  return doc;
}

function createTimers() {
  let nextId = 1;
  let now = 0;
  let invoke = (fn, args) => fn(...args);
  const timers = new Map();
  const errors = [];
  const add = (fn, delay, interval, args) => {
    const id = nextId++;
    timers.set(id, { id, fn, due: now + Math.max(0, Number(delay) || 0), interval, args });
    return id;
  };
  const clear = (id) => timers.delete(id);
  const runUntil = (target) => {
    let guard = 0;
    while (guard++ < 20000) {
      let due = null;
      for (const t of timers.values()) {
        if (t.due <= target && (!due || t.due < due.due || (t.due === due.due && t.id < due.id))) due = t;
      }
      if (!due) break;
      now = due.due;
      if (due.interval != null) due.due = now + Math.max(1, Number(due.interval) || 1);
      else timers.delete(due.id);
      try {
        invoke(due.fn, due.args || []);
      } catch (error) {
        errors.push(String(error.message || error));
        timers.clear();
        break;
      }
    }
    now = Math.max(now, target);
  };
  return {
    add,
    clear,
    runUntil,
    now: () => now,
    errors: () => errors.slice(),
    setInvoker: (fn) => {
      invoke = fn;
    },
  };
}

function evaluateChecks(doc, checks, timers) {
  const results = [];
  for (const check of checks || []) {
    let ok = false;
    let reason = "";
    if (check.type === "exists") {
      const el = check.selector ? doc.querySelector(check.selector) : doc.body;
      ok = Boolean(el);
      reason = `selector ${check.selector} ${ok ? "exists" : "missing"}`;
    } else if (check.type === "text") {
      const el = check.selector ? doc.querySelector(check.selector) : doc.body;
      const text = el ? el.textContent.replace(/\s+/g, " ").trim() : "";
      ok = text.toLowerCase().includes(String(check.value).toLowerCase());
      reason = `text ${JSON.stringify(text.slice(0, 120))} ${ok ? "includes" : "does not include"} ${JSON.stringify(check.value)}`;
    } else if (check.type === "regex") {
      const el = check.selector ? doc.querySelector(check.selector) : doc.body;
      const text = el ? el.textContent : "";
      try {
        ok = new RegExp(check.pattern, check.flags || "i").test(text);
      } catch {
        ok = false;
      }
      reason = `text ${ok ? "matches" : "does not match"} /${check.pattern}/`;
    } else if (check.type === "count") {
      const els = check.selector ? doc.querySelectorAll(check.selector) : [];
      ok = els.length >= (check.min ?? 1) && els.length <= (check.max ?? Infinity);
      reason = `${els.length} elements for ${check.selector}`;
    } else if (check.type === "value") {
      const el = check.selector ? doc.querySelector(check.selector) : null;
      ok = Boolean(el) && String(el.value) === String(check.value);
      reason = `value ${JSON.stringify(el?.value)} expected ${JSON.stringify(check.value)}`;
    } else if (check.type === "class") {
      const el = check.selector ? doc.querySelector(check.selector) : null;
      ok = Boolean(el) && el.classList.contains(check.value);
      reason = `class ${check.value} ${ok ? "present" : "missing"}`;
    } else if (check.type === "words") {
      const el = check.selector ? doc.querySelector(check.selector) : doc.body;
      const n = countWords(el?.textContent);
      ok = n >= (check.min ?? 0) && n <= (check.max ?? Infinity);
      reason = `${n} words`;
    } else if (check.type === "noExternal") {
      const html = doc.documentElement.outerHTML;
      ok = !/(?:src|href)\s*=\s*["']https?:\/\//i.test(html);
      reason = ok ? "no external resources" : "external resource reference found";
    } else {
      reason = `unknown check type ${check.type}`;
    }
    results.push({ ...check, ok, reason });
  }
  return results;
}

export function evaluateHtml(game, cases, sub, ctx = {}) {
  if (!sub.html) return invalidSubmission(sub, "html");
  const html = sub.html;
  const detail = [];
  for (const c of cases) {
    const hard = [];
    if (html.length > (game.limits?.max_file_bytes ?? 50 * 1024)) hard.push("over size limit");
    if (!/<html[\s>]/i.test(html) && !/<!doctype html>/i.test(html)) hard.push("missing html document");
    if (/<(script|link|img|iframe)[^>]+(?:src|href)\s*=\s*["']https?:/i.test(html)) hard.push("external resource reference");
    if (hard.length) {
      detail.push(caseResult(c.id, 0, hard.join("; "), { kind: "html" }));
      continue;
    }

    const { root, scripts } = parseHtml(html);
    const doc = makeDocument(root, scripts);
    const timers = createTimers();
    const logs = [];
    const storage = () => {
      const map = new Map();
      return {
        getItem: (k) => (map.has(String(k)) ? map.get(String(k)) : null),
        setItem: (k, v) => map.set(String(k), String(v)),
        removeItem: (k) => map.delete(String(k)),
        clear: () => map.clear(),
        key: (i) => [...map.keys()][i] ?? null,
        get length() {
          return map.size;
        },
      };
    };
    const windowObj = {
      document: doc,
      innerWidth: 1280,
      innerHeight: 720,
      devicePixelRatio: 1,
      location: { href: "file:///app.html", search: "", hash: "" },
      navigator: { userAgent: "gao-headless", language: "en" },
      localStorage: storage(),
      sessionStorage: storage(),
      setTimeout: (fn, delay, ...args) => timers.add(fn, delay, null, args),
      clearTimeout: (id) => timers.clear(id),
      setInterval: (fn, delay, ...args) => timers.add(fn, delay, delay, args),
      clearInterval: (id) => timers.clear(id),
      requestAnimationFrame: (fn) => timers.add(() => fn(timers.now()), 16, null, []),
      cancelAnimationFrame: (id) => timers.clear(id),
      performance: { now: () => timers.now() },
      matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
      getComputedStyle: (el) => el?.style || {},
      alert: () => {},
      confirm: () => true,
      prompt: () => "",
      console: {
        log: (...a) => logs.push(a.map(String).join(" ")),
        warn: (...a) => logs.push(a.map(String).join(" ")),
        error: (...a) => logs.push(a.map(String).join(" ")),
      },
      addEventListener: (type, fn) => doc.addEventListener(type, fn),
      removeEventListener: (type, fn) => doc.removeEventListener(type, fn),
      dispatchEvent: (e) => doc.dispatchEvent(e),
    };
    windowObj.window = windowObj;
    windowObj.self = windowObj;
    windowObj.top = windowObj;
    windowObj.parent = windowObj;
    windowObj.globalThis = windowObj;
    windowObj.Date = class extends Date {
      constructor(...args) {
        super(...(args.length ? args : [Date.now()]));
      }
      static now() {
        return 1700000000000 + timers.now();
      }
    };
    const context = vm.createContext(windowObj, { codeGeneration: { strings: false, wasm: false } });
    const timerTimeout = Number(game.limits?.timer_timeout_ms) || 500;
    timers.setInvoker((fn, args) => {
      context.__gaoFn = fn;
      context.__gaoTimerArgs = args;
      new vm.Script(
        `var __gaoTimerJson = JSON.stringify(__gaoTimerArgs || []);
         __gaoFn.apply(null, JSON.parse(__gaoTimerJson));`,
        { filename: "app-timer.js" }
      ).runInContext(context, { timeout: timerTimeout });
    });
    setEventInvoker((fn, thisArg, type) => {
      context.__gaoFn = fn;
      context.__gaoThis = thisArg;
      context.__gaoEventType = type;
      new vm.Script(
        `(function () {
           var ev = { type: __gaoEventType, target: __gaoThis, currentTarget: __gaoThis, preventDefault: function () {}, stopPropagation: function () {} };
           __gaoFn.call(__gaoThis, ev);
         }).call(this);`,
        { filename: "app-event.js" }
      ).runInContext(context, { timeout: timerTimeout });
    });
    for (const script of scripts) {
      if (script.attrs.src) continue;
      if (script.attrs.type && !["text/javascript", "application/javascript", "module"].includes(script.attrs.type)) continue;
      try {
        const code = script.attrs.type === "module" ? script.code.replace(/^\s*export\s+default\s+/m, "") : script.code;
        if (/\b(constructor|__proto__|process|require|globalThis|child_process|defineProperty|defineGetter|defineSetter)\b/.test(code)) {
          logs.push("script blocked: host escape construct");
          continue;
        }
        new vm.Script(code, { filename: "app-inline.js" }).runInContext(context, { timeout: 1000 });
      } catch (error) {
        logs.push(`script error: ${error.message}`);
      }
    }
    try {
      doc.readyState = "interactive";
      doc.dispatchEvent({ type: "DOMContentLoaded" });
      if (typeof windowObj.onDOMContentLoaded === "function") eventInvoker(windowObj.onDOMContentLoaded, windowObj, "DOMContentLoaded");
      doc.readyState = "complete";
      doc.dispatchEvent({ type: "load" });
      windowObj.dispatchEvent({ type: "load" });
      if (typeof windowObj.onload === "function") eventInvoker(windowObj.onload, windowObj, "load");
    } catch (error) {
      logs.push(`load error: ${error.message}`);
    }

    const timeline = [];
    for (const a of c.actions || []) timeline.push({ at: Number(a.at_ms) || 0, type: "action", data: a });
    for (const ch of c.runtime || []) timeline.push({ at: Number(ch.at_ms) || 0, type: "check", data: ch });
    timeline.sort((a, b) => a.at - b.at || (a.type === "action" ? -1 : 1));

    const results = [];
    for (const item of timeline) {
      timers.runUntil(item.at);
      if (item.type === "action") {
        const el = doc.querySelector(item.data.selector);
        if (!el) {
          results.push({ ...item.data, ok: false, reason: `action selector ${item.data.selector} missing` });
          continue;
        }
        try {
          if (item.data.event === "input" || item.data.event === "change") {
            el.value = String(item.data.value ?? "");
            el.dispatchEvent({ type: item.data.event });
          } else {
            el.click();
          }
        } catch (error) {
          results.push({ ...item.data, ok: false, reason: `action error: ${String(error.message || error)}` });
        }

      } else {
        results.push(...evaluateChecks(doc, [item.data], timers));
      }
    }
    timers.runUntil(Number(c.simulate_ms) || 12000);
    for (const ch of c.final || []) results.push(...evaluateChecks(doc, [ch], timers));

    const staticResults = (c.static || []).map((ch) => {
      if (ch.type === "text") {
        const ok = html.toLowerCase().includes(String(ch.value).toLowerCase());
        return { ...ch, ok, reason: `static text ${ok ? "present" : "missing"}` };
      }
      if (ch.type === "regex") {
        let ok = false;
        try {
          ok = new RegExp(ch.pattern, ch.flags || "i").test(html);
        } catch {
          ok = false;
        }
        return { ...ch, ok, reason: `static regex ${ok ? "matched" : "missing"}` };
      }
      return { ...ch, ok: true, reason: "static" };
    });
    setEventInvoker(null);
    const all = [...staticResults, ...results];
    const passed = all.filter((r) => r.ok).length;
    const score = all.length ? passed / all.length : 0;
    detail.push(
      caseResult(c.id, score, `${passed}/${all.length} app checks passed`, {
        kind: "html",
        checks: all,
        logs: logs.slice(0, 20),
        timer_errors: timers.errors(),
      })
    );
  }
  const summary = summarize(game, detail);
  summary.stats = {
    passed: detail.filter((c) => c.passed).length,
    total: cases.length,
    invalid: 0,
    evaluator: "html",
    check_rate: round(summary.score),
  };
  summary.warnings = sub.warnings || [];
  summary.errors = sub.errors || [];
  return summary;
}

export { parseHtml, makeDocument, serialize, querySelectorAll };
