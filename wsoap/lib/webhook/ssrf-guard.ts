import { promises as dns } from 'dns';
import ipaddr from 'ipaddr.js';
import { Agent, type Dispatcher } from 'undici';

// This specifically blocks 169.254.169.254 (the cloud metadata endpoint) via
// the 'linkLocal' range, plus RFC1918 private ranges, loopback, and other
// reserved ranges.
const BLOCKED_RANGES = new Set(['private', 'loopback', 'linkLocal', 'uniqueLocal', 'reserved', 'unspecified']);

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export interface SsrfCheckResult {
  safe: boolean;
  reason?: string;
  resolved?: ResolvedAddress;
}

function isBlockedIp(address: string): string | null {
  const parsed = ipaddr.process(address);
  const range = parsed.range();
  return BLOCKED_RANGES.has(range) ? range : null;
}

/**
 * Resolves the hostname and rejects anything pointing at a private/reserved
 * range. Used both at agent registration (does this URL even look safe?) and
 * immediately before every call (re-resolve to defeat DNS rebinding between
 * the two checks — see createPinnedDispatcher, which then locks the actual
 * TCP connection to exactly this resolved address).
 */
export async function checkUrlSafety(rawUrl: string): Promise<SsrfCheckResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { safe: false, reason: 'invalid_url' };
  }

  const allowInsecureLocalhost = process.env.NODE_ENV !== 'production' && url.hostname === 'localhost';
  if (url.protocol !== 'https:' && !allowInsecureLocalhost) {
    return { safe: false, reason: 'https_required' };
  }

  let addresses: ResolvedAddress[];
  try {
    const result = await dns.lookup(url.hostname, { all: true, verbatim: true });
    addresses = result.map((r) => ({ address: r.address, family: r.family as 4 | 6 }));
  } catch {
    return { safe: false, reason: 'dns_resolution_failed' };
  }

  if (addresses.length === 0) return { safe: false, reason: 'dns_resolution_failed' };

  for (const addr of addresses) {
    const blockedRange = isBlockedIp(addr.address);
    if (blockedRange) {
      return { safe: false, reason: `blocked_ip_range:${blockedRange}`, resolved: addr };
    }
  }

  return { safe: true, resolved: addresses[0] };
}

/**
 * Pins the actual outbound TCP connection to a specific, already-validated
 * IP address, so nothing can rebind between checkUrlSafety() and the real
 * connect (classic DNS-rebinding SSRF bypass).
 */
export function createPinnedDispatcher(resolved: ResolvedAddress): Dispatcher {
  return new Agent({
    connect: {
      lookup: (_hostname, _options, callback) => {
        callback(null, resolved.address, resolved.family);
      },
    },
  });
}
