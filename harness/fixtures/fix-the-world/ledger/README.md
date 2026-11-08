# Integer-cents ledger

`createLedger(initialCents)` returns a ledger with `balance()`, `entries()`,
`deposit()`, `withdraw()` and `refund()`.

The public tests cover deposits and withdrawals. Hidden tests cover invalid
amounts, overdrafts, partial refunds, refund limits, immutable entries, and
sequential ids. Keep the API and do not edit tests or `package.json`.
