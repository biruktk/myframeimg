import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getMyframeApiBase, myframeBackendAdminHeaders } from "@/lib/backend-url";
import { adminTokenOrUnauthorized } from "@/lib/admin-route-auth";

export const dynamic = "force-dynamic";

async function fetchJson(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers, cache: "no-store" });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { ok: res.ok, status: res.status, body };
}

/** Aggregates live backend data for the dev portal (admin session required). */
export async function GET(req: NextRequest) {
  const auth = adminTokenOrUnauthorized(req);
  if (auth.response) return auth.response;

  const base = getMyframeApiBase();
  const headers = {
    ...myframeBackendAdminHeaders(auth.token ?? undefined),
    accept: "application/json",
  };

  try {
    const [status, frames, fleet, overview, device, health, logs, users] = await Promise.all([
      fetchJson(`${base}/api/devs/status`, headers),
      fetchJson(`${base}/api/admin/frames`, headers),
      fetchJson(`${base}/api/admin/fleet/overview`, headers),
      fetchJson(`${base}/api/admin/overview`, headers),
      fetchJson(`${base}/api/device/status`, headers),
      fetchJson(`${base}/health`, {}),
      fetchJson(`${base}/api/devs/logs?limit=3`, headers),
      fetchJson(`${base}/api/admin/users?page=1&pageSize=5`, headers),
    ]);

    const frameList = Array.isArray(frames.body) ? frames.body : [];
    const deviceBody = device.body && typeof device.body === "object" ? (device.body as Record<string, unknown>) : {};
    const primaryDeviceId = String(deviceBody.deviceId ?? frameList[0]?.id ?? "");

    return NextResponse.json({
      ok: true,
      sampledAtMs: Date.now(),
      defaults: {
        deviceId: primaryDeviceId,
        frameId: String(frameList[0]?.id ?? primaryDeviceId),
      },
      endpoints: {
        devs_status: status,
        devs_logs: logs,
        admin_frames: { ok: frames.ok, status: frames.status, body: frameList },
        fleet_overview: fleet,
        admin_overview: overview,
        device_status: device,
        backend_health: {
          ok: health.ok,
          status: health.status,
          body: {
            ok: true,
            upstream: health.ok,
            base,
            upstreamBody: health.body,
          },
        },
        admin_users: users,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "devs_bootstrap_failed" },
      { status: 502 },
    );
  }
}
