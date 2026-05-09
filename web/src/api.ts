import type { DraftRecord } from "./types.ts";

async function http<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${init?.method ?? "GET"} ${input} -> ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

export function listPending(): Promise<{ drafts: DraftRecord[] }> {
  return http("/api/drafts?status=pending");
}

export function listRecent(limit = 50): Promise<{ drafts: DraftRecord[] }> {
  return http(`/api/drafts?status=recent&limit=${limit}`);
}

export function approveDraft(id: string, text?: string): Promise<DraftRecord> {
  return http(`/api/drafts/${id}/approve`, {
    method: "POST",
    body: JSON.stringify(text ? { text } : {}),
  });
}

export function editDraft(id: string, text: string): Promise<DraftRecord> {
  return http(`/api/drafts/${id}/edit`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export function rejectDraft(id: string, reason?: string): Promise<DraftRecord> {
  return http(`/api/drafts/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function cancelAutosend(id: string): Promise<DraftRecord> {
  return http(`/api/drafts/${id}/cancel-autosend`, { method: "POST" });
}

export function simulateMessage(body: string, clientName?: string): Promise<DraftRecord> {
  return http(`/api/dev/simulate`, {
    method: "POST",
    body: JSON.stringify({ body, clientName }),
  });
}
