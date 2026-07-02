"use client";

import { JsonHighlight } from "./json-highlight";
import { useDevStore } from "./store/use-dev-store";

function formatSampleTime(ms: number): string {
  return new Date(ms).toLocaleString();
}

export function DevLiveSnapshot() {
  const { liveBootstrap, liveBootstrapLoading } = useDevStore();

  if (liveBootstrapLoading) {
    return (
      <div className="mx-6 mt-6 md:mx-8 md:mt-8 p-4 rounded-xl border border-border bg-secondary/40 text-sm text-muted-foreground">
        Loading live backend snapshot…
      </div>
    );
  }

  if (!liveBootstrap?.ok) return null;

  const status = liveBootstrap.endpoints.devs_status?.body as Record<string, unknown> | undefined;
  const fleet = liveBootstrap.endpoints.fleet_overview?.body as Record<string, unknown> | undefined;
  const overview = liveBootstrap.endpoints.admin_overview?.body as Record<string, unknown> | undefined;
  const device = liveBootstrap.endpoints.device_status?.body as Record<string, unknown> | undefined;
  const frames = liveBootstrap.endpoints.admin_frames?.body as unknown[];
  const mqtt = status?.mqtt as Record<string, unknown> | undefined;

  return (
    <div className="mx-6 mt-6 md:mx-8 md:mt-8 p-4 md:p-5 rounded-xl border border-primary/25 bg-primary/5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold m-0 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Live backend data
        </h2>
        <span className="text-[11px] text-muted-foreground">Sampled {formatSampleTime(liveBootstrap.sampledAtMs)}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
        <Stat label="MQTT" value={mqtt?.connected ? "connected" : "offline"} />
        <Stat label="Frames registered" value={String(status?.registeredFrames ?? fleet?.totalFrames ?? "—")} />
        <Stat label="Online now" value={String(fleet?.onlineNow ?? status?.connectedClients ?? "—")} />
        <Stat label="MQTT live" value={String(mqtt?.liveFrameCount ?? "—")} />
        <Stat label="Log entries" value={String(status?.totalLogEntries ?? "—")} />
        <Stat label="Msg/min" value={String(status?.messagesPerMin ?? "—")} />
        <Stat label="Uploads" value={String(overview?.totalUploads ?? "—")} />
        <Stat label="Photos on device" value={String(device?.photoCount ?? overview?.photoCount ?? "—")} />
        <Stat label="Primary device" value={String(liveBootstrap.defaults.deviceId || "—")} mono />
        <Stat label="Storage used" value={overview?.usedBytes ? `${(Number(overview.usedBytes) / 1e9).toFixed(2)} GB` : String(device?.storageGb ?? "—")} />
        <Stat label="Daily active" value={String(fleet?.dailyActiveFrames ?? "—")} />
        <Stat label="Frame rows" value={String(Array.isArray(frames) ? frames.length : "—")} />
      </div>
      <p className="text-[11px] text-muted-foreground mt-3 mb-0">
        All Execute calls and the debug console use this server&apos;s Express API and JSON store — not mock data.
      </p>
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-border/80 bg-card/80 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{label}</div>
      <div className={`text-sm font-medium truncate ${mono ? "font-mono text-[12px]" : ""}`}>{value}</div>
    </div>
  );
}

export function DevLiveSample({ apiId }: { apiId: string }) {
  const liveBootstrap = useDevStore((s) => s.liveBootstrap);
  const sample = liveBootstrap?.endpoints[apiId]?.body;
  if (!sample) return null;

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Live sample (from backend)</h3>
      <div className="border border-border rounded-lg overflow-hidden bg-secondary/50 p-3">
        <JsonHighlight data={JSON.stringify(sample, null, 2)} />
      </div>
    </div>
  );
}
