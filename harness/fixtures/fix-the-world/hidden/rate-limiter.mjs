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
  const throws = (fn) => assert.throws(fn);

  test("window starts at first call", () => {
    const l = call("createLimiter", [{ limit: 2, windowMs: 1000 }]);
    eq(call("allow", [5000], l), true);
    eq(call("allow", [5500], l), true);
    eq(call("allow", [5999], l), false);
    eq(call("allow", [6000], l), true);
  });

  test("exact boundary", () => {
    const l = call("createLimiter", [{ limit: 1, windowMs: 100 }]);
    eq(call("allow", [0], l), true);
    eq(call("allow", [99], l), false);
    eq(call("allow", [100], l), true);
  });

  test("denied calls do not consume", () => {
    const l = call("createLimiter", [{ limit: 2, windowMs: 1000 }]);
    eq(call("allow", [0], l), true);
    eq(call("allow", [1], l), true);
    eq(call("allow", [2], l), false);
    eq(call("allow", [3], l), false);
    eq(call("remaining", [4], l), 0);
    eq(call("allow", [1000], l), true);
    eq(call("remaining", [1000], l), 1);
  });

  test("remaining never negative", () => {
    const l = call("createLimiter", [{ limit: 1, windowMs: 1000 }]);
    call("allow", [0], l);
    call("allow", [1], l);
    call("allow", [2], l);
    eq(call("remaining", [2], l), 0);
  });

  test("resetAt", () => {
    const l = call("createLimiter", [{ limit: 1, windowMs: 1000 }]);
    eq(call("resetAt", [0], l), null);
    call("allow", [250], l);
    eq(call("resetAt", [250], l), 1250);
    eq(call("resetAt", [1250], l), 2250);
  });

  test("invalid config", () => {
    throws(() => call("createLimiter", [{ limit: 0, windowMs: 1000 }]));
    throws(() => call("createLimiter", [{ limit: 1, windowMs: 0 }]));
    throws(() => call("createLimiter", [{ limit: 1.5, windowMs: 1000 }]));
  });

  const passed = results.filter((r) => r.ok).length;
  return { passed, total: results.length, failures: results.filter((r) => !r.ok) };
}
