import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { Classification, GuardrailResult, InboundMessage, PolicyDecision } from "../types.ts";

export type DraftStatus =
  | "pending_review"
  | "auto_send_scheduled"
  | "auto_sent"
  | "sent_after_review"
  | "rejected"
  | "blocked";

export interface DraftRecord {
  id: string;
  messageId: string;
  threadId: string;
  clientId: string;
  clientName: string;
  inboundBody: string;
  draftBody: string;
  category: Classification["category"];
  confidence: number;
  rationale: string;
  guardrailFlags: string[];
  policyReason: string;
  status: DraftStatus;
  model: string;
  createdAt: string;
  autoSendAt?: string;
  sentAt?: string;
  sentMessageId?: string;
  rejectionReason?: string;
}

function path(): string {
  return process.env.QUEUE_PATH ?? "drafts.json";
}

interface QueueState {
  drafts: DraftRecord[];
}

let cache: QueueState | null = null;
let cachedPath: string | null = null;
let writeChain: Promise<void> = Promise.resolve();

async function load(): Promise<QueueState> {
  const p = path();
  if (cache && cachedPath === p) return cache;
  try {
    const raw = await readFile(p, "utf8");
    cache = JSON.parse(raw) as QueueState;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      cache = { drafts: [] };
    } else {
      throw err;
    }
  }
  cachedPath = p;
  return cache!;
}

async function persist(state: QueueState): Promise<void> {
  const p = path();
  await mkdir(dirname(p) || ".", { recursive: true });
  const tmp = `${p}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
  await rename(tmp, p);
}

function chain<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeChain.then(fn);
  writeChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export interface EnqueueInput {
  message: InboundMessage;
  classification: Classification;
  draft: { text: string; model: string };
  guardrails: GuardrailResult;
  policy: PolicyDecision;
  undoWindowMs: number;
}

export function enqueue(input: EnqueueInput): Promise<DraftRecord> {
  return chain(async () => {
    const state = await load();
    const now = new Date();
    const status: DraftStatus =
      input.policy.action === "auto_send"
        ? "auto_send_scheduled"
        : input.policy.action === "block"
          ? "blocked"
          : "pending_review";

    const record: DraftRecord = {
      id: randomUUID(),
      messageId: input.message.id,
      threadId: input.message.threadId,
      clientId: input.message.clientId,
      clientName: input.message.clientName,
      inboundBody: input.message.body,
      draftBody: input.draft.text,
      category: input.classification.category,
      confidence: input.classification.confidence,
      rationale: input.classification.rationale,
      guardrailFlags: input.guardrails.violations.map((v) => v.rule),
      policyReason: input.policy.reason,
      status,
      model: input.draft.model,
      createdAt: now.toISOString(),
      autoSendAt:
        status === "auto_send_scheduled"
          ? new Date(now.getTime() + input.undoWindowMs).toISOString()
          : undefined,
    };

    state.drafts.unshift(record);
    await persist(state);
    return record;
  });
}

export async function getById(id: string): Promise<DraftRecord | undefined> {
  const state = await load();
  return state.drafts.find((d) => d.id === id);
}

export async function listByStatus(statuses: DraftStatus[], limit = 100): Promise<DraftRecord[]> {
  const state = await load();
  return state.drafts.filter((d) => statuses.includes(d.status)).slice(0, limit);
}

export async function listRecent(limit = 50): Promise<DraftRecord[]> {
  const state = await load();
  return state.drafts.slice(0, limit);
}

export async function listDueAutoSends(now = new Date()): Promise<DraftRecord[]> {
  const state = await load();
  return state.drafts.filter(
    (d) => d.status === "auto_send_scheduled" && d.autoSendAt && new Date(d.autoSendAt) <= now,
  );
}

export interface UpdateFields {
  draftBody?: string;
  status?: DraftStatus;
  sentAt?: string;
  sentMessageId?: string;
  rejectionReason?: string;
  autoSendAt?: string | null;
}

export function update(id: string, fields: UpdateFields): Promise<DraftRecord> {
  return chain(async () => {
    const state = await load();
    const draft = state.drafts.find((d) => d.id === id);
    if (!draft) {
      throw new Error(`draft ${id} not found`);
    }
    if (fields.draftBody !== undefined) draft.draftBody = fields.draftBody;
    if (fields.status !== undefined) draft.status = fields.status;
    if (fields.sentAt !== undefined) draft.sentAt = fields.sentAt;
    if (fields.sentMessageId !== undefined) draft.sentMessageId = fields.sentMessageId;
    if (fields.rejectionReason !== undefined) draft.rejectionReason = fields.rejectionReason;
    if (fields.autoSendAt !== undefined) {
      draft.autoSendAt = fields.autoSendAt ?? undefined;
    }
    await persist(state);
    return { ...draft };
  });
}

export function _resetForTests(): void {
  cache = null;
  cachedPath = null;
  writeChain = Promise.resolve();
}
