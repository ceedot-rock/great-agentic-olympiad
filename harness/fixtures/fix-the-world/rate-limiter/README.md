# Fixed-window rate limiter

`createLimiter({ limit, windowMs })` returns `allow(now)`, `remaining(now)` and
`resetAt(now)`.

The public tests cover the basic limit and the next window. Hidden tests cover
exact boundary ticks, denied requests not consuming quota, clamped remaining
values, resetAt, and invalid configuration. Keep the API and do not edit tests
or `package.json`.
