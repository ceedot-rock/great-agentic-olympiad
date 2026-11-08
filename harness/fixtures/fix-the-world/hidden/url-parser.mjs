export function run(call, assert) {
  const results = [];
  const test = (name, fn) => {
    try {
      fn();
      results.push({ name, ok: true });
    } catch (error) {
      results.push({ name, ok: false, error: String(error.message || error) });
    }
  };
  const eq = (actual, expected) => assert.deepEqual(actual, expected);

  test("plus to space", () => eq(call("parseQuery", ["a=hello+world"]), { a: "hello world" }));
  test("percent decoding", () => eq(call("parseQuery", ["a=%E2%9C%93"]), { a: "✓" }));
  test("encoded delimiters", () => eq(call("parseQuery", ["a=%26%3D"]), { a: "&=" }));
  test("encoded plus", () => eq(call("parseQuery", ["a=%2B"]), { a: "+" }));
  test("repeated key array", () => eq(call("parseQuery", ["a=1&a=2"]), { a: ["1", "2"] }));
  test("repeated key three", () => eq(call("parseQuery", ["a=1&a=2&a=3"]), { a: ["1", "2", "3"] }));
  test("mixed repeated", () => eq(call("parseQuery", ["a=1&a=2&b=3"]), { a: ["1", "2"], b: "3" }));
  test("repeated both", () => eq(call("parseQuery", ["a=1&a=2&b=3&b=4"]), { a: ["1", "2"], b: ["3", "4"] }));
  test("empty value", () => eq(call("parseQuery", ["a="]), { a: "" }));
  test("missing equals", () => eq(call("parseQuery", ["a&b"]), { a: "", b: "" }));
  test("double ampersand", () => eq(call("parseQuery", ["a=1&&b=2"]), { a: "1", b: "2" }));
  test("plus in key", () => eq(call("parseQuery", ["a+b=c+d"]), { "a b": "c d" }));
  test("empty query", () => eq(call("parseQuery", ["?"]), {}));
  test("no query", () => eq(call("parseQuery", [""]), {}));

  const passed = results.filter((r) => r.ok).length;
  return { passed, total: results.length, failures: results.filter((r) => !r.ok) };
}
