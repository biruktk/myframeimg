import type { Api } from "../types";

export function buildApiUrl(api: Api, params: Record<string, string>): string {
  let path = api.proxyPath;
  for (const p of api.params) {
    if (path.includes(`{${p.name}}`) && params[p.name]) {
      path = path.replace(`{${p.name}}`, encodeURIComponent(params[p.name]));
    }
  }
  const qs = new URLSearchParams();
  for (const p of api.params) {
    if (!api.proxyPath.includes(`{${p.name}}`) && params[p.name]?.trim()) {
      if (api.method === "GET" || api.method === "DELETE") {
        qs.set(p.name, params[p.name].trim());
      }
    }
  }
  const q = qs.toString();
  return q ? `${path}?${q}` : path;
}

export function buildRequestBody(api: Api, params: Record<string, string>): string | undefined {
  if (api.method === "GET" || api.method === "DELETE") return undefined;
  const body: Record<string, string> = {};
  for (const p of api.params) {
    if (!api.proxyPath.includes(`{${p.name}}`) && params[p.name]?.trim()) {
      body[p.name] = params[p.name].trim();
    }
  }
  if (Object.keys(body).length === 0) return undefined;
  return JSON.stringify(body);
}

export async function executeApi(
  api: Api,
  params: Record<string, string>,
): Promise<{ ok: boolean; status: number; text: string; durationMs: number }> {
  const url = buildApiUrl(api, params);
  const body = buildRequestBody(api, params);
  const start = Date.now();
  const res = await fetch(url, {
    method: api.method,
    credentials: "include",
    headers: body ? { "content-type": "application/json", accept: "application/json" } : { accept: "application/json" },
    body,
    cache: "no-store",
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text, durationMs: Date.now() - start };
}
