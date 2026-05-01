import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set. Copy .env.example to .env and fill it in.");
  }
  client = new Anthropic({ apiKey });
  return client;
}

export const MODELS = {
  classify: process.env.SIM_MODEL_CLASSIFY ?? "claude-haiku-4-5-20251001",
  draft: process.env.SIM_MODEL_DRAFT ?? "claude-sonnet-4-6",
  drafterEscalation: "claude-opus-4-7",
} as const;
