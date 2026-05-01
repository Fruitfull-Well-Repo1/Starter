import Fastify from "fastify";
import { registerPBWebhook } from "./webhooks/pb.ts";

const app = Fastify({ logger: true });

app.get("/health", async () => ({ ok: true }));

await registerPBWebhook(app);

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "0.0.0.0";

app.listen({ port, host }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
