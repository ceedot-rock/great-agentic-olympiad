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
export function createLedger(initialCents = 0) {
  let balance = initialCents;
  const entries = [];
  let nextId = 1;
  return {
    balance() {
      return balance;
    },
    entries() {
      return entries;
    },
    deposit(amount) {
      balance += amount;
      entries.push({ id: nextId++, type: "deposit", amount, balance });
      return balance;
    },
    withdraw(amount) {
      balance -= amount;
      entries.push({ id: nextId++, type: "withdraw", amount, balance });
      return balance;
    },
    refund(entryId, amount) {
      const entry = entries.find((e) => e.id === entryId);
      if (entry.type !== "withdraw") throw new Error("not_refundable");
      entry.amount = amount == null ? 0 : amount;
      balance += amount == null ? entry.amount : amount;
      return balance;
    },
  };
}
