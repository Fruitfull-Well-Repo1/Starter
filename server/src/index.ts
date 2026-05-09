import Fastify from "fastify";
import { registerPBWebhook } from "./webhooks/pb.ts";
import { registerDraftRoutes } from "./api/drafts.ts";
import { registerDevRoutes } from "./api/dev.ts";
import { startAutoSendScheduler } from "./scheduler/auto-send.ts";

const app = Fastify({ logger: true });

await app.register(import("@fastify/cors"), {
  origin: process.env.CORS_ORIGIN ?? true,
});

app.get("/health", async () => ({ ok: true }));

await registerPBWebhook(app);
await registerDraftRoutes(app);
await registerDevRoutes(app);

const scheduler = startAutoSendScheduler(Number(process.env.SCHEDULER_INTERVAL_MS ?? 5000));

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "0.0.0.0";

app.listen({ port, host }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});

const shutdown = async () => {
  scheduler.stop();
  await app.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
