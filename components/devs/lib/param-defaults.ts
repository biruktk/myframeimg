import type { Api } from "../types";
import type { LiveBootstrap } from "../types";

export function paramDefaultsForApi(api: Api, bootstrap: LiveBootstrap | null): Record<string, string> {
  if (!bootstrap) return {};
  const d = bootstrap.defaults;
  const map: Record<string, string> = {};

  for (const p of api.params) {
    if (p.name === "deviceId" || p.name === "device_id") map[p.name] = d.deviceId;
    if (p.name === "id" && api.proxyPath.includes("{id}")) map[p.name] = d.frameId;
    if (p.name === "limit" && !p.defaultValue) map[p.name] = "50";
    if (p.name === "page" && !p.defaultValue) map[p.name] = "1";
    if (p.name === "pageSize" && !p.defaultValue) map[p.name] = "25";
  }

  for (const p of api.params) {
    if (!map[p.name] && p.defaultValue) map[p.name] = p.defaultValue;
  }

  return map;
}

export function liveSampleForApi(apiId: string, bootstrap: LiveBootstrap | null): unknown {
  if (!bootstrap?.endpoints) return null;
  const key = apiId;
  return bootstrap.endpoints[key]?.body ?? null;
}
