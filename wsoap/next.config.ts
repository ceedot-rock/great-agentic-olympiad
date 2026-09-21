import type { NextConfig } from 'next';
import { withWorkflow } from '@workflow/next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
};

// Required for "use workflow" / "use step" directives (lib/tournament/
// run-tournament-workflow.ts) to actually compile into durable, retryable
// units — without this wrapper they're inert no-ops rather than real
// checkpointed steps.
export default withWorkflow(nextConfig);
