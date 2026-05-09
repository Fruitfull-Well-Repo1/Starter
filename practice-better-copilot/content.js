const STATE = {
  panel: null,
  button: null,
  lastDraft: "",
  busy: false,
  savedSelector: "",
  picking: false,
};

async function loadSavedSelector() {
  const { threadSelector } = await chrome.storage.local.get(["threadSelector"]);
  STATE.savedSelector = threadSelector || "";
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.threadSelector) {
    STATE.savedSelector = changes.threadSelector.newValue || "";
    renderSavedSelector();
  }
});

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
      <div class="pbcp-selector-row">
        <div class="pbcp-selector-info">
          <span class="pbcp-selector-label">Thread source:</span>
          <code data-role="saved-selector">auto</code>
        </div>
        <div class="pbcp-selector-actions">
          <button type="button" class="pbcp-btn pbcp-btn-ghost pbcp-btn-sm" data-action="pick">Pick thread</button>
          <button type="button" class="pbcp-btn pbcp-btn-ghost pbcp-btn-sm" data-action="clear-pick">Clear</button>
        </div>
      </div>
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
    if (action === "pick") startPicker();
    if (action === "clear-pick") clearSavedSelector();
  });

  return panel;
}

function showPanel() {
  STATE.panel.classList.add("pbcp-open");
  renderSavedSelector();
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

function renderSavedSelector() {
  if (!STATE.panel) return;
  const el = STATE.panel.querySelector('[data-role="saved-selector"]');
  el.textContent = STATE.savedSelector || "auto";
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
  const configured = (STATE.savedSelector || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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
    let el;
    try {
      el = document.querySelector(selector);
    } catch {
      continue;
    }
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
  if (STATE.busy || STATE.picking) return;
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

  setStatus(`Drafting with Claude (${text.length} chars, source: ${selector})...`, "info");

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

// ----- Element picker -----

let PICKER = null;

function startPicker() {
  if (STATE.picking) return;
  STATE.picking = true;
  hidePanel();

  const overlay = document.createElement("div");
  overlay.id = "pbcp-picker-overlay";
  const highlight = document.createElement("div");
  highlight.id = "pbcp-picker-highlight";
  const hint = document.createElement("div");
  hint.id = "pbcp-picker-hint";
  hint.textContent = "Click the message thread. Esc to cancel.";
  document.body.appendChild(overlay);
  document.body.appendChild(highlight);
  document.body.appendChild(hint);

  PICKER = { overlay, highlight, hint, current: null };

  document.addEventListener("mousemove", onPickerMove, true);
  document.addEventListener("click", onPickerClick, true);
  document.addEventListener("keydown", onPickerKey, true);
}

function stopPicker() {
  if (!STATE.picking) return;
  STATE.picking = false;
  document.removeEventListener("mousemove", onPickerMove, true);
  document.removeEventListener("click", onPickerClick, true);
  document.removeEventListener("keydown", onPickerKey, true);
  PICKER?.overlay?.remove();
  PICKER?.highlight?.remove();
  PICKER?.hint?.remove();
  PICKER = null;
  showPanel();
}

function onPickerMove(e) {
  const el = pickTarget(e.clientX, e.clientY);
  if (!el || el === PICKER.current) return;
  PICKER.current = el;
  const r = el.getBoundingClientRect();
  const h = PICKER.highlight;
  h.style.transform = `translate(${r.left}px, ${r.top}px)`;
  h.style.width = `${r.width}px`;
  h.style.height = `${r.height}px`;
}

function onPickerClick(e) {
  if (!PICKER?.current) return;
  e.preventDefault();
  e.stopPropagation();
  const el = PICKER.current;
  const selector = buildSelector(el);
  chrome.storage.local.set({ threadSelector: selector });
  STATE.savedSelector = selector;
  stopPicker();
  renderSavedSelector();
  setStatus(`Saved selector: ${selector}. Drafting...`, "success");
  onDraftClick();
}

function onPickerKey(e) {
  if (e.key === "Escape") {
    e.preventDefault();
    stopPicker();
  }
}

function pickTarget(x, y) {
  const els = document.elementsFromPoint(x, y);
  for (const el of els) {
    if (!el) continue;
    if (el.id && el.id.startsWith("pbcp-")) continue;
    if (el.closest("#pbcp-panel, #pbcp-fab, #pbcp-picker-overlay, #pbcp-picker-highlight, #pbcp-picker-hint"))
      continue;
    return el;
  }
  return null;
}

function buildSelector(el) {
  if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) {
    return `#${CSS.escape(el.id)}`;
  }
  for (const attr of ["data-testid", "data-test", "data-cy", "aria-label"]) {
    const val = el.getAttribute(attr);
    if (val) {
      const s = `[${attr}="${CSS.escape(val)}"]`;
      if (document.querySelectorAll(s).length === 1) return s;
    }
  }
  const path = [];
  let node = el;
  while (node && node.nodeType === 1 && node !== document.body && path.length < 5) {
    let part = node.tagName.toLowerCase();
    const cls = Array.from(node.classList)
      .filter((c) => !c.startsWith("pbcp-") && !/^ng-|^css-/.test(c) && c.length < 40)
      .slice(0, 2);
    if (cls.length) part += "." + cls.map((c) => CSS.escape(c)).join(".");
    path.unshift(part);
    if (document.querySelectorAll(path.join(" > ")).length === 1) return path.join(" > ");
    node = node.parentElement;
  }
  return path.join(" > ") || el.tagName.toLowerCase();
}

async function clearSavedSelector() {
  await chrome.storage.local.set({ threadSelector: "" });
  STATE.savedSelector = "";
  renderSavedSelector();
  setStatus("Cleared. Auto-detection will be used.", "info");
}

function init() {
  if (document.getElementById("pbcp-fab")) return;
  STATE.button = createFab();
  loadSavedSelector();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
