import { useState, useCallback, useMemo } from "react";
import { useStore } from "../store/useStore";
import { generateCodeSnippets } from "../data/code-templates";
import { generatePseudoCode } from "../data/pseudo-code";
import { DEMO_STEPS } from "../data/demo";
import { JsonHighlight } from "./JsonHighlight";
import {
  Play,
  Loader2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Terminal,
  Code,
} from "lucide-react";
import type { CodeLanguage } from "../types";

const LANG_OPTIONS: { value: CodeLanguage; label: string }[] = [
  { value: "curl", label: "cURL" },
  { value: "javascript", label: "Node.js (fetch)" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
];

export default function ApiPanel() {
  const {
    selectedApi,
    selectedSection,
    selectedItemId,
    allApis,
    paramValues,
    setParamValue,
    setSelectedApi,
    executionResult,
    setExecutionResult,
    selectedLanguage,
    setSelectedLanguage,
    addConsoleEntry,
  } = useStore();

  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedResponse, setCopiedResponse] = useState(false);
  const [showPseudo, setShowPseudo] = useState(true);
  const [showResponse, setShowResponse] = useState(false);

  // Resolve active API: either directly selected, or inferred from demo step
  const activeApi = useMemo(() => {
    if (selectedApi) return selectedApi;
    if (selectedSection === "demo" && selectedItemId) {
      const step = DEMO_STEPS.find((s) => s.id === selectedItemId);
      if (step && step.apis.length > 0) {
        return allApis.find((a) => a.id === step.apis[0]) ?? null;
      }
    }
    return null;
  }, [selectedApi, selectedSection, selectedItemId, allApis]);

  // Auto-select the demo's first API so params/code show up
  const needsAutoSelect =
    selectedSection === "demo" && selectedItemId && !selectedApi;
  if (needsAutoSelect && activeApi) {
    // Defer to next tick via setTimeout to avoid setState-during-render
    setTimeout(() => setSelectedApi(activeApi), 0);
  }

  const handleCopy = useCallback((text: string, setter: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  }, []);

  if (!activeApi) {
    const msg =
      selectedSection === "demo"
        ? "Select a demo step with a related API"
        : "Select an API endpoint to test";
    return (
      <div className="p-6 md:p-8 flex items-center justify-center text-sm text-muted-foreground">
        <div className="text-center">
          <Terminal size={32} className="mx-auto mb-3 opacity-40" />
          <p>{msg}</p>
          <p className="text-xs mt-1">
            {selectedSection === "demo"
              ? "Choose from the Demo section"
              : "Choose from the API List in the menu"}
          </p>
        </div>
      </div>
    );
  }

  const missingRequired = activeApi.params
    .filter((p) => p.required && activeApi.url.includes(`{${p.name}`))
    .some((p) => !paramValues[p.name]);

  const handleExecute = async () => {
    const ts = new Date().toLocaleTimeString();
    setExecutionResult({ status: "loading" });

    addConsoleEntry({
      id: `exec-${Date.now()}`,
      timestamp: ts,
      level: "info",
      message: `▶ Executing ${activeApi.method} ${activeApi.nameEn}...`,
    });

    const startTime = Date.now();
    try {
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 600));

      const duration = Date.now() - startTime;
      const parsedResponse = JSON.parse(activeApi.responseExample);

      setExecutionResult({
        status: "success",
        response: JSON.stringify(parsedResponse, null, 2),
        durationMs: duration,
      });

      addConsoleEntry({
        id: `res-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        level: "success",
        message: `✓ ${activeApi.method} ${activeApi.url} → 200 OK (${duration}ms)`,
        detail: JSON.stringify(parsedResponse, null, 2),
      });

      setShowResponse(true);
    } catch (err) {
      const duration = Date.now() - startTime;
      const msg = err instanceof Error ? err.message : "Unknown error";
      setExecutionResult({ status: "error", error: msg, durationMs: duration });

      addConsoleEntry({
        id: `err-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        level: "error",
        message: `✗ ${activeApi.method} ${activeApi.url} — ${msg}`,
      });
    }
  };

  const codeSnippets = generateCodeSnippets(activeApi, paramValues, "YOUR_API_KEY");
  const currentSnippet = codeSnippets.find((s) => s.language === selectedLanguage) ?? codeSnippets[0];
  const pseudoCode = generatePseudoCode(activeApi);

  return (
    <div className="p-4 md:p-6 space-y-4 overflow-y-auto h-full">
      {/* Params Form */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="w-1 h-4 bg-primary rounded-full" />
          Parameters
          {selectedSection === "demo" && (
            <span className="text-[10px] font-normal text-amber-400/70 ml-auto">Demo mode</span>
          )}
        </h3>
        <div className="space-y-2.5">
          {activeApi.params.map((param) => (
            <div key={param.name}>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <code className="text-[12px] text-amber-500 font-medium">{param.name}</code>
                {param.required && <span className="text-red-400">*</span>}
                <span className="text-muted-foreground/60">— {param.type}</span>
              </label>
              <input
                type="text"
                value={paramValues[param.name] ?? ""}
                onChange={(e) => setParamValue(param.name, e.target.value)}
                placeholder={param.defaultValue || param.description}
                className="w-full px-3 py-2 text-sm bg-secondary border border-border rounded-lg text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-primary/50 transition-all font-mono text-[13px]"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Execute Button */}
      <button
        onClick={handleExecute}
        disabled={executionResult.status === "loading" || missingRequired}
        className="w-full py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        {executionResult.status === "loading" ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Executing...
          </>
        ) : (
          <>
            <Play size={16} />
            Execute {activeApi.method}
          </>
        )}
      </button>

      {missingRequired && (
        <p className="text-[11px] text-red-400 -mt-2">
          Fill in all required (path) parameters to execute.
        </p>
      )}

      {/* Response */}
      {executionResult.status === "success" && executionResult.response && (
        <div>
          <button
            onClick={() => setShowResponse(!showResponse)}
            className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            {showResponse ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            Response ({executionResult.durationMs}ms)
          </button>
          {showResponse && (
            <div className="mt-2 border border-border rounded-lg overflow-hidden bg-muted/80 dark:bg-zinc-900/90">
              <div className="px-3 py-2 bg-secondary border-b border-border flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  JSON
                </span>
                <button
                  onClick={() => handleCopy(executionResult.response!, setCopiedResponse)}
                  className="p-1 hover:bg-secondary rounded transition-colors"
                  title="Copy response"
                >
                  {copiedResponse ? (
                    <Check size={12} className="text-green-400" />
                  ) : (
                    <Copy size={12} />
                  )}
                </button>
              </div>
              <div className="p-3 overflow-x-auto bg-secondary/50 dark:bg-zinc-950/50">
                <JsonHighlight data={executionResult.response} />
              </div>
            </div>
          )}
        </div>
      )}

      {executionResult.status === "error" && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">
          {executionResult.error}
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Pseudo Code */}
      <div>
        <button
          onClick={() => setShowPseudo(!showPseudo)}
          className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors w-full"
        >
          {showPseudo ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          <Code size={14} />
          Pseudo-Code
        </button>
        {showPseudo && (
          <div className="mt-2 p-3 bg-secondary/40 border border-border rounded-lg font-mono text-[12px] leading-relaxed whitespace-pre overflow-x-auto text-muted-foreground">
            {pseudoCode.join("\n")}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Sample Code */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Code size={14} />
          Sample Code
        </h3>

        {/* Language Selector */}
        <div className="flex flex-wrap gap-1 mb-3">
          {LANG_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSelectedLanguage(opt.value)}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                selectedLanguage === opt.value
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "bg-secondary text-muted-foreground hover:text-foreground border border-border"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Code Block */}
        <div className="border border-border rounded-lg overflow-hidden bg-muted/80 dark:bg-zinc-900/90">
          <div className="px-3 py-2 bg-secondary border-b border-border flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {currentSnippet.label}
            </span>
            <button
              onClick={() => handleCopy(currentSnippet.code, setCopiedCode)}
              className="p-1 hover:bg-secondary rounded transition-colors"
              title="Copy code"
            >
              {copiedCode ? (
                <Check size={12} className="text-green-400" />
              ) : (
                <Copy size={12} />
              )}
            </button>
          </div>
          <div className="p-3 overflow-x-auto bg-secondary/50 dark:bg-zinc-950/50">
            <pre className="font-mono text-[12px] leading-relaxed whitespace-pre text-foreground/90">
              {currentSnippet.code}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
