import type { FastifyInstance } from "fastify";
import { runPipeline } from "../pipeline/run.ts";
import { enqueue } from "../store/queue.ts";
import { audit } from "../audit/log.ts";
import type { InboundMessage } from "../types.ts";

const UNDO_WINDOW_MS = Number(process.env.UNDO_WINDOW_MS ?? 60_000);

interface SimulateBody {
  clientName?: string;
  body: string;
  history?: InboundMessage["history"];
}

export async function registerDevRoutes(app: FastifyInstance): Promise<void> {
  if (process.env.NODE_ENV === "production") return;

  app.post<{ Body: SimulateBody }>("/api/dev/simulate", async (req, reply) => {
    const { clientName = "Sim Client", body, history = [] } = req.body ?? {};
    if (!body) return reply.status(400).send({ error: "missing_body" });

    const id = `sim_${Date.now()}`;
    const message: InboundMessage = {
      id,
      clientId: `sim_client_${Math.floor(Math.random() * 1000)}`,
      clientName,
      receivedAt: new Date().toISOString(),
      threadId: `sim_thread_${id}`,
      body,
      history,
    };

    const result = await runPipeline(message);
    const record = await enqueue({
      message,
      classification: result.classification,
      draft: { text: result.draft.text, model: result.draft.model },
      guardrails: result.guardrails,
      policy: result.policy,
      undoWindowMs: UNDO_WINDOW_MS,
    });
    await audit("dev.simulate", { draft_id: record.id, decision: result.policy });
    return record;
  });
}
