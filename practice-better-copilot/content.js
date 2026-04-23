const STATE = {
  panel: null,
  button: null,
  lastDraft: "",
  busy: false,
};

function createFab() {
  const btn = document.createElement("button");
  btn.id = "pbcp-fab";
  btn.type = "button";
  btn.title = "Draft reply with Claude";
  btn.innerHTML = `<span class="pbcp-fab-icon">✨</span><span class="pbcp-fab-label">Draft reply</span>`;
  btn.addEventListener("click", onDraftClick);
  document.body.appendChild(btn);
  return btn;
}

function createPanel() {
  const panel = document.createElement("aside");
  panel.id = "pbcp-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Claude draft reply");
  panel.innerHTML = `
    <header class="pbcp-panel-header">
      <span class="pbcp-panel-title">Draft reply</span>
      <div class="pbcp-panel-actions-top">
        <button type="button" class="pbcp-icon-btn" data-action="settings" title="Settings">⚙</button>
        <button type="button" class="pbcp-icon-btn" data-action="close" title="Close">✕</button>
      </div>
    </header>
    <div class="pbcp-panel-body">
      <div class="pbcp-status" data-role="status">Reading the thread...</div>
      <textarea class="pbcp-draft" data-role="draft" spellcheck="true" rows="10" placeholder="Your draft will appear here..."></textarea>
    </div>
    <footer class="pbcp-panel-footer">
      <button type="button" class="pbcp-btn pbcp-btn-ghost" data-action="regenerate">Regenerate</button>
      <button type="button" class="pbcp-btn pbcp-btn-primary" data-action="copy">Copy</button>
    </footer>
  `;
  document.body.appendChild(panel);

  panel.addEventListener("click", (e) => {
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    if (action === "close") hidePanel();
    if (action === "settings") chrome.runtime.sendMessage({ type: "openOptions" });
    if (action === "copy") copyDraft();
    if (action === "regenerate") onDraftClick();
  });

  return panel;
}

function showPanel() {
  STATE.panel.classList.add("pbcp-open");
}

function hidePanel() {
  STATE.panel.classList.remove("pbcp-open");
}

function setStatus(text, tone = "info") {
  const el = STATE.panel.querySelector('[data-role="status"]');
  el.textContent = text;
  el.dataset.tone = tone;
}

function setDraft(text) {
  STATE.lastDraft = text;
  STATE.panel.querySelector('[data-role="draft"]').value = text;
}

async function copyDraft() {
  const text = STATE.panel.querySelector('[data-role="draft"]').value;
  try {
    await navigator.clipboard.writeText(text);
    setStatus("Copied to clipboard.", "success");
  } catch (err) {
    setStatus("Could not copy: " + err.message, "error");
  }
}

function extractThread() {
  const selectorsRaw = document.documentElement.dataset.pbcpThreadSelector || "";
  const configured = selectorsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  const candidates = [
    ...configured,
    '[data-testid*="message" i]',
    '[class*="message-thread" i]',
    '[class*="conversation" i]',
    '[class*="messages" i]',
    'main [role="log"]',
    "main",
  ];

  for (const selector of candidates) {
    const el = document.querySelector(selector);
    if (el && el.innerText && el.innerText.trim().length > 40) {
      return { text: el.innerText.trim(), selector };
    }
  }
  return { text: document.body.innerText.trim().slice(0, 8000), selector: "body (fallback)" };
}

function guessClientName() {
  const heading = document.querySelector("h1, h2, [class*='client-name' i]");
  return heading?.innerText?.trim()?.split("\n")[0]?.slice(0, 80) || "";
}

async function onDraftClick() {
  if (STATE.busy) return;
  STATE.busy = true;

  if (!STATE.panel) STATE.panel = createPanel();
  showPanel();
  setStatus("Reading the thread...", "info");
  setDraft("");

  const { text, selector } = extractThread();
  if (!text) {
    setStatus("Could not find message thread on this page.", "error");
    STATE.busy = false;
    return;
  }

  setStatus(`Drafting with Claude (source: ${selector})...`, "info");

  try {
    const resp = await chrome.runtime.sendMessage({
      type: "draftReply",
      payload: { threadText: text, clientName: guessClientName() },
    });
    if (!resp?.ok) throw new Error(resp?.error || "Unknown error");
    setDraft(resp.result.text);
    setStatus("Draft ready. Review before sending.", "success");
  } catch (err) {
    setStatus(err.message, "error");
  } finally {
    STATE.busy = false;
  }
}

function init() {
  if (document.getElementById("pbcp-fab")) return;
  STATE.button = createFab();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
