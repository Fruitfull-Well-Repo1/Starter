const FIELDS = ["apiKey", "model", "systemPrompt", "threadSelector"];

async function load() {
  const stored = await chrome.storage.local.get(FIELDS);
  const form = document.getElementById("settings-form");
  for (const name of FIELDS) {
    if (form.elements[name] && stored[name] != null) {
      form.elements[name].value = stored[name];
    }
  }
}

async function save(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const data = {};
  for (const name of FIELDS) {
    data[name] = form.elements[name]?.value ?? "";
  }
  await chrome.storage.local.set(data);
  const status = document.getElementById("save-status");
  status.textContent = "Saved.";
  setTimeout(() => (status.textContent = ""), 1800);
}

document.addEventListener("DOMContentLoaded", () => {
  load();
  document.getElementById("settings-form").addEventListener("submit", save);
});
