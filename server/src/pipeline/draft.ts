import { getAnthropic, MODELS } from "../anthropic.ts";
import type { Category, ClientContext, Draft, InboundMessage } from "../types.ts";

const BASE_SYSTEM = `You draft replies in the practitioner's voice for a solo health/wellness practice using Practice Better.

Hard rules:
- Write in first person as the practitioner. Concise (2-5 sentences) unless the client clearly needs more.
- Match the client's tone: warm, professional, plain language.
- Never invent clinical facts, dates, dosages, lab values, dollar amounts, or appointment specifics. If unknown, ask one clarifying question or leave a short [bracketed placeholder] for the practitioner to fill in.
- For anything beyond scheduling, logistics, intake, or general encouragement, defer to the practitioner rather than giving medical advice.
- Use a short sign-off only if the existing thread style uses one.
- Output ONLY the reply text. No preamble, no quotes, no explanation, no markdown fences.`;

const CATEGORY_HINTS: Record<Category, string> = {
  scheduling: "This is a scheduling-related message. If the client proposes a time, confirm or offer 2 alternatives. If they ask about availability without proposing a time, point them at the booking link [BOOKING_LINK] or offer 2 specific options.",
  intake: "This is an intake/onboarding message. Refer to specific intake forms by name when known; otherwise leave [INTAKE_FORM_NAME] as a placeholder.",
  document_request: "Client is asking for a document (receipt, superbill, records, summary). Confirm the request, give realistic turnaround ([TURNAROUND]), and ask any clarifying detail needed (date range, format).",
  admin: "Administrative/logistics question (login, location, hours). Answer plainly. If you don't know, leave [PLACEHOLDER].",
  clinical_question: "Clinical question. Do NOT give clinical advice. Acknowledge the concern, gather one clarifying fact, and indicate the practitioner will follow up.",
  billing: "Billing or payment question. Acknowledge, do NOT make commitments about refunds or pricing. Defer specifics to the practitioner.",
  complaint: "Client is upset. Acknowledge feelings, take ownership, do NOT be defensive, and propose a concrete next step (call, follow-up time).",
  crisis: "DO NOT generate a normal reply. Instead, generate a brief safety-aware acknowledgement and direct them to immediate resources (988 / 911 / their local emergency services) and indicate the practitioner has been alerted.",
  other: "Category unclear. Ask one clarifying question to narrow it down.",
};

interface DraftInput {
  message: InboundMessage;
  category: Category;
  voiceProfile?: string;
  ragChunks?: string[];
  clientContext?: ClientContext;
}

function buildSystemBlocks(input: DraftInput) {
  const blocks: Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }> = [];
  blocks.push({ type: "text", text: BASE_SYSTEM, cache_control: { type: "ephemeral" } });
  if (input.voiceProfile && input.voiceProfile.trim()) {
    blocks.push({
      type: "text",
      text: `# Practitioner voice profile\n${input.voiceProfile.trim()}`,
      cache_control: { type: "ephemeral" },
    });
  }
  if (input.ragChunks && input.ragChunks.length) {
    blocks.push({
      type: "text",
      text: `# Practice SOP / FAQ excerpts\n${input.ragChunks.map((c, i) => `[${i + 1}] ${c}`).join("\n\n")}`,
      cache_control: { type: "ephemeral" },
    });
  }
  return blocks;
}

function buildUser(input: DraftInput): string {
  const ctx = input.clientContext;
  const ctxLines: string[] = [];
  if (ctx) {
    ctxLines.push(`Client: ${ctx.clientName} (id ${ctx.clientId})`);
    if (ctx.intakeSummary) ctxLines.push(`Intake summary: ${ctx.intakeSummary}`);
    if (ctx.recentAppointments?.length) {
      ctxLines.push(
        "Recent appointments:\n" +
          ctx.recentAppointments
            .map((a) => `  - ${a.date} ${a.type}${a.notes ? ` — ${a.notes}` : ""}`)
            .join("\n"),
      );
    }
    if (ctx.formHighlights?.length) {
      ctxLines.push(
        "Relevant form answers:\n" +
          ctx.formHighlights.map((f) => `  - ${f.form} / ${f.field}: ${f.value}`).join("\n"),
      );
    }
  }
  const thread = input.message.history
    .map((h) => `[${h.role} @ ${h.sentAt}] ${h.body}`)
    .join("\n");
  return [
    `# Category\n${input.category} — ${CATEGORY_HINTS[input.category]}`,
    ctxLines.length ? `# Client context\n${ctxLines.join("\n")}` : "",
    `# Thread (oldest -> newest)\n${thread}`,
    `# New inbound message\n${input.message.body}`,
    `Draft the practitioner's next reply now.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function draft(input: DraftInput): Promise<Draft> {
  const anthropic = getAnthropic();
  const model = input.category === "complaint" || input.category === "clinical_question"
    ? MODELS.drafterEscalation
    : MODELS.draft;

  const res = await anthropic.messages.create({
    model,
    max_tokens: 600,
    system: buildSystemBlocks(input),
    messages: [{ role: "user", content: buildUser(input) }],
  });

  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("\n")
    .trim();

  return {
    text,
    model: res.model,
    usage: {
      input_tokens: res.usage.input_tokens,
      output_tokens: res.usage.output_tokens,
      cache_read_input_tokens: res.usage.cache_read_input_tokens ?? undefined,
    },
  };
}
