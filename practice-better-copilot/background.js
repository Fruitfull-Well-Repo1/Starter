const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_SYSTEM_PROMPT = `You are a reply-drafting assistant for a health/wellness practitioner using Practice Better. You draft replies to client messages in the practitioner's voice.

Guidelines:
- Write in first person as the practitioner.
- Match the client's tone: warm, professional, concise.
- Do NOT invent clinical facts, dates, dosages, or appointment details. If something is unknown, ask a clarifying question or leave a short [bracketed placeholder] for the practitioner to fill in.
- Never give medical advice beyond what a non-licensed support person would say. For anything beyond scheduling, logistics, or general encouragement, defer to the practitioner.
- Keep replies short (2-5 sentences) unless the client's message clearly needs more.
- No sign-off unless the thread style uses one.

Output only the reply text. No preamble, no quotes, no explanation.`;

async function getSettings() {
  const { apiKey, model, systemPrompt } = await chrome.storage.local.get([
    "apiKey",
    "model",
    "systemPrompt",
  ]);
  return {
    apiKey: apiKey || "",
    model: model || DEFAULT_MODEL,
    systemPrompt: systemPrompt || DEFAULT_SYSTEM_PROMPT,
  };
}

async function draftReply({ threadText, clientName }) {
  const { apiKey, model, systemPrompt } = await getSettings();
  if (!apiKey) {
    throw new Error("No API key set. Open the extension options to add your Anthropic API key.");
  }

  const userMessage = [
    clientName ? `Client: ${clientName}` : null,
    "",
    "Conversation so far (oldest to newest):",
    threadText,
    "",
    "Draft the practitioner's next reply.",
  ]
    .filter((line) => line !== null)
    .join("\n");

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${body}`);
  }

  const data = await res.json();
  const text = (data.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  return { text, model: data.model, usage: data.usage };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "draftReply") {
    draftReply(msg.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (msg?.type === "openOptions") {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }
  return false;
});
