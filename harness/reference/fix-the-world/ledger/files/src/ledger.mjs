/**
 * Integer-cents ledger.
 * Public contract:
 * - All amounts are integer cents.
 * - deposit(amount) and withdraw(amount) throw on invalid amounts.
 * - withdraw cannot overdraw.
 * - refund(entryId, amount?) creates a new refund entry; it never mutates the
 *   original entry. amount defaults to the full remaining refundable amount.
 * - entries() returns copies, not internal state.
 */
function requirePositiveInt(amount) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("invalid_amount");
}

export function createLedger(initialCents = 0) {
  if (!Number.isInteger(initialCents) || initialCents < 0) throw new Error("invalid_initial");
  let balance = initialCents;
  const entries = [];
  let nextId = 1;
  const refundedFor = (entryId) =>
    entries.filter((e) => e.type === "refund" && e.ref === entryId).reduce((s, e) => s + e.amount, 0);
  return {
    balance() {
      return balance;
    },
    entries() {
      return entries.map((entry) => ({ ...entry }));
    },
    deposit(amount) {
      requirePositiveInt(amount);
      balance += amount;
      entries.push({ id: nextId++, type: "deposit", amount, balance });
      return balance;
    },
    withdraw(amount) {
      requirePositiveInt(amount);
      if (amount > balance) throw new Error("insufficient_funds");
      balance -= amount;
      entries.push({ id: nextId++, type: "withdraw", amount, balance });
      return balance;
    },
    refund(entryId, amount) {
      const entry = entries.find((e) => e.id === entryId);
      if (!entry) throw new Error("not_found");
      if (entry.type !== "withdraw") throw new Error("not_refundable");
      const remaining = entry.amount - refundedFor(entryId);
      const requested = amount == null ? remaining : amount;
      requirePositiveInt(requested);
      if (requested > remaining) throw new Error("refund_exceeds_remaining");
      balance += requested;
      entries.push({ id: nextId++, type: "refund", amount: requested, balance, ref: entryId });
      return balance;
    },
  };
}
