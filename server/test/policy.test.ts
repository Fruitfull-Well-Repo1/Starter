import { describe, expect, it } from "vitest";
import { decide, DEFAULT_POLICY } from "../src/pipeline/policy.ts";
import type { Classification, GuardrailResult } from "../src/types.ts";

const okGuard: GuardrailResult = { pass: true, violations: [] };
const failGuard: GuardrailResult = {
  pass: false,
  violations: [{ rule: "draft_contains_dollar_amount", detail: "$120" }],
};

function cls(category: Classification["category"], confidence: number): Classification {
  return { category, confidence, rationale: "" };
}

describe("policy.decide", () => {
  it("blocks crisis regardless of confidence", () => {
    const d = decide(cls("crisis", 1), okGuard);
    expect(d.action).toBe("block");
  });

  it("queues clinical_question even when confident", () => {
    const d = decide(cls("clinical_question", 0.99), okGuard);
    expect(d.action).toBe("queue_review");
  });

  it("queues billing", () => {
    const d = decide(cls("billing", 0.95), okGuard);
    expect(d.action).toBe("queue_review");
  });

  it("queues complaint", () => {
    const d = decide(cls("complaint", 0.95), okGuard);
    expect(d.action).toBe("queue_review");
  });

  it("auto_sends scheduling above threshold", () => {
    const d = decide(cls("scheduling", 0.9), okGuard);
    expect(d.action).toBe("auto_send");
  });

  it("queues scheduling below threshold", () => {
    const d = decide(cls("scheduling", 0.5), okGuard);
    expect(d.action).toBe("queue_review");
  });

  it("queues when guardrails fail even on safe category", () => {
    const d = decide(cls("scheduling", 0.99), failGuard);
    expect(d.action).toBe("queue_review");
  });

  it("queues 'other' regardless of confidence", () => {
    const d = decide(cls("other", 0.99), okGuard);
    expect(d.action).toBe("queue_review");
  });

  it("respects custom threshold", () => {
    const cfg = { ...DEFAULT_POLICY, autoSendConfidenceThreshold: 0.95 };
    expect(decide(cls("scheduling", 0.9), okGuard, cfg).action).toBe("queue_review");
    expect(decide(cls("scheduling", 0.96), okGuard, cfg).action).toBe("auto_send");
  });
});
