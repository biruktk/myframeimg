import { useRef, useEffect } from "react";
import { useStore } from "../store/useStore";
import { Trash2, Terminal, AlertCircle, Info, CheckCircle, Bug, X } from "lucide-react";

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

export default function Console() {
  const { consoleEntries, clearConsole } = useStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [consoleEntries]);

  return (
    <div className="bg-card flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-1.5 bg-secondary/50 flex-shrink-0">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Terminal size={13} />
          Console
          <span className="text-muted-foreground/60 font-normal">
            ({consoleEntries.length})
          </span>
        </div>
        <button
          onClick={clearConsole}
          className="p-0.5 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground"
          title="Clear console"
        >
          <Trash2 size={12} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto min-h-[2.5rem] font-mono text-[11px] leading-relaxed">
        {consoleEntries.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground/40 text-xs">
            Execute an API call to see output here
          </div>
        ) : (
          <div className="p-1.5 space-y-0.5">
            {consoleEntries.map((entry) => {
              const Icon = LEVEL_ICON[entry.level];
              return (
                <div key={entry.id} className="flex items-start gap-1.5 px-2 py-0.5 hover:bg-secondary/30 rounded">
                  <Icon size={10} className={LEVEL_COLOR[entry.level] + " mt-0.5 flex-shrink-0"} />
                  <span className="text-muted-foreground/50 flex-shrink-0">{entry.timestamp}</span>
                  <span className={LEVEL_COLOR[entry.level] + " flex-1"}>{entry.message}</span>
                  {entry.detail && (
                    <details className="text-muted-foreground/30">
                      <summary className="cursor-pointer text-[9px] hover:text-foreground">detail</summary>
                      <pre className="mt-1 p-2 bg-secondary/50 rounded text-[10px] whitespace-pre-wrap">
                        {entry.detail}
                      </pre>
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
