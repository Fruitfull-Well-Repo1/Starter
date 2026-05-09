import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { InboundMessage } from "../src/types.ts";
import * as queue from "../src/store/queue.ts";

let tmpDir: string;

function fixtureMessage(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    id: "msg_x",
    clientId: "c_x",
    clientName: "Test Client",
    receivedAt: "2026-04-30T00:00:00Z",
    threadId: "t_x",
    body: "Hi",
    history: [],
    ...overrides,
  };
}

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "pb-queue-"));
  process.env.QUEUE_PATH = join(tmpDir, "drafts.json");
  queue._resetForTests();
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
  delete process.env.QUEUE_PATH;
});

describe("queue.enqueue", () => {
  it("creates an auto_send_scheduled record with future autoSendAt for auto_send", async () => {
    const rec = await queue.enqueue({
      message: fixtureMessage(),
      classification: { category: "scheduling", confidence: 0.95, rationale: "" },
      draft: { text: "Sounds good!", model: "claude-sonnet-4-6" },
      guardrails: { pass: true, violations: [] },
      policy: { action: "auto_send", reason: "" },
      undoWindowMs: 60_000,
    });
    expect(rec.status).toBe("auto_send_scheduled");
    expect(rec.autoSendAt).toBeDefined();
    expect(new Date(rec.autoSendAt!).getTime()).toBeGreaterThan(Date.now());
  });

  it("creates a pending_review record with no autoSendAt for queue_review", async () => {
    const rec = await queue.enqueue({
      message: fixtureMessage(),
      classification: { category: "billing", confidence: 0.8, rationale: "" },
      draft: { text: "Let me check", model: "claude-sonnet-4-6" },
      guardrails: { pass: true, violations: [] },
      policy: { action: "queue_review", reason: "" },
      undoWindowMs: 60_000,
    });
    expect(rec.status).toBe("pending_review");
    expect(rec.autoSendAt).toBeUndefined();
  });

  it("creates a blocked record for crisis", async () => {
    const rec = await queue.enqueue({
      message: fixtureMessage(),
      classification: { category: "crisis", confidence: 1, rationale: "" },
      draft: { text: "I'm here for you. Please call 988.", model: "claude-opus-4-7" },
      guardrails: { pass: true, violations: [] },
      policy: { action: "block", reason: "" },
      undoWindowMs: 60_000,
    });
    expect(rec.status).toBe("blocked");
  });
});

describe("queue.update + queries", () => {
  it("updates a record and surfaces it via getById", async () => {
    const rec = await queue.enqueue({
      message: fixtureMessage(),
      classification: { category: "scheduling", confidence: 0.95, rationale: "" },
      draft: { text: "v1", model: "claude-sonnet-4-6" },
      guardrails: { pass: true, violations: [] },
      policy: { action: "auto_send", reason: "" },
      undoWindowMs: 60_000,
    });
    await queue.update(rec.id, { draftBody: "v2", status: "pending_review", autoSendAt: null });
    const fresh = await queue.getById(rec.id);
    expect(fresh?.draftBody).toBe("v2");
    expect(fresh?.status).toBe("pending_review");
    expect(fresh?.autoSendAt).toBeUndefined();
  });

  it("listDueAutoSends returns only past-due scheduled drafts", async () => {
    const past = await queue.enqueue({
      message: fixtureMessage({ id: "past" }),
      classification: { category: "scheduling", confidence: 0.95, rationale: "" },
      draft: { text: "x", model: "m" },
      guardrails: { pass: true, violations: [] },
      policy: { action: "auto_send", reason: "" },
      undoWindowMs: -1000,
    });
    await queue.enqueue({
      message: fixtureMessage({ id: "future" }),
      classification: { category: "scheduling", confidence: 0.95, rationale: "" },
      draft: { text: "y", model: "m" },
      guardrails: { pass: true, violations: [] },
      policy: { action: "auto_send", reason: "" },
      undoWindowMs: 60_000,
    });
    const due = await queue.listDueAutoSends();
    expect(due.map((d) => d.id)).toEqual([past.id]);
  });

  it("listByStatus filters correctly", async () => {
    await queue.enqueue({
      message: fixtureMessage({ id: "a" }),
      classification: { category: "scheduling", confidence: 0.95, rationale: "" },
      draft: { text: "x", model: "m" },
      guardrails: { pass: true, violations: [] },
      policy: { action: "auto_send", reason: "" },
      undoWindowMs: 60_000,
    });
    await queue.enqueue({
      message: fixtureMessage({ id: "b" }),
      classification: { category: "billing", confidence: 0.8, rationale: "" },
      draft: { text: "y", model: "m" },
      guardrails: { pass: true, violations: [] },
      policy: { action: "queue_review", reason: "" },
      undoWindowMs: 60_000,
    });
    const pending = await queue.listByStatus(["pending_review"]);
    expect(pending).toHaveLength(1);
    expect(pending[0]!.category).toBe("billing");
  });
});
