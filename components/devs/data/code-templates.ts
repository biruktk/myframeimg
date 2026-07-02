import type { Api, CodeLanguage, CodeSnippet } from "../types";
import { buildApiUrl, buildRequestBody } from "../lib/execute-api";
import { portalOrigin } from "../const";

function buildCurl(api: Api, params: Record<string, string>, adminToken: string): string {
  const origin = portalOrigin();
  const path = buildApiUrl(api, params);
  const url = `${origin}${path}`;
  const parts = [`curl -X ${api.method} "${url}"`];
  if (api.auth === "admin") {
    parts.push(`  -H "Cookie: myframe_admin_session=${adminToken || "YOUR_ADMIN_TOKEN"}"`);
  }
  parts.push(`  -H "Accept: application/json"`);
  const body = buildRequestBody(api, params);
  if (body) {
    parts.push(`  -H "Content-Type: application/json"`);
    parts.push(`  -d '${body.replace(/'/g, "'\\''")}'`);
  }
  return parts.join(" \\\n");
}

function buildJavaScript(api: Api, params: Record<string, string>): string {
  const origin = portalOrigin();
  const path = buildApiUrl(api, params);
  const body = buildRequestBody(api, params);
  const lines: string[] = [];
  lines.push(`const response = await fetch("${origin}${path}", {`);
  lines.push(`  method: "${api.method}",`);
  lines.push(`  credentials: "include",`);
  lines.push(`  headers: { Accept: "application/json"${body ? ', "Content-Type": "application/json"' : ""} },`);
  if (body) lines.push(`  body: ${JSON.stringify(JSON.parse(body), null, 2).split("\n").join("\n  ")},`);
  lines.push("});");
  lines.push("const data = await response.json();");
  lines.push("console.log(response.status, data);");
  return lines.join("\n");
}

function buildPython(api: Api, params: Record<string, string>, adminToken: string): string {
  const origin = portalOrigin();
  const path = buildApiUrl(api, params);
  const body = buildRequestBody(api, params);
  const lines: string[] = ["import requests", ""];
  const headers = api.auth === "admin" ? `{ "Cookie": "myframe_admin_session=${adminToken || "YOUR_ADMIN_TOKEN"}" }` : "{}";
  if (api.method === "GET") {
    lines.push(`r = requests.get("${origin}${path}", headers=${headers})`);
  } else {
    const payload = body ? JSON.parse(body) : {};
    lines.push(`r = requests.${api.method.toLowerCase()}("${origin}${path}", json=${JSON.stringify(payload)}, headers=${headers})`);
  }
  lines.push("print(r.status_code, r.json())");
  return lines.join("\n");
}

export function generateCodeSnippets(api: Api, params: Record<string, string>, adminToken: string): CodeSnippet[] {
  const js = buildJavaScript(api, params);
  return [
    { language: "curl", label: "cURL", code: buildCurl(api, params, adminToken) },
    { language: "javascript", label: "Node.js (fetch)", code: js },
    { language: "typescript", label: "TypeScript", code: js.replace("await fetch", "await fetch") + "\n// typed as unknown until you define response interfaces" },
    { language: "python", label: "Python", code: buildPython(api, params, adminToken) },
  ];
}
