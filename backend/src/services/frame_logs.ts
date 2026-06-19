/**
 * In-memory ring buffer of frame MQTT / device traffic for the /devs console.
 */

export type FrameLogDirection = "rx" | "tx";

export type FrameLogEntry = {
  id: string;
  atMs: number;
  direction: FrameLogDirection;
  mac: string;
  frameName: string | null;
  topic: string;
  action: string | null;
  payload: string;
};

const MAX_LOGS = 5000;
const logs: FrameLogEntry[] = [];
const listeners = new Set<(entry: FrameLogEntry) => void>();

let seq = 0;

function nextId(): string {
  seq += 1;
  return `flog_${Date.now()}_${seq}`;
}

export function appendFrameLog(
  partial: Omit<FrameLogEntry, "id" | "atMs"> & { atMs?: number },
): FrameLogEntry {
  const entry: FrameLogEntry = {
    id: nextId(),
    atMs: partial.atMs ?? Date.now(),
    direction: partial.direction,
    mac: partial.mac,
    frameName: partial.frameName ?? null,
    topic: partial.topic,
    action: partial.action ?? null,
    payload: partial.payload,
  };
  logs.push(entry);
  if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
  for (const fn of listeners) {
    try {
      fn(entry);
    } catch {
      /* ignore listener errors */
    }
  }
  return entry;
}

export function subscribeFrameLogs(listener: (entry: FrameLogEntry) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export type FrameLogQuery = {
  mac?: string;
  name?: string;
  q?: string;
  since?: number;
  limit?: number;
};

export function getFrameLogs(query: FrameLogQuery = {}): FrameLogEntry[] {
  const macQ = (query.mac ?? "").replace(/[^a-fA-F0-9]/gi, "").toUpperCase();
  const nameQ = (query.name ?? "").trim().toLowerCase();
  const textQ = (query.q ?? "").trim().toLowerCase();
  const since = Number(query.since ?? 0) || 0;
  const limit = Math.min(2000, Math.max(1, Number(query.limit ?? 500) || 500));

  let out = logs.slice();
  if (since > 0) out = out.filter((e) => e.atMs >= since);
  if (macQ) out = out.filter((e) => e.mac.includes(macQ));
  if (nameQ) out = out.filter((e) => (e.frameName ?? "").toLowerCase().includes(nameQ));
  if (textQ) {
    out = out.filter((e) => {
      const hay = [
        e.mac,
        e.frameName ?? "",
        e.topic,
        e.action ?? "",
        e.payload,
        e.direction,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(textQ);
    });
  }
  return out.slice(-limit);
}

export function getLogStats(): { messagesPerMin: number; total: number } {
  const now = Date.now();
  const messagesPerMin = logs.filter((e) => e.atMs >= now - 60_000).length;
  return { messagesPerMin, total: logs.length };
}

/** Backfill recent server-side events so /devs is useful before live MQTT traffic arrives. */
export function seedFrameLogsFromAudit(
  auditRows: Array<{
    atMs: number;
    action: string;
    target: string;
    meta?: Record<string, unknown>;
  }>,
): void {
  if (logs.length > 0) return;
  for (const row of auditRows.slice(0, 100)) {
    if (!row.target) continue;
    const mac = row.target.replace(/[^a-fA-F0-9]/gi, "").toUpperCase().slice(-12);
    if (mac.length < 6) continue;
    appendFrameLog({
      atMs: row.atMs,
      direction: row.action.includes("send") || row.action.includes("ota") ? "tx" : "rx",
      mac,
      frameName: row.target,
      topic: row.action === "device_send" ? `/inkjoyap/${mac}` : `/device/report/${mac}`,
      action: row.action,
      payload: JSON.stringify(row.meta ?? { action: row.action }),
    });
  }
}
