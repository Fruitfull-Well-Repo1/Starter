import { describe, expect, it } from "vitest";
import { combine, scanDraft, scanInboundForCrisis } from "../src/pipeline/guardrails.ts";
import type { InboundMessage } from "../src/types.ts";

function inbound(body: string, history: InboundMessage["history"] = []): InboundMessage {
  return {
    id: "x",
    clientId: "c",
    clientName: "Test",
    receivedAt: "2026-04-30T00:00:00Z",
    threadId: "t",
    body,
    history,
  };
}

describe("scanInboundForCrisis", () => {
  it("flags suicidal ideation", () => {
    const r = scanInboundForCrisis(inbound("I've been thinking about ending my life"));
    expect(r.pass).toBe(false);
    expect(r.violations.map((v) => v.rule)).toContain("crisis_self_harm");
  });

  it("flags self-harm phrasing", () => {
    const r = scanInboundForCrisis(inbound("I started cutting myself again"));
    expect(r.pass).toBe(false);
  });

  it("flags acute medical emergency", () => {
    const r = scanInboundForCrisis(inbound("having severe chest pain right now"));
    expect(r.pass).toBe(false);
    expect(r.violations.map((v) => v.rule)).toContain("crisis_acute_symptom");
  });

  it("flags legal threats", () => {
    const r = scanInboundForCrisis(inbound("I'm getting an attorney involved"));
    expect(r.pass).toBe(false);
    expect(r.violations.map((v) => v.rule)).toContain("crisis_legal");
  });

  it("passes benign messages", () => {
    const r = scanInboundForCrisis(inbound("Could we move my appointment to Friday?"));
    expect(r.pass).toBe(true);
  });
});

describe("scanDraft", () => {
  it("flags dollar amounts", () => {
    expect(scanDraft("Your balance is $120.00").pass).toBe(false);
  });

  it("flags dosage references", () => {
    expect(scanDraft("Take 500mg with breakfast").pass).toBe(false);
  });

  it("flags dose-change instructions", () => {
    expect(scanDraft("You can increase your dose to twice daily").pass).toBe(false);
  });

  it("flags ICD-style codes", () => {
    expect(scanDraft("Code F32.1 applies").pass).toBe(false);
  });

  it("passes a normal scheduling reply", () => {
    expect(
      scanDraft("Sounds good — I'll move you to Friday afternoon. Talk soon.").pass,
    ).toBe(true);
  });
});

describe("combine", () => {
  it("aggregates violations", () => {
    const r = combine(
      { pass: false, violations: [{ rule: "a", detail: "" }] },
      { pass: false, violations: [{ rule: "b", detail: "" }] },
    );
    expect(r.pass).toBe(false);
    expect(r.violations).toHaveLength(2);
  });

  it("passes if all pass", () => {
    expect(combine({ pass: true, violations: [] }).pass).toBe(true);
  });
});
