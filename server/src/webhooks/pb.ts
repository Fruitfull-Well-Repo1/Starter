import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { getPBClient } from "../pb/client.ts";
import type { PBWebhookEvent } from "../pb/types.ts";
import { runPipeline } from "../pipeline/run.ts";
import { audit } from "../audit/log.ts";
import { enqueue } from "../store/queue.ts";
import type { ClientContext, InboundMessage } from "../types.ts";

const UNDO_WINDOW_MS = Number(process.env.UNDO_WINDOW_MS ?? 60_000);

function verifySignature(req: FastifyRequest, raw: string): boolean {
  const secret = process.env.PB_WEBHOOK_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const sig = req.headers["x-pb-signature"];
  if (typeof sig !== "string") return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function buildClientContext(clientId: string): Promise<ClientContext> {
  const pb = getPBClient();
  const [profile, appts, forms] = await Promise.all([
    pb.getClient(clientId),
    pb.getRecentAppointments(clientId, 5),
    pb.getFormHighlights(clientId),
  ]);
  return {
    clientId: profile.id,
    clientName: profile.name,
    intakeSummary: profile.intake_summary,
    recentAppointments: appts,
    formHighlights: forms,
  };
}

async function buildInboundMessage(event: PBWebhookEvent): Promise<InboundMessage> {
  const pb = getPBClient();
  const profile = await pb.getClient(event.data.client_id);
  const history = await pb.getThreadMessages(event.data.thread_id, 20);
  return {
    id: event.data.message_id,
    clientId: event.data.client_id,
    clientName: profile.name,
    receivedAt: event.data.received_at,
    threadId: event.data.thread_id,
    body: event.data.body,
    history: history.map((m) => ({
      role: m.sender,
      body: m.body,
      sentAt: m.sent_at,
    })),
  };
}

export async function registerPBWebhook(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body, done) => {
      try {
        done(null, { _raw: body, ...JSON.parse(body as string) });
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  app.post("/webhooks/pb", async (req, reply) => {
    const body = req.body as PBWebhookEvent & { _raw: string };
    if (!verifySignature(req, body._raw ?? "")) {
      return reply.status(401).send({ error: "bad signature" });
    }
    if (body.event !== "message.created") {
      return reply.status(202).send({ accepted: false, reason: "unhandled event" });
    }

    reply.status(202).send({ accepted: true });

    queueMicrotask(async () => {
      try {
        const message = await buildInboundMessage(body);
        const clientContext = await buildClientContext(message.clientId);
        const result = await runPipeline(message, { clientContext });
        const record = await enqueue({
          message,
          classification: result.classification,
          draft: { text: result.draft.text, model: result.draft.model },
          guardrails: result.guardrails,
          policy: result.policy,
          undoWindowMs: UNDO_WINDOW_MS,
        });
        await audit("pipeline.enqueued", {
          draft_id: record.id,
          message_id: message.id,
          status: record.status,
          decision: result.policy,
        });
      } catch (err) {
        await audit("pipeline.error", {
          message_id: body.data.message_id,
          error: (err as Error).message,
        });
      }
    });
  });
}
