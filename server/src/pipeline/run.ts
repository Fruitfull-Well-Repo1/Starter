import { classify } from "./classify.ts";
import { decide, DEFAULT_POLICY, type PolicyConfig } from "./policy.ts";
import { combine, scanDraft, scanInboundForCrisis } from "./guardrails.ts";
import { draft } from "./draft.ts";
import type { ClientContext, InboundMessage, PipelineResult } from "../types.ts";

export interface RunOptions {
  policy?: PolicyConfig;
  voiceProfile?: string;
  ragChunks?: string[];
  clientContext?: ClientContext;
}

export async function runPipeline(
  message: InboundMessage,
  opts: RunOptions = {},
): Promise<PipelineResult> {
  const inboundCrisis = scanInboundForCrisis(message);

  const classification = inboundCrisis.pass
    ? await classify(message)
    : { category: "crisis" as const, confidence: 1, rationale: "Crisis pattern matched in inbound text." };

  const generated = await draft({
    message,
    category: classification.category,
    voiceProfile: opts.voiceProfile,
    ragChunks: opts.ragChunks,
    clientContext: opts.clientContext,
  });

  const draftScan = scanDraft(generated.text);
  const guardrails = combine(inboundCrisis, draftScan);

  const policy = decide(classification, guardrails, opts.policy ?? DEFAULT_POLICY);

  return {
    message,
    classification,
    draft: generated,
    guardrails,
    policy,
  };
}
