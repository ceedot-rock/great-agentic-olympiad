import { createRemoteJWKSet, jwtVerify } from 'jose';

const AGENT_RIDER_ISSUER = 'agentrider.dev';
const AGENT_RIDER_JWKS_URL = 'https://agentrider.fly.dev/.well-known/jwks.json';

// jose's remote JWKS helper does the fetch-once-and-cache work itself
// (cacheMaxAge mirrors the 1h Cache-Control the JWKS endpoint already sends)
// — this is what makes rider verification a local crypto check after the
// first call, not a network round trip per agent registration.
const JWKS = createRemoteJWKSet(new URL(AGENT_RIDER_JWKS_URL), {
  cacheMaxAge: 60 * 60 * 1000,
});

export type ClearanceLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';

export interface RiderPayload {
  agent_id: string;
  operator_id: string;
  level: ClearanceLevel;
  scopes: string[];
  reputation_score?: number;
  jti: string;
}

export interface VerifyRiderResult {
  valid: boolean;
  reason?: string;
  rider?: RiderPayload;
}

/**
 * Verifies a rider JWT issued by Agent-Rider (agentrider.fly.dev) — used
 * once at agent registration to confirm the registrant actually controls the
 * claimed Agent-Rider agent_id/operator_id. This is an identity check, not a
 * per-decision authorization: it never runs again during a tournament, so it
 * doesn't scale with hand count or field size.
 */
export async function verifyRiderToken(token: string): Promise<VerifyRiderResult> {
  try {
    const { payload } = await jwtVerify(token, JWKS, { issuer: AGENT_RIDER_ISSUER });
    return { valid: true, rider: payload as unknown as RiderPayload };
  } catch (err) {
    return { valid: false, reason: err instanceof Error ? err.message : 'invalid_token' };
  }
}
