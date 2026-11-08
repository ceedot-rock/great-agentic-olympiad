import test from "node:test";
import assert from "node:assert/strict";
import { parseQuery } from "../src/query.mjs";

test("empty input", () => {
  assert.deepEqual(parseQuery(""), {});
});

test("simple pair", () => {
  assert.deepEqual(parseQuery("?a=1&b=2"), { a: "1", b: "2" });
});

test("key without equals", () => {
  assert.deepEqual(parseQuery("a"), { a: "" });
});
