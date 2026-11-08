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
  let windowStart = 0;
  let used = 0;
  return {
    allow(now) {
      if (now - windowStart > windowMs) {
        windowStart = now;
        used = 0;
      }
      used += 1;
      return true;
    },
    remaining() {
      return limit - used;
    },
    resetAt() {
      return windowStart + windowMs;
    },
  };
}
