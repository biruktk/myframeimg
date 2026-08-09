/**
 * In-memory MQTT frame log ring buffer (rx/tx/system) backing the /devs portal.
 * Lives only in this process; survives nothing across restarts (documented as such).
 */

export type FrameLogDirection = "rx" | "tx" | "system";

export type FrameLogEntry = {
  id: string;
  atMs: number;
  direction: FrameLogDirection;
  source: string;
  mac: string;
  frameName?: string;
  topic?: string;
  action?: string;
  payload?: string;
};

const RING_CAP = 2000;
const ring: FrameLogEntry[] = [];
const subscribers = new Set<(entry: FrameLogEntry) => void>();

export function appendFrameLog(entry: FrameLogEntry): void {
  const e: FrameLogEntry = {
    ...entry,
    id: entry.id || `log_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    atMs: entry.atMs || Date.now(),
    payload: entry.payload ? entry.payload.slice(0, 2000) : undefined,
  };
  ring.push(e);
  if (ring.length > RING_CAP) ring.splice(0, ring.length - RING_CAP);
  for (const cb of subscribers) {
    try {
      cb(e);
    } catch {
      /* subscriber error ignored */
    }
  }
}

export function getFrameLogs(opts: {
  mac?: string;
  name?: string;
  q?: string;
  source?: string;
  since?: number;
  limit?: number;
}): FrameLogEntry[] {
  const macQ = (opts.mac ?? "").replace(/[^a-fA-F0-9]/gi, "").toUpperCase();
  const nameQ = (opts.name ?? "").trim().toLowerCase();
  const textQ = (opts.q ?? "").trim().toLowerCase();
  const sourceQ = (opts.source ?? "").trim().toLowerCase();
  const since = Number(opts.since ?? 0) || 0;
  const limit = Number(opts.limit ?? 500) || 500;
  const out: FrameLogEntry[] = [];
  for (const e of ring) {
    if (since && e.atMs < since) continue;
    if (sourceQ && (e.source ?? "").toLowerCase() !== sourceQ) continue;
    if (macQ && !(e.mac ?? "").includes(macQ)) continue;
    if (nameQ && !(e.frameName ?? "").toLowerCase().includes(nameQ)) continue;
    if (textQ) {
      const hay = [e.mac, e.frameName ?? "", e.topic ?? "", e.action ?? "", e.payload ?? "", e.direction]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(textQ)) continue;
    }
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}

export function getLogStats(): { total: number; messagesPerMin: number } {
  const now = Date.now();
  let perMin = 0;
  for (let i = ring.length - 1; i >= 0; i -= 1) {
    if (ring[i].atMs < now - 60_000) break;
    perMin += 1;
  }
  return { total: ring.length, messagesPerMin: perMin };
}

export function subscribeFrameLogs(cb: (entry: FrameLogEntry) => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}
