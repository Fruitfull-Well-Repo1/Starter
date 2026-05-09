import { useEffect, useState } from "react";
import * as api from "../api.ts";
import type { DraftRecord } from "../types.ts";
import { DraftCard } from "../components/DraftCard.tsx";

const POLL_MS = 10_000;

export function Inbox() {
  const [drafts, setDrafts] = useState<DraftRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bumpKey, setBumpKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const { drafts } = await api.listPending();
        if (!cancelled) {
          setDrafts(drafts);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    }
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [bumpKey]);

  if (error && !drafts) return <div className="empty">Couldn’t load drafts: {error}</div>;
  if (!drafts) return <div className="empty">Loading…</div>;
  if (drafts.length === 0) {
    return <div className="empty">Inbox zero. Nothing waiting on you.</div>;
  }

  return (
    <div>
      {drafts.map((d) => (
        <DraftCard key={d.id} draft={d} onChange={() => setBumpKey((k) => k + 1)} />
      ))}
    </div>
  );
}
