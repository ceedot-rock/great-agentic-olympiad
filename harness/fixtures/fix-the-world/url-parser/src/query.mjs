/**
 * Tiny query-string parser.
 * Public contract:
 * - Accepts a leading "?".
 * - Percent-decodes keys and values, and turns "+" into a space.
 * - Repeated keys become an array of values in encounter order.
 * - A key without "=" maps to "".
 */
export function parseQuery(input) {
  const raw = String(input ?? "").replace(/^\?/, "");
  const out = {};
  if (!raw) return out;
  for (const part of raw.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const key = eq < 0 ? part : part.slice(0, eq);
    const value = eq < 0 ? "" : part.slice(eq + 1);
    out[key] = value;
  }
  return out;
}
