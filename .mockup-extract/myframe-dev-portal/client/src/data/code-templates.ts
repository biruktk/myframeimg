import type { Api, CodeLanguage, CodeSnippet } from "../types";

function buildUrl(api: Api, params: Record<string, string>): string {
  let url = api.url;
  for (const p of api.params) {
    if (params[p.name]) {
      url = url.replace(`{${p.name}}`, params[p.name]);
    }
  }
  return url;
}

function buildQueryString(api: Api, params: Record<string, string>): string {
  const qs = api.params
    .filter((p) => params[p.name] && !api.url.includes(`{${p.name}}`))
    .map((p) => `${p.name}=${encodeURIComponent(params[p.name])}`);
  return qs.length > 0 ? "?" + qs.join("&") : "";
}

function buildBody(api: Api, params: Record<string, string>): string {
  const bodyParams = api.params.filter(
    (p) => params[p.name] && !api.url.includes(`{${p.name}}`) && api.method !== "GET"
  );
  if (bodyParams.length === 0) return "";
  const pairs = bodyParams.map((p) => `  "${p.name}": "${params[p.name]}"`);
  return "{\n" + pairs.join(",\n") + "\n}";
}

function buildCurl(api: Api, params: Record<string, string>, token: string): string {
  const url = buildUrl(api, params) + buildQueryString(api, params);
  const parts = [`curl -X ${api.method} "${url}"`];
  parts.push(`  -H "Authorization: Bearer ${token || "YOUR_API_KEY"}"`);
  parts.push(`  -H "Content-Type: application/json"`);
  const body = buildBody(api, params);
  if (body) {
    const escaped = body.replace(/'/g, "'\\''");
    parts.push(`  -d '${escaped}'`);
  }
  return parts.join(" \\\n");
}

function buildJavaScript(api: Api, params: Record<string, string>, token: string): string {
  const url = buildUrl(api, params) + buildQueryString(api, params);
  const body = buildBody(api, params);

  const lines: string[] = [];
  lines.push("const API_TOKEN = '" + (token || "YOUR_API_KEY") + "';");
  lines.push("const BASE_URL = 'https://api.myframe.ink/v1';");
  lines.push("");

  if (api.method === "GET") {
    lines.push(`fetch('${url}', {`);
    lines.push("  headers: { 'Authorization': `Bearer ${API_TOKEN}` }");
    lines.push("})");
  } else {
    lines.push(`fetch('${url}', {`);
    lines.push(`  method: '${api.method}',`);
    lines.push("  headers: {");
    lines.push("    'Authorization': `Bearer ${API_TOKEN}`,");
    lines.push("    'Content-Type': 'application/json'");
    lines.push("  },");
    if (body) {
      lines.push(`  body: JSON.stringify(${body.replace(/\n/g, "\n    ")})`);
    }
    lines.push("})");
  }

  lines.push("  .then(res => res.json())");
  lines.push("  .then(data => console.log('Success:', data))");
  lines.push("  .catch(err => console.error('Error:', err));");

  return lines.join("\n");
}

function buildTypeScript(api: Api, params: Record<string, string>, token: string): string {
  const js = buildJavaScript(api, params, token);
  return js.replace("const API_TOKEN", "const API_TOKEN: string");
}

function buildPython(api: Api, params: Record<string, string>, token: string): string {
  const url = buildUrl(api, params) + buildQueryString(api, params);
  const body = buildBody(api, params);

  const lines: string[] = [];
  lines.push("import requests");
  lines.push("");
  lines.push(`API_TOKEN = "${token || "YOUR_API_KEY"}"`);
  lines.push(`BASE_URL = "https://api.myframe.ink/v1"`);
  lines.push("");
  lines.push("headers = {");
  lines.push('    "Authorization": f"Bearer {API_TOKEN}",');
  lines.push('    "Content-Type": "application/json"');
  lines.push("}");

  if (api.method === "GET") {
    lines.push("");
    lines.push(`response = requests.get("${url}", headers=headers)`);
  } else {
    lines.push("");
    if (body) {
      lines.push(`payload = ${body.replace(/\n/g, "\n    ")}`);
      lines.push(`response = requests.${api.method.toLowerCase()}("${url}", json=payload, headers=headers)`);
    } else {
      lines.push(`response = requests.${api.method.toLowerCase()}("${url}", headers=headers)`);
    }
  }

  lines.push("data = response.json()");
  lines.push('print("Success:", data)');

  return lines.join("\n");
}

const BUILDERS: Record<CodeLanguage, (api: Api, params: Record<string, string>, token: string) => string> = {
  curl: buildCurl,
  javascript: buildJavaScript,
  typescript: buildTypeScript,
  python: buildPython,
};

export function generateCodeSnippets(
  api: Api,
  params: Record<string, string>,
  token: string
): CodeSnippet[] {
  const languages: CodeLanguage[] = ["curl", "javascript", "typescript", "python"];
  const labels: Record<CodeLanguage, string> = {
    curl: "cURL",
    javascript: "Node.js (fetch)",
    typescript: "TypeScript",
    python: "Python",
  };

  return languages.map((lang) => ({
    language: lang,
    label: labels[lang],
    code: BUILDERS[lang](api, params, token),
  }));
}
