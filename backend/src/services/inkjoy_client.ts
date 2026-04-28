type InkjoyServerKey = "global" | "china";

const SERVER_MAP: Record<InkjoyServerKey, string> = {
  global: "https://openapi.inkjoyframe.com",
  china: "https://openapi.advisor.epaperframe.com",
};

type LoginResponse = {
  code: number;
  msg?: string;
  data?: { token?: string };
};

type GenericResponse<T> = {
  code: number;
  msg?: string;
  data?: T;
};

let cachedToken: { token: string; fetchedAtMs: number } | null = null;

function baseUrl(): string {
  const explicit = String(process.env.INKJOY_BASE_URL ?? "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const key = String(process.env.INKJOY_SERVER ?? "global").trim().toLowerCase() as InkjoyServerKey;
  return SERVER_MAP[key] ?? SERVER_MAP.global;
}

function credentials() {
  const email = String(process.env.INKJOY_EMAIL ?? "").trim();
  const password = String(process.env.INKJOY_PASSWORD ?? "").trim();
  return { email, password };
}

export function inkjoyEnabled(): boolean {
  return String(process.env.INKJOY_ENABLE ?? "").toLowerCase() === "true";
}

async function ensureToken(): Promise<string> {
  if (cachedToken && Date.now() - cachedToken.fetchedAtMs < 45 * 60 * 1000) {
    return cachedToken.token;
  }
  const { email, password } = credentials();
  if (!email || !password) {
    throw new Error("inkjoy_credentials_missing");
  }
  const res = await fetch(`${baseUrl()}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`inkjoy_login_http_${res.status}`);
  }
  const json = (await res.json()) as LoginResponse;
  if (json.code !== 0 || !json.data?.token) {
    throw new Error(json.msg || "inkjoy_login_failed");
  }
  cachedToken = { token: json.data.token, fetchedAtMs: Date.now() };
  return json.data.token;
}

async function apiGet<T>(path: string): Promise<T> {
  const token = await ensureToken();
  const res = await fetch(`${baseUrl()}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    cachedToken = null;
    return apiGet<T>(path);
  }
  if (!res.ok) throw new Error(`inkjoy_http_${res.status}`);
  const json = (await res.json()) as GenericResponse<T>;
  if (json.code !== 0 || json.data == null) {
    throw new Error(json.msg || "inkjoy_api_failed");
  }
  return json.data;
}

export async function inkjoyListDevices(): Promise<unknown[]> {
  return apiGet<unknown[]>("/api/v1/devices");
}

export async function inkjoyPublishImage(params: {
  deviceId: string;
  filename: string;
  bytes: Uint8Array;
}): Promise<unknown> {
  const token = await ensureToken();
  const body = new FormData();
  const fileBuf = Buffer.from(params.bytes);
  body.append("file", new Blob([fileBuf], { type: "image/jpeg" }), params.filename || "image.jpg");
  const res = await fetch(`${baseUrl()}/api/v1/devices/${encodeURIComponent(params.deviceId)}/publish`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  if (res.status === 401) {
    cachedToken = null;
    return inkjoyPublishImage(params);
  }
  if (!res.ok) throw new Error(`inkjoy_publish_http_${res.status}`);
  const json = (await res.json()) as GenericResponse<unknown>;
  if (json.code !== 0) throw new Error(json.msg || "inkjoy_publish_failed");
  return json.data ?? { ok: true };
}

export function resolveInkjoyDeviceId(preferred?: string): string {
  const body = String(preferred ?? "").trim();
  if (body) return body;
  return String(process.env.INKJOY_DEVICE_ID ?? "").trim();
}
