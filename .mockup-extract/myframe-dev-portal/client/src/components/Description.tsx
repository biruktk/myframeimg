import { useStore } from "../store/useStore";
import { QUICK_GUIDE_ITEMS } from "../data/quick-guide";
import { DEMO_STEPS } from "../data/demo";
import { Copy, Check } from "lucide-react";
import { useState, useCallback } from "react";

export default function Description() {
  const { selectedSection, selectedApi, selectedItemId, allApis } = useStore();
  const [copied, setCopied] = useState(false);

  const copyText = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  // Quick Guide
  if (selectedSection === "quick-guide" && selectedItemId) {
    const item = QUICK_GUIDE_ITEMS.find((g) => g.id === selectedItemId);
    if (!item) {
      return (
        <div className="p-6 md:p-8 flex items-center justify-center text-sm text-muted-foreground">
          Select a guide item from the menu.
        </div>
      );
    }
    return (
      <div className="p-6 md:p-8">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span className="w-1 h-6 bg-primary rounded-full" />
          {item.title}
        </h2>
        <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap font-mono text-[13px] bg-secondary/40 border border-border rounded-lg p-4">
          {item.content}
        </div>
      </div>
    );
  }

  // Demo
  if (selectedSection === "demo" && selectedItemId) {
    const step = DEMO_STEPS.find((s) => s.id === selectedItemId);
    if (!step) {
      return (
        <div className="p-6 md:p-8 flex items-center justify-center text-sm text-muted-foreground">
          Select a demo step from the menu.
        </div>
      );
    }
    const relatedApis = allApis.filter((a) => step.apis.includes(a.id));
    return (
      <div className="p-6 md:p-8">
        <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <span className="w-1 h-6 bg-primary rounded-full" />
          {step.title}
        </h2>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">{step.description}</p>
        {relatedApis.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Related APIs
            </h3>
            <div className="space-y-2">
              {relatedApis.map((api) => (
                <div
                  key={api.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border bg-secondary/40"
                >
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-semibold ${
                      api.method === "GET"
                        ? "bg-blue-600/80 text-white"
                        : api.method === "POST"
                          ? "bg-emerald-600/80 text-white"
                          : api.method === "PUT"
                            ? "bg-amber-600/80 text-white"
                            : "bg-red-600/80 text-white"
                    }`}
                  >
                    {api.method}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{api.nameEn}</p>
                    <p className="text-xs text-muted-foreground truncate">{api.url}</p>
                  </div>
                  <button
                    onClick={() => copyText(api.url)}
                    className="p-1.5 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground flex-shrink-0"
                    title="Copy URL"
                  >
                    {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // API List
  if (selectedSection === "api-list" && selectedApi) {
    return (
      <div className="p-6 md:p-8">
        <div className="flex items-center gap-3 mb-4">
          <span
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
              selectedApi.method === "GET"
                ? "bg-blue-600 text-white"
                : selectedApi.method === "POST"
                  ? "bg-emerald-600 text-white"
                  : selectedApi.method === "PUT"
                    ? "bg-amber-600 text-white"
                    : "bg-red-600 text-white"
            }`}
          >
            {selectedApi.method}
          </span>
          <code className="text-sm text-muted-foreground break-all">{selectedApi.url}</code>
        </div>
        <h1 className="text-2xl font-bold mb-2">{selectedApi.nameEn}</h1>
        <p className="text-muted-foreground text-sm mb-4">{selectedApi.description}</p>
        {selectedApi.requestNote && (
          <div className="p-3 rounded-lg bg-secondary/70 border border-border text-sm text-muted-foreground">
            <strong className="text-foreground">Note:</strong> {selectedApi.requestNote}
          </div>
        )}
        <div className="mt-6">
          <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">
            Parameters
          </h3>
          <div className="border border-border rounded-lg overflow-hidden bg-secondary/50">
            <table className="w-full text-sm">
              <thead className="bg-secondary border-b border-border">
                <tr>
                  <th className="text-left py-2.5 px-3 font-semibold text-muted-foreground text-xs">Name</th>
                  <th className="text-left py-2.5 px-3 font-semibold text-muted-foreground text-xs">Type</th>
                  <th className="text-left py-2.5 px-3 font-semibold text-muted-foreground text-xs">Required</th>
                  <th className="text-left py-2.5 px-3 font-semibold text-muted-foreground text-xs">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {selectedApi.params.map((param, i) => (
                  <tr key={i} className="hover:bg-secondary/50">
                    <td className="py-2.5 px-3">
                      <code className="text-[13px] text-amber-500 font-medium">{param.name}</code>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-xs text-blue-400">{param.type}</td>
                    <td className="py-2.5 px-3">
                      {param.required ? (
                        <span className="inline-flex items-center gap-1 text-red-400 text-xs font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                          Required
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">Optional</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-foreground">{param.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // Default empty state
  return (
    <div className="p-6 md:p-8 flex items-center justify-center text-sm text-muted-foreground">
      Select an item from the menu to see its description.
    </div>
  );
}
