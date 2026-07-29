"use client";

import { useEffect, useRef } from "react";
import { Trash2, Terminal, AlertCircle, Info, CheckCircle, Bug } from "lucide-react";

import { useDevStore } from "./store/use-dev-store";

const LEVEL_ICON = {
  info: Info,
  warn: AlertCircle,
  error: AlertCircle,
  debug: Bug,
  success: CheckCircle,
};

const LEVEL_COLOR = {
  info: "text-blue-400",
  warn: "text-amber-400",
  error: "text-red-400",
  debug: "text-muted-foreground",
  success: "text-emerald-400",
};

function formatLogTime(atMs: number): string {
  const d = new Date(atMs);
  return (
    d.toLocaleTimeString(undefined, { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }) +
    "." +
    String(d.getMilliseconds()).padStart(3, "0")
  );
}

export function DevConsole() {
  const { consoleEntries, clearConsole, addConsoleEntry } = useDevStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [consoleEntries]);

  useEffect(() => {
    const es = new EventSource("/api/devs/logs/stream");
    es.addEventListener("ready", () => {
      addConsoleEntry({
        id: `sse-ready-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        level: "debug",
        message: "● Live frame log stream connected",
      });
    });
    es.addEventListener("log", (ev) => {
      if (pausedRef.current) return;
      try {
        const entry = JSON.parse((ev as MessageEvent).data) as {
          id: string;
          atMs: number;
          direction: "rx" | "tx";
          mac: string;
          frameName: string | null;
          topic: string;
          action: string | null;
          payload: string;
        };
        addConsoleEntry({
          id: entry.id,
          timestamp: formatLogTime(entry.atMs),
          level: entry.direction === "rx" ? "success" : "info",
          message: `[${entry.direction.toUpperCase()}] ${entry.mac} ${entry.topic}${entry.action ? ` · ${entry.action}` : ""}`,
          detail: entry.payload,
        });
      } catch {
        /* ignore */
      }
    });
    es.onerror = () => {
      addConsoleEntry({
        id: `sse-err-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        level: "warn",
        message: "○ Frame log stream reconnecting…",
      });
    };
    return () => es.close();
  }, [addConsoleEntry]);

  return (
    <div className="bg-card flex flex-col h-full min-h-[140px] max-h-[40vh]">
      <div className="flex items-center justify-between px-4 py-1.5 bg-secondary/50 flex-shrink-0">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Terminal size={13} />
          Console
          <span className="text-muted-foreground/60 font-normal">({consoleEntries.length})</span>
        </div>
        <button
          type="button"
          onClick={clearConsole}
          className="p-0.5 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground"
          title="Clear console"
        >
          <Trash2 size={12} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto min-h-[2.5rem] font-mono text-[11px] leading-relaxed">
        {consoleEntries.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground/40 text-xs px-4 text-center">
            Execute an API or wait for live MQTT frame traffic
          </div>
        ) : (
          <div className="p-1.5 space-y-0.5">
            {consoleEntries.map((entry) => {
              const Icon = LEVEL_ICON[entry.level];
              return (
                <div key={entry.id} className="flex items-start gap-1.5 px-2 py-0.5 hover:bg-secondary/30 rounded">
                  <Icon size={10} className={LEVEL_COLOR[entry.level] + " mt-0.5 flex-shrink-0"} />
                  <span className="text-muted-foreground/50 flex-shrink-0">{entry.timestamp}</span>
                  <span className={LEVEL_COLOR[entry.level] + " flex-1 break-all"}>{entry.message}</span>
                  {entry.detail && (
                    <details className="text-muted-foreground/30">
                      <summary className="cursor-pointer text-[9px] hover:text-foreground">detail</summary>
                      <pre className="mt-1 p-2 bg-secondary/50 rounded text-[10px] whitespace-pre-wrap max-w-xs">{entry.detail}</pre>
                    </details>
                  )}
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  );
}
