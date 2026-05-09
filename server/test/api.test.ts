import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { registerDraftRoutes } from "../src/api/drafts.ts";
import * as queue from "../src/store/queue.ts";
import type { InboundMessage } from "../src/types.ts";

let app: FastifyInstance;
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

async function seed(action: "auto_send" | "queue_review" | "block", category = "scheduling") {
  return queue.enqueue({
    message: fixtureMessage({ id: `msg_${Math.random().toString(36).slice(2, 8)}` }),
    classification: { category: category as never, confidence: 0.9, rationale: "" },
    draft: { text: "Sounds good!", model: "claude-sonnet-4-6" },
    guardrails: { pass: true, violations: [] },
    policy: { action, reason: "" },
    undoWindowMs: 60_000,
  });
}

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "pb-api-"));
  process.env.QUEUE_PATH = join(tmpDir, "drafts.json");
  queue._resetForTests();
  app = Fastify();
  await registerDraftRoutes(app);
});

afterEach(async () => {
  await app.close();
  await rm(tmpDir, { recursive: true, force: true });
  delete process.env.QUEUE_PATH;
});

describe("GET /api/drafts", () => {
  it("returns pending drafts including auto_send_scheduled and blocked", async () => {
    await seed("queue_review", "billing");
    await seed("auto_send", "scheduling");
    await seed("block", "crisis");

    const res = await app.inject({ method: "GET", url: "/api/drafts?status=pending" });
    expect(res.statusCode).toBe(200);
    const { drafts } = res.json() as { drafts: { status: string }[] };
    expect(drafts).toHaveLength(3);
  });

  it("recent returns everything", async () => {
    await seed("queue_review");
    await seed("auto_send");
    const res = await app.inject({ method: "GET", url: "/api/drafts?status=recent" });
    expect((res.json() as { drafts: unknown[] }).drafts).toHaveLength(2);
  });
});

describe("POST /api/drafts/:id/cancel-autosend", () => {
  it("moves an auto_send_scheduled draft to pending_review", async () => {
    const rec = await seed("auto_send");
    const res = await app.inject({
      method: "POST",
      url: `/api/drafts/${rec.id}/cancel-autosend`,
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { status: string }).status).toBe("pending_review");
  });

  it("409s when not scheduled", async () => {
    const rec = await seed("queue_review");
    const res = await app.inject({
      method: "POST",
      url: `/api/drafts/${rec.id}/cancel-autosend`,
    });
    expect(res.statusCode).toBe(409);
  });
});

describe("POST /api/drafts/:id/edit", () => {
  it("updates draft body and returns guardrail scan", async () => {
    const rec = await seed("queue_review");
    const res = await app.inject({
      method: "POST",
      url: `/api/drafts/${rec.id}/edit`,
      payload: { text: "Your balance is $120.00" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { draftBody: string; guardrails: { pass: boolean } };
    expect(body.draftBody).toBe("Your balance is $120.00");
    expect(body.guardrails.pass).toBe(false);
  });

  it("400s on empty text", async () => {
    const rec = await seed("queue_review");
    const res = await app.inject({
      method: "POST",
      url: `/api/drafts/${rec.id}/edit`,
      payload: { text: "  " },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /api/drafts/:id/reject", () => {
  it("marks rejected and stores reason", async () => {
    const rec = await seed("queue_review");
    const res = await app.inject({
      method: "POST",
      url: `/api/drafts/${rec.id}/reject`,
      payload: { reason: "needs human" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { status: string; rejectionReason: string };
    expect(body.status).toBe("rejected");
    expect(body.rejectionReason).toBe("needs human");
  });
});
