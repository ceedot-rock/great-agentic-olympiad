import { evaluateExact } from "./exact.mjs";
import { evaluateJson } from "./json.mjs";
import { evaluateRetrieval } from "./retrieval.mjs";
import { evaluateAssignment } from "./assignment.mjs";
import { evaluatePath } from "./path.mjs";
import { evaluateChain } from "./chain.mjs";
import { evaluateArtifact } from "./artifact.mjs";
import { evaluateCode } from "./code.mjs";
import { evaluateStrategy } from "./strategy.mjs";
import { evaluateCtf } from "./ctf.mjs";
import { evaluateHtml } from "./html.mjs";
import { evaluateRepair } from "./repair.mjs";
import { evaluateLive, evaluateAggregate } from "./live.mjs";

const EVALUATORS = {
  exact: evaluateExact,
  json: evaluateJson,
  retrieval: evaluateRetrieval,
  assignment: evaluateAssignment,
  path: evaluatePath,
  chain: evaluateChain,
  artifact: evaluateArtifact,
  code: evaluateCode,
  strategy: evaluateStrategy,
  ctf: evaluateCtf,
  html: evaluateHtml,
  repair: evaluateRepair,
  live: evaluateLive,
  aggregate: evaluateAggregate,
};

export function getEvaluator(name) {
  return EVALUATORS[name] || null;
}

export const EVALUATOR_NAMES = Object.keys(EVALUATORS);
