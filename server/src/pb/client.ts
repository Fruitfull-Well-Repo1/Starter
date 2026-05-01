import type {
  PBAppointment,
  PBClientProfile,
  PBFormHighlight,
  PBMessage,
} from "./types.ts";

export interface PBClient {
  getClient(clientId: string): Promise<PBClientProfile>;
  getThreadMessages(threadId: string, limit?: number): Promise<PBMessage[]>;
  getRecentAppointments(clientId: string, limit?: number): Promise<PBAppointment[]>;
  getFormHighlights(clientId: string): Promise<PBFormHighlight[]>;
  sendMessage(threadId: string, body: string): Promise<{ id: string }>;
}

export class MockPBClient implements PBClient {
  async getClient(clientId: string): Promise<PBClientProfile> {
    return { id: clientId, name: `Mock Client ${clientId.slice(-3)}` };
  }
  async getThreadMessages(): Promise<PBMessage[]> {
    return [];
  }
  async getRecentAppointments(): Promise<PBAppointment[]> {
    return [];
  }
  async getFormHighlights(): Promise<PBFormHighlight[]> {
    return [];
  }
  async sendMessage(threadId: string, body: string): Promise<{ id: string }> {
    console.log(`[MOCK PB] sendMessage thread=${threadId} body=${body.slice(0, 80)}...`);
    return { id: `mock_${Date.now()}` };
  }
}

export class RealPBClient implements PBClient {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  private async req<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      throw new Error(`PB ${init.method ?? "GET"} ${path} -> ${res.status}: ${await res.text()}`);
    }
    return (await res.json()) as T;
  }

  async getClient(clientId: string): Promise<PBClientProfile> {
    return this.req<PBClientProfile>(`/clients/${clientId}`);
  }
  async getThreadMessages(threadId: string, limit = 20): Promise<PBMessage[]> {
    return this.req<PBMessage[]>(`/threads/${threadId}/messages?limit=${limit}`);
  }
  async getRecentAppointments(clientId: string, limit = 5): Promise<PBAppointment[]> {
    return this.req<PBAppointment[]>(`/clients/${clientId}/appointments?limit=${limit}`);
  }
  async getFormHighlights(clientId: string): Promise<PBFormHighlight[]> {
    return this.req<PBFormHighlight[]>(`/clients/${clientId}/forms/highlights`);
  }
  async sendMessage(threadId: string, body: string): Promise<{ id: string }> {
    return this.req<{ id: string }>(`/threads/${threadId}/messages`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  }
}

export function getPBClient(): PBClient {
  if (process.env.PB_API_KEY && process.env.PB_API_BASE_URL) {
    return new RealPBClient(process.env.PB_API_BASE_URL, process.env.PB_API_KEY);
  }
  return new MockPBClient();
}
