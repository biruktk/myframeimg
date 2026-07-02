import React from "react";
import type { Api } from "../types";
import { JsonHighlight } from "./JsonHighlight";
import { Copy, Check } from "lucide-react";

interface ApiDocProps {
  api: Api | null;
}

const ApiDoc: React.FC<ApiDocProps> = ({ api }) => {
  const [copiedUrl, setCopiedUrl] = React.useState(false);
  const [copiedJson, setCopiedJson] = React.useState(false);

  const copyToClipboard = (text: string, setter: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  if (!api) {
    return (
      <div className="flex-1 p-6 md:p-8 flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Select an API endpoint from the sidebar</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-4xl">
        {/* API Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <span className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
              api.method === "GET" ? "bg-blue-600 text-white" :
              api.method === "POST" ? "bg-blue-500/30 text-blue-100" :
              api.method === "PUT" ? "bg-zinc-600/30 text-zinc-200" :
              "bg-zinc-500/30 text-zinc-200"
            }`}>{api.method}</span>
            <div className="flex-1 min-w-0">
              <code className="code-token code-token-param text-sm break-all">{api.url.split("?")[0]}</code>
            </div>
            <button
              onClick={() => copyToClipboard(api.url.split("?")[0], setCopiedUrl)}
              className="p-2 hover:bg-secondary rounded-lg transition-colors flex-shrink-0"
              title="Copy URL"
            >
              {copiedUrl ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
            </button>
          </div>

          <h1 className="text-2xl md:text-3xl font-bold mb-2">{api.nameEn}</h1>
          <p className="text-muted-foreground text-sm md:text-base">{api.description}</p>
        </div>

        {/* Parameters */}
        {api.params.length > 0 && (
          <div className="mb-10">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="w-1 h-6 bg-primary rounded-full" />
              Request Parameters
            </h2>
            {api.requestNote && (
              <div className="mb-3 p-4 rounded-lg bg-secondary/70 border border-border text-sm text-muted-foreground">
                <strong className="text-foreground">Request note:</strong> {api.requestNote}
              </div>
            )}
            <div className="border border-border rounded-lg overflow-hidden bg-secondary/50">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary border-b border-border">
                    <tr>
                      <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Parameter</th>
                      <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Required</th>
                      <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Type</th>
                      <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {api.params.map((param, idx) => (
                      <tr key={idx} className="hover:bg-secondary/50 transition-colors">
                        <td className="py-3 px-4">
                          <code className="code-token code-token-param">{param.name}</code>
                        </td>
                        <td className="py-3 px-4">
                          {param.required ? (
                            <span className="inline-flex items-center gap-1 text-destructive text-xs font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
                              Required
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">Optional</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs code-token code-token-type">{param.type}</td>
                        <td className="py-3 px-4 text-foreground text-sm">{param.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Response */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="w-1 h-6 bg-primary rounded-full" />
            Response Example
          </h2>
          {api.responseNote && (
            <div className="mb-3 p-4 rounded-lg bg-secondary/70 border border-border text-sm text-muted-foreground">
              <strong className="text-foreground">Response note:</strong> {api.responseNote}
            </div>
          )}
          <div className="border border-border rounded-lg overflow-hidden bg-muted/80 dark:bg-zinc-900/90">
            <div className="px-4 py-3 bg-secondary border-b border-border flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">JSON</span>
              <button
                type="button"
                onClick={() => copyToClipboard(api.responseExample, setCopiedJson)}
                className="p-1.5 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground"
                title="Copy JSON"
              >
                {copiedJson ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              </button>
            </div>
            <div className="p-4 overflow-x-auto bg-secondary/50 dark:bg-zinc-950/50 rounded-b-lg">
              <JsonHighlight data={api.responseExample} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApiDoc;
