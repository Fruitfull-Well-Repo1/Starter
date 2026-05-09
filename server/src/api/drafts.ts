import type { FastifyInstance } from "fastify";
import { getById, listByStatus, listRecent, update, type DraftStatus } from "../store/queue.ts";
import { getPBClient } from "../pb/client.ts";
import { audit } from "../audit/log.ts";
import { scanDraft } from "../pipeline/guardrails.ts";

const PENDING_STATUSES: DraftStatus[] = ["pending_review", "auto_send_scheduled", "blocked"];

export async function registerDraftRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/drafts", async (req) => {
    const status = (req.query as { status?: string }).status ?? "pending";
    const limit = Number((req.query as { limit?: string }).limit ?? 50);
    if (status === "pending") {
      return { drafts: await listByStatus(PENDING_STATUSES, limit) };
    }
    if (status === "recent") {
      return { drafts: await listRecent(limit) };
    }
    return { drafts: await listRecent(limit) };
  });

  app.get<{ Params: { id: string } }>("/api/drafts/:id", async (req, reply) => {
    const draft = await getById(req.params.id);
    if (!draft) return reply.status(404).send({ error: "not_found" });
    return draft;
  });

  app.post<{ Params: { id: string }; Body: { text?: string } }>(
    "/api/drafts/:id/approve",
    async (req, reply) => {
      const draft = await getById(req.params.id);
      if (!draft) return reply.status(404).send({ error: "not_found" });
      if (draft.status === "auto_sent" || draft.status === "sent_after_review") {
        return reply.status(409).send({ error: "already_sent" });
      }
      const text = req.body?.text?.trim() || draft.draftBody;
      const pb = getPBClient();
      const sent = await pb.sendMessage(draft.threadId, text);
      const updated = await update(draft.id, {
        draftBody: text,
        status: "sent_after_review",
        sentAt: new Date().toISOString(),
        sentMessageId: sent.id,
        autoSendAt: null,
      });
      await audit("api.approve", { draft_id: draft.id, edited: text !== draft.draftBody });
      return updated;
    },
  );

  app.post<{ Params: { id: string }; Body: { text: string } }>(
    "/api/drafts/:id/edit",
    async (req, reply) => {
      const draft = await getById(req.params.id);
      if (!draft) return reply.status(404).send({ error: "not_found" });
      const text = (req.body?.text ?? "").trim();
      if (!text) return reply.status(400).send({ error: "empty_text" });
      const guardrails = scanDraft(text);
      const updated = await update(draft.id, { draftBody: text });
      await audit("api.edit", {
        draft_id: draft.id,
        guardrail_flags: guardrails.violations.map((v) => v.rule),
      });
      return { ...updated, guardrails };
    },
  );

  app.post<{ Params: { id: string }; Body: { reason?: string } }>(
    "/api/drafts/:id/reject",
    async (req, reply) => {
      const draft = await getById(req.params.id);
      if (!draft) return reply.status(404).send({ error: "not_found" });
      const updated = await update(draft.id, {
        status: "rejected",
        rejectionReason: req.body?.reason,
        autoSendAt: null,
      });
      await audit("api.reject", { draft_id: draft.id, reason: req.body?.reason });
      return updated;
    },
  );

  app.post<{ Params: { id: string } }>("/api/drafts/:id/cancel-autosend", async (req, reply) => {
    const draft = await getById(req.params.id);
    if (!draft) return reply.status(404).send({ error: "not_found" });
    if (draft.status !== "auto_send_scheduled") {
      return reply.status(409).send({ error: "not_scheduled" });
    }
    const updated = await update(draft.id, {
      status: "pending_review",
      autoSendAt: null,
    });
    await audit("api.cancel_autosend", { draft_id: draft.id });
    return updated;
  });
}
