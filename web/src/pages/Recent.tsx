import { useEffect, useState } from "react";
import * as api from "../api.ts";
import type { DraftRecord } from "../types.ts";

export function Recent() {
  const [drafts, setDrafts] = useState<DraftRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const { drafts } = await api.listRecent(50);
        if (!cancelled) setDrafts(drafts);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    }
    refresh();
    const id = setInterval(refresh, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (error && !drafts) return <div className="empty">Couldn’t load: {error}</div>;
  if (!drafts) return <div className="empty">Loading…</div>;
  if (drafts.length === 0) return <div className="empty">No activity yet.</div>;

  return (
    <div>
      {drafts.map((d) => (
        <article key={d.id} className="draft-card">
          <div className="meta">
            <span className="client">{d.clientName}</span>
            <span className={`tag ${d.category}`}>{d.category.replace("_", " ")}</span>
            <span className={`tag status-${d.status}`}>{d.status.replace(/_/g, " ")}</span>
            <span>{new Date(d.createdAt).toLocaleString()}</span>
          </div>
          <div className="inbound">{d.inboundBody}</div>
          <div className="inbound">{d.draftBody}</div>
        </article>
      ))}
    </div>
  );
}
