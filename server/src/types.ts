export type Category =
  | "scheduling"
  | "intake"
  | "document_request"
  | "admin"
  | "clinical_question"
  | "billing"
  | "complaint"
  | "crisis"
  | "other";

export const SAFE_CATEGORIES: ReadonlySet<Category> = new Set([
  "scheduling",
  "intake",
  "document_request",
  "admin",
]);

export const ALWAYS_REVIEW_CATEGORIES: ReadonlySet<Category> = new Set([
  "clinical_question",
  "billing",
  "complaint",
]);

export interface InboundMessage {
  id: string;
  clientId: string;
  clientName: string;
  receivedAt: string;
  threadId: string;
  body: string;
  history: Array<{ role: "client" | "practitioner"; body: string; sentAt: string }>;
}

export interface ClientContext {
  clientId: string;
  clientName: string;
  intakeSummary?: string;
  recentAppointments?: Array<{ date: string; type: string; notes?: string }>;
  formHighlights?: Array<{ form: string; field: string; value: string }>;
}

export interface Classification {
  category: Category;
  confidence: number;
  rationale: string;
}

export interface GuardrailResult {
  pass: boolean;
  violations: Array<{ rule: string; detail: string }>;
}

export type PolicyDecision =
  | { action: "auto_send"; reason: string }
  | { action: "queue_review"; reason: string }
  | { action: "block"; reason: string };

export interface Draft {
  text: string;
  model: string;
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number };
}

export interface PipelineResult {
  message: InboundMessage;
  classification: Classification;
  draft: Draft;
  guardrails: GuardrailResult;
  policy: PolicyDecision;
}
