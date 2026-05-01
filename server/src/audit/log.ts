import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const PATH = process.env.AUDIT_LOG_PATH ?? "audit-log.jsonl";

export interface AuditEntry {
  ts: string;
  event: string;
  data: unknown;
}

let dirEnsured = false;

export async function audit(event: string, data: unknown): Promise<void> {
  const entry: AuditEntry = { ts: new Date().toISOString(), event, data };
  const line = JSON.stringify(entry) + "\n";
  if (!dirEnsured) {
    await mkdir(dirname(PATH) || ".", { recursive: true });
    dirEnsured = true;
  }
  await appendFile(PATH, line, "utf8");
}
