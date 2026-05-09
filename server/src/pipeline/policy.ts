import {
  ALWAYS_REVIEW_CATEGORIES,
  SAFE_CATEGORIES,
  type Classification,
  type GuardrailResult,
  type PolicyDecision,
} from "../types.ts";

export interface PolicyConfig {
  autoSendConfidenceThreshold: number;
  enabledAutoSendCategories: ReadonlySet<string>;
}

export const DEFAULT_POLICY: PolicyConfig = {
  autoSendConfidenceThreshold: 0.8,
  enabledAutoSendCategories: SAFE_CATEGORIES,
};

export function decide(
  classification: Classification,
  guardrails: GuardrailResult,
  cfg: PolicyConfig = DEFAULT_POLICY,
): PolicyDecision {
  if (classification.category === "crisis") {
    return {
      action: "block",
      reason: "Crisis category detected. Auto-send disabled; alert practitioner.",
    };
  }
  if (!guardrails.pass) {
    return {
      action: "queue_review",
      reason: `Guardrail violation(s): ${guardrails.violations.map((v) => v.rule).join(", ")}`,
    };
  }
  if (ALWAYS_REVIEW_CATEGORIES.has(classification.category)) {
    return {
      action: "queue_review",
      reason: `Category '${classification.category}' always requires human review.`,
    };
  }
  if (
    cfg.enabledAutoSendCategories.has(classification.category) &&
    classification.confidence >= cfg.autoSendConfidenceThreshold
  ) {
    return {
      action: "auto_send",
      reason: `Safe category with confidence ${classification.confidence.toFixed(2)} >= threshold ${cfg.autoSendConfidenceThreshold}.`,
    };
  }
  return {
    action: "queue_review",
    reason:
      classification.category === "other"
        ? "Category 'other'; routing to review."
        : `Confidence ${classification.confidence.toFixed(2)} below threshold ${cfg.autoSendConfidenceThreshold}.`,
  };
}
