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
  category: Category;
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
