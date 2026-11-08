/**
 * Fixed-window rate limiter.
 * Public contract:
 * - The first allow(now) opens a window [now, now + windowMs).
 * - allow(now) returns true while fewer than limit requests were accepted in
 *   the current window. Denied requests do not consume quota.
 * - At exactly windowStart + windowMs a fresh window opens.
 * - remaining(now) never goes below zero.
 * - resetAt(now) returns the end of the current window, or null before the
 *   first request.
 */
export function createLimiter({ limit, windowMs }) {
  if (!Number.isInteger(limit) || limit <= 0) throw new Error("invalid_limit");
  if (!Number.isFinite(windowMs) || windowMs <= 0) throw new Error("invalid_window");
  let windowStart = null;
  let used = 0;

  function roll(now) {
    if (windowStart === null) {
      windowStart = now;
      used = 0;
      return;
    }
    if (now >= windowStart + windowMs) {
      const windows = Math.floor((now - windowStart) / windowMs);
      windowStart += windows * windowMs;
      used = 0;
    }
  }

  return {
    allow(now) {
      roll(now);
      if (used < limit) {
        used += 1;
        return true;
      }
      return false;
    },
    remaining(now) {
      roll(now);
      return Math.max(0, limit - used);
    },
    resetAt(now) {
      if (windowStart === null) return null;
      roll(now);
      return windowStart + windowMs;
    },
  };
}
