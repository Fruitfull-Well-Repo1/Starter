import { useState } from "react";
import * as api from "../api.ts";

export function Settings() {
  const [body, setBody] = useState("Hi! Could we move my Thursday appointment to Friday afternoon?");
  const [clientName, setClientName] = useState("Sim Client");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function inject() {
    setBusy(true);
    setError(null);
    try {
      const rec = await api.simulateMessage(body, clientName);
      setLast(`Enqueued ${rec.id} as ${rec.status} (${rec.category}, ${Math.round(rec.confidence * 100)}%)`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings">
      <h2 style={{ marginTop: 0 }}>Dev simulator</h2>
      <p style={{ color: "var(--muted)", fontSize: 13 }}>
        Inject a fake inbound client message; it runs through the full pipeline and shows up in the
        Inbox. Useful for trying the system before PB API access lands.
      </p>

      <label htmlFor="sim-name">Client name</label>
      <input
        id="sim-name"
        type="text"
        value={clientName}
        onChange={(e) => setClientName(e.target.value)}
      />

      <label htmlFor="sim-body">Inbound message</label>
      <textarea id="sim-body" value={body} onChange={(e) => setBody(e.target.value)} />

      <div style={{ marginTop: 12 }}>
        <button className="btn primary" disabled={busy || !body.trim()} onClick={inject}>
          Inject simulated message
        </button>
      </div>

      {last && <div style={{ color: "var(--muted)", marginTop: 10, fontSize: 13 }}>{last}</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
