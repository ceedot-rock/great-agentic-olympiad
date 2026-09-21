import { createHmac, timingSafeEqual } from 'crypto';

export function signWebhookPayload(secret: string, timestamp: string, eventId: string, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${eventId}.${rawBody}`).digest('hex');
}

/** Reference implementation for agent owners verifying calls really came from WSOAP. */
export function verifyWebhookSignature(
  secret: string,
  timestamp: string,
  eventId: string,
  rawBody: string,
  signature: string
): boolean {
  const expected = signWebhookPayload(secret, timestamp, eventId, rawBody);
  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(signature, 'hex');
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}
