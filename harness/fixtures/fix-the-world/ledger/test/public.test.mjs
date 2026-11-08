import test from "node:test";
import assert from "node:assert/strict";
import { createLedger } from "../src/ledger.mjs";

test("deposit and withdraw", () => {
  const ledger = createLedger(1000);
  assert.equal(ledger.deposit(500), 1500);
  assert.equal(ledger.withdraw(200), 1300);
  assert.equal(ledger.balance(), 1300);
  assert.equal(ledger.entries().length, 2);
});

test("starts at zero", () => {
  const ledger = createLedger();
  assert.equal(ledger.balance(), 0);
  assert.deepEqual(ledger.entries(), []);
});
