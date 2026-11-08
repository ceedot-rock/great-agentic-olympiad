/**
 * Tiny query-string parser.
 * Public contract:
 * - Accepts a leading "?".
 * - Percent-decodes keys and values, and turns "+" into a space.
 * - Repeated keys become an array of values in encounter order.
 * - A key without "=" maps to "".
 */
function decodePart(value) {
  return decodeURIComponent(String(value).replace(/\+/g, " "));
}

export function parseQuery(input) {
  const raw = String(input ?? "").replace(/^\?/, "");
  const out = {};
  if (!raw) return out;
  for (const part of raw.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const key = decodePart(eq < 0 ? part : part.slice(0, eq));
    const value = eq < 0 ? "" : decodePart(part.slice(eq + 1));
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      if (Array.isArray(out[key])) out[key].push(value);
      else out[key] = [out[key], value];
    } else {
      out[key] = value;
    }
  }
  return out;
}
