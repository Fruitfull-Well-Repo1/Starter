import { useEffect, useState } from "react";
import type { DraftRecord } from "../types.ts";
import * as api from "../api.ts";

interface Props {
  draft: DraftRecord;
  onChange: () => void;
}

function useCountdown(target?: string): number {
  const [remaining, setRemaining] = useState(() =>
    target ? Math.max(0, new Date(target).getTime() - Date.now()) : 0,
  );
  useEffect(() => {
    if (!target) return;
    const tick = () => setRemaining(Math.max(0, new Date(target).getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [target]);
  return remaining;
}

function formatRemaining(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${s}s`;
}

export function DraftCard({ draft, onChange }: Props) {
  const [body, setBody] = useState(draft.draftBody);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remainingMs = useCountdown(draft.autoSendAt);
  const isScheduled = draft.status === "auto_send_scheduled" && remainingMs > 0;
  const edited = body !== draft.draftBody;
  const isFinal =
    draft.status === "auto_sent" ||
    draft.status === "sent_after_review" ||
    draft.status === "rejected";

  async function run<T>(fn: () => Promise<T>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`draft-card ${draft.status === "auto_send_scheduled" ? "scheduled" : ""} ${draft.status === "blocked" ? "blocked" : ""}`}>
      <div className="meta">
        <span className="client">{draft.clientName}</span>
        <span className={`tag ${draft.category}`}>{draft.category.replace("_", " ")}</span>
        <span className={`tag status-${draft.status}`}>{draft.status.replace(/_/g, " ")}</span>
        <span>conf {Math.round(draft.confidence * 100)}%</span>
        {draft.guardrailFlags.map((f) => (
          <span key={f} className="flag">
            {f}
          </span>
        ))}
        {isScheduled && (
          <span className="countdown">auto-sending in {formatRemaining(remainingMs)}</span>
        )}
      </div>

      <div className="inbound">{draft.inboundBody}</div>

      {isFinal ? (
        <div className="inbound">{draft.draftBody}</div>
      ) : (
        <textarea
          className="draft-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={busy}
        />
      )}

      {!isFinal && (
        <div className="actions">
          {isScheduled && (
            <button
              className="btn"
              disabled={busy}
              onClick={() => run(() => api.cancelAutosend(draft.id))}
            >
              Cancel auto-send
            </button>
          )}
          <button
            className="btn primary"
            disabled={busy || draft.status === "blocked" || !body.trim()}
            onClick={() => run(() => api.approveDraft(draft.id, edited ? body : undefined))}
          >
            {edited ? "Send edited" : isScheduled ? "Send now" : "Approve & send"}
          </button>
          {edited && (
            <button
              className="btn ghost"
              disabled={busy}
              onClick={() => run(() => api.editDraft(draft.id, body))}
            >
              Save draft only
            </button>
          )}
          <button
            className="btn danger"
            disabled={busy}
            onClick={() => run(() => api.rejectDraft(draft.id))}
          >
            Reject
          </button>
        </div>
      )}

      {error && <div className="error">{error}</div>}
    </article>
  );
}
