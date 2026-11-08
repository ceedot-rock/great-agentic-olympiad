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

  test("invalid deposit", () => {
    const l = call("createLedger", [100]);
    throws(() => call("deposit", [0], l));
    throws(() => call("deposit", [-1], l));
    throws(() => call("deposit", [1.5], l));
    eq(call("balance", [], l), 100);
  });

  test("overdraft", () => {
    const l = call("createLedger", [100]);
    throws(() => call("withdraw", [101], l));
    eq(call("balance", [], l), 100);
  });

  test("partial refund", () => {
    const l = call("createLedger", [1000]);
    call("deposit", [500], l);
    call("withdraw", [300], l);
    eq(call("refund", [2, 100], l), 1300);
    eq(call("refund", [2], l), 1500);
    eq(call("balance", [], l), 1500);
  });

  test("refund does not mutate original", () => {
    const l = call("createLedger", [1000]);
    call("withdraw", [300], l);
    call("refund", [1, 100], l);
    const entries = call("entries", [], l);
    const original = entries.find((e) => e.id === 1);
    eq(original.amount, 300);
    eq(original.type, "withdraw");
  });

  test("over-refund", () => {
    const l = call("createLedger", [1000]);
    call("withdraw", [300], l);
    throws(() => call("refund", [1, 301], l));
    eq(call("balance", [], l), 700);
  });

  test("refund deposit rejected", () => {
    const l = call("createLedger", [1000]);
    call("deposit", [100], l);
    throws(() => call("refund", [1], l));
  });

  test("refund unknown id", () => {
    const l = call("createLedger", [1000]);
    throws(() => call("refund", [99], l));
  });

  test("entries are copies", () => {
    const l = call("createLedger", [1000]);
    call("deposit", [100], l);
    const copy = call("entries", [], l);
    copy.push({ id: 99, type: "hack", amount: 1, balance: 0 });
    copy[0].amount = 999999;
    const fresh = call("entries", [], l);
    eq(fresh.length, 1);
    eq(fresh[0].amount, 100);
  });

  test("sequential ids", () => {
    const l = call("createLedger", [1000]);
    call("deposit", [100], l);
    call("withdraw", [50], l);
    call("refund", [2, 10], l);
    const entries = call("entries", [], l);
    eq(entries.map((e) => e.id), [1, 2, 3]);
    eq(entries[2].ref, 2);
  });

  test("initial validation", () => {
    throws(() => call("createLedger", [-1]));
    throws(() => call("createLedger", [1.5]));
  });

  const passed = results.filter((r) => r.ok).length;
  return { passed, total: results.length, failures: results.filter((r) => !r.ok) };
}
