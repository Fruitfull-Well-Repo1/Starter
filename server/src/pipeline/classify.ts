import { getAnthropic, MODELS } from "../anthropic.ts";
import type { Category, Classification, InboundMessage } from "../types.ts";

const CATEGORIES: Category[] = [
  "scheduling",
  "intake",
  "document_request",
  "admin",
  "clinical_question",
  "billing",
  "complaint",
  "crisis",
  "other",
];

const SYSTEM = `You triage inbound messages from clients of a solo health/wellness practitioner.

Categories:
- scheduling: book/reschedule/cancel appointments, time inquiries, availability.
- intake: new-client paperwork, intake forms, onboarding logistics.
- document_request: clients asking for receipts, invoices, superbills, records, summaries.
- admin: portal/login issues, contact details, location, hours, address, parking.
- clinical_question: anything about symptoms, treatment plans, supplements, dosages, labs, side effects, diagnoses.
- billing: payment problems, refund requests, insurance, pricing disputes.
- complaint: client expressing frustration, dissatisfaction, threatening to leave.
- crisis: any indication of self-harm, suicidal ideation, abuse, severe symptom escalation, legal threats, emergencies.
- other: doesn't fit above; ambiguous.

Output strict JSON only. No prose, no markdown fences.`;

const SCHEMA_HINT = `{"category":"<one of: ${CATEGORIES.join("|")}>","confidence":<0..1>,"rationale":"<one short sentence>"}`;

function buildUser(message: InboundMessage): string {
  const recent = message.history.slice(-4).map((h) => `[${h.role}] ${h.body}`).join("\n");
  return [
    recent ? `Recent thread:\n${recent}\n` : "",
    `New inbound message from ${message.clientName}:`,
    message.body,
    "",
    `Reply with JSON matching this shape:\n${SCHEMA_HINT}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function safeParse(raw: string): Classification {
  const trimmed = raw.trim().replace(/^```json\s*|\s*```$/g, "");
  const parsed = JSON.parse(trimmed) as Partial<Classification>;
  const category = CATEGORIES.includes(parsed.category as Category)
    ? (parsed.category as Category)
    : "other";
  const confidence = typeof parsed.confidence === "number"
    ? Math.max(0, Math.min(1, parsed.confidence))
    : 0;
  const rationale = typeof parsed.rationale === "string" ? parsed.rationale : "";
  return { category, confidence, rationale };
}

export async function classify(message: InboundMessage): Promise<Classification> {
  const anthropic = getAnthropic();
  const res = await anthropic.messages.create({
    model: MODELS.classify,
    max_tokens: 200,
    system: [
      {
        type: "text",
        text: SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: buildUser(message) }],
  });
  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("\n");
  try {
    return safeParse(text);
  } catch (err) {
    return {
      category: "other",
      confidence: 0,
      rationale: `Parse error: ${(err as Error).message}; raw=${text.slice(0, 120)}`,
    };
  }
}
