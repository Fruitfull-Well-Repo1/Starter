import { getPBClient } from "../pb/client.ts";
import { listDueAutoSends, update, type DraftRecord } from "../store/queue.ts";
import { audit } from "../audit/log.ts";

export interface SchedulerHandle {
  stop(): void;
}

async function processDue(): Promise<void> {
  const due = await listDueAutoSends();
  if (due.length === 0) return;
  const pb = getPBClient();
  for (const d of due) {
    await sendOne(d, pb);
  }
}

async function sendOne(draft: DraftRecord, pb: ReturnType<typeof getPBClient>): Promise<void> {
  try {
    const sent = await pb.sendMessage(draft.threadId, draft.draftBody);
    await update(draft.id, {
      status: "auto_sent",
      sentAt: new Date().toISOString(),
      sentMessageId: sent.id,
      autoSendAt: null,
    });
    await audit("scheduler.auto_sent", {
      draft_id: draft.id,
      sent_id: sent.id,
    });
  } catch (err) {
    await audit("scheduler.send_error", {
      draft_id: draft.id,
      error: (err as Error).message,
    });
  }
}

export function startAutoSendScheduler(intervalMs = 5000): SchedulerHandle {
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  const tick = async () => {
    if (stopped) return;
    try {
      await processDue();
    } catch (err) {
      await audit("scheduler.error", { error: (err as Error).message });
    }
    if (!stopped) {
      timer = setTimeout(tick, intervalMs);
    }
  };

  timer = setTimeout(tick, intervalMs);

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
