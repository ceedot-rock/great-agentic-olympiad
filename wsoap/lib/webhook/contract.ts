import { z } from 'zod';

export const legalActionSchema = z.enum(['fold', 'check', 'call', 'raise', 'all_in']);

export const agentDecisionResponseSchema = z.object({
  action: legalActionSchema,
  amount: z.number().int().nonnegative().optional(),
  agent_note: z.string().max(140).optional(),
});

export type ParsedAgentDecisionResponse = z.infer<typeof agentDecisionResponseSchema>;

/** Hard cap on response body size, before it's even parsed as JSON. */
export const MAX_RESPONSE_BYTES = 16 * 1024;

/** Total time budget for a decision call, per the design doc's ~5s deadline. */
export const DECISION_TIMEOUT_MS = 5000;
