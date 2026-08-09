"use strict";
/**
 * In-memory ring buffer of frame MQTT / device traffic for the /devs console.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.appendFrameLog = appendFrameLog;
exports.subscribeFrameLogs = subscribeFrameLogs;
exports.getFrameLogs = getFrameLogs;
exports.getLogStats = getLogStats;
exports.seedFrameLogsFromAudit = seedFrameLogsFromAudit;
const MAX_LOGS = 5000;
const logs = [];
const listeners = new Set();
let seq = 0;
function nextId() {
    seq += 1;
    return `flog_${Date.now()}_${seq}`;
}
function appendFrameLog(partial) {
    const entry = {
        id: nextId(),
        atMs: partial.atMs ?? Date.now(),
        direction: partial.direction,
        source: partial.source,
        mac: partial.mac,
        frameName: partial.frameName ?? null,
        topic: partial.topic,
        action: partial.action ?? null,
        payload: partial.payload,
    };
    logs.push(entry);
    if (logs.length > MAX_LOGS)
        logs.splice(0, logs.length - MAX_LOGS);
    for (const fn of listeners) {
        try {
            fn(entry);
        }
        catch {
            /* ignore listener errors */
        }
    }
    return entry;
}
function subscribeFrameLogs(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
function getFrameLogs(query = {}) {
    const macQ = (query.mac ?? "").replace(/[^a-fA-F0-9]/gi, "").toUpperCase();
    const nameQ = (query.name ?? "").trim().toLowerCase();
    const textQ = (query.q ?? "").trim().toLowerCase();
    const sourceQ = (query.source ?? "").trim().toLowerCase();
    const since = Number(query.since ?? 0) || 0;
    const limit = Math.min(2000, Math.max(1, Number(query.limit ?? 500) || 500));
    let out = logs.slice();
    if (since > 0)
        out = out.filter((e) => e.atMs >= since);
    if (sourceQ)
        out = out.filter((e) => (e.source ?? "").toLowerCase() === sourceQ);
    if (macQ)
        out = out.filter((e) => e.mac.includes(macQ));
    if (nameQ)
        out = out.filter((e) => (e.frameName ?? "").toLowerCase().includes(nameQ));
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
function getLogStats() {
    const now = Date.now();
    const messagesPerMin = logs.filter((e) => e.atMs >= now - 60000).length;
    return { messagesPerMin, total: logs.length };
}
/** Backfill recent server-side events so /devs is useful before live MQTT traffic arrives. */
function seedFrameLogsFromAudit(auditRows) {
    if (logs.length > 0)
        return;
    for (const row of auditRows.slice(0, 100)) {
        if (!row.target)
            continue;
        const mac = row.target.replace(/[^a-fA-F0-9]/gi, "").toUpperCase().slice(-12);
        if (mac.length < 6)
            continue;
        appendFrameLog({
            atMs: row.atMs,
            direction: row.action.includes("send") || row.action.includes("ota") ? "tx" : "rx",
            source: "audit",
            mac,
            frameName: row.target,
            topic: row.action === "device_send" ? `/inkjoyap/${mac}` : `/device/report/${mac}`,
            action: row.action,
            payload: JSON.stringify(row.meta ?? { action: row.action }),
        });
    }
}
