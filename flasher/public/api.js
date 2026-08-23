// MyFrame Flasher — backend API client.
// URL bootstrap example:
//   ?workorder=WO-20260819-042
//   &token=eyJhbGci...
//   &server=https://api.myframe.internal/api/admin/production
//   &worker=zhang3
//
// Dev mode (no token) uses local mocks from manifest.json.

let cfg = null;
let woCache = null;        // last-loaded workorder metadata
let selectedRuleId = null; // current SN rule chosen by the operator
let selectedFirmware = null; // { url, label, bytes? (user-picked File) }

// Parse URL params, load manifest.json, decide prod vs dev.
export async function bootstrap() {
  if (cfg) return cfg;

  const url = new URL(window.location.href);
  const params = url.searchParams;
  const isDev = params.has('dev') || !params.has('token');

  const manifest = await fetch('manifest.json').then((r) => r.json());

  // Vercel deploy: same-origin serverless functions live under /api. Default
  // to that when no ?server= is given so the URL just works when hosted.
  // Local `vercel dev` also routes /api → api/*.mjs, so the same default
  // works locally without additional plumbing.
  let serverUrl = params.get('server') || manifest.defaultServerUrl || '';
  if (!serverUrl) {
    const prefix = window.location.pathname.startsWith("/firmware") ? "/firmware/api" : "/api";
    serverUrl = `${window.location.origin}${prefix}`;
  }

  // Token policy — dev mode allows the "demo" placeholder so a bare
  // localhost URL still works; prod mode requires a real token from the
  // admin panel (opening a flasher URL without ?token= would otherwise
  // let anyone with the workorder id proceed through the HMAC handshake
  // because "demo" is a well-known string).
  const urlToken = params.get('token');
  if (!isDev && !urlToken) {
    const { t } = await import('./i18n.js');
    throw new Error(t('err.no_token'));
  }

  // Track whether the workorder id came from the URL vs was defaulted from
  // the manifest mock. When the operator opens a bare `/` URL (no
  // ?workorder=), the .myfw they upload is the source of truth — the
  // mismatch guard in ui.js should not treat mock-vs-file as a conflict.
  const workorderFromUrl = params.get('workorder');
  cfg = {
    isDev,
    workorderId:       workorderFromUrl || (isDev ? manifest.devMode.mockWorkorder.id : null),
    workorderExplicit: !!workorderFromUrl,
    token:             urlToken || (isDev ? 'demo' : null),
    serverUrl,
    workerId:          params.get('worker') || 'dev',
    manifest,
  };

  if (!isDev && !cfg.workorderId) {
    throw new Error('Missing ?workorder= URL param');
  }
  if (!cfg.serverUrl) {
    throw new Error('No server URL — set ?server= or run on localhost with mock-server.py');
  }
  return cfg;
}

// Helper: fetch with bearer token + JSON.
async function api(path, opts = {}) {
  const res = await fetch(cfg.serverUrl + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.token}`,
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${path} → ${res.status} ${res.statusText} ${body}`);
  }
  return res;
}

// Return workorder metadata (quota, fw sha, SN rules, factory). Always tries
// the server first — the manifest mock is only a last-ditch fallback if the
// server can't be reached, since it shows stale placeholder quotas.
export async function getWorkorder() {
  try {
    const res = await api(`/workorder/${encodeURIComponent(cfg.workorderId)}`);
    woCache = await res.json();
  } catch (e) {
    if (cfg.isDev) {
      console.warn('[api] server unreachable; falling back to manifest mock:', e.message);
      woCache = { ...cfg.manifest.devMode.mockWorkorder, workerId: cfg.workerId };
    } else {
      throw e;
    }
  }
  if (!woCache.snRules && woCache.snRule) woCache.snRules = [woCache.snRule];
  if (!selectedRuleId && woCache.snRules?.length) {
    selectedRuleId = woCache.snRules[0].id;
  }
  return woCache;
}

export function getSelectedRule() {
  if (!woCache?.snRules) return null;
  return woCache.snRules.find((r) => r.id === selectedRuleId) || woCache.snRules[0];
}

export function setSelectedRuleId(id) {
  if (woCache?.snRules?.some((r) => r.id === id)) selectedRuleId = id;
}

// Dev-mode firmware selection API. Dynamically fetched from the mock server's
// `GET /firmwares` endpoint which scans the local `flasher-web/firmware/` dir.
// Cached after first fetch; call refreshFirmwares() to rescan.
let _firmwareListCache = null;

// Fetch the firmware dir listing. Runs against any server that exposes
// /firmwares — this includes both the dev mock server and a real backend that
// implements the same demo endpoint. Real prod backends that don't implement
// it will simply return an empty list (handled by the catch below).
export async function refreshFirmwares() {
  if (!cfg?.serverUrl) {
    _firmwareListCache = [];
    return _firmwareListCache;
  }
  try {
    const res = await fetch(`${cfg.serverUrl}/firmwares`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    _firmwareListCache = body.firmwares || [];
  } catch (e) {
    console.warn('[api] refreshFirmwares failed:', e.message);
    _firmwareListCache = [];
  }
  return _firmwareListCache;
}

export function getFirmwares() {
  return _firmwareListCache || [];
}

// Return the operator-picked .myfw, or null if nothing is picked yet.
// No implicit fallback to the server firmware list or a manifest default —
// callers (flashOne, renderFirmwarePicker) MUST treat null as "operator has
// not chosen a package for this batch" and refuse to proceed.
export function getSelectedFirmware() {
  return selectedFirmware || null;
}

// Choose one of the fetched firmwares by id.
export function setSelectedFirmwareId(id) {
  const list = getFirmwares();
  const found = list.find((f) => f.id === id);
  if (found) selectedFirmware = { id: found.id, url: found.url, label: found.label };
}

// Debug-mode: user picked a local .bin from disk. `file` is a File object.
export function setUserPickedFirmware(file) {
  selectedFirmware = {
    id: 'user',
    label: `${file.name} (${file.size.toLocaleString()} B)`,
    file,
  };
}

// Fetch firmware bytes. The flasher REQUIRES the operator to explicitly
// upload a .myfw file for the current batch — we never auto-fetch from the
// server, because a stale package on the origin would otherwise let workers
// accidentally burn the wrong batch. If nothing is picked, flashOne stops
// with a friendly "please upload" error surfaced on the slot card.
export async function getFirmwareBytes(onProgress) {
  if (!selectedFirmware?.file) {
    const { t } = await import('./i18n.js');
    throw new Error(t('err.no_myfw'));
  }
  const buf = await selectedFirmware.file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (onProgress) onProgress(bytes.length, bytes.length);
  return bytes;
}

async function streamAllBytes(res, onProgress) {
  const total = Number(res.headers.get('Content-Length') || 0);
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    if (onProgress) onProgress(received, total);
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.byteLength; }
  return out;
}

// Reserve the next SN atomically for a specific board (chip MAC).
// Returns { sn, ticket, ruleId } — ticket is a 1-use JWT the tool later
// exchanges for the actual license-consume call.
const _devSeqByRule = new Map();
export async function reserveSN(chipMac) {
  const rule = getSelectedRule();
  if (!rule) throw new Error('No SN rule available');
  if (cfg.isDev) {
    _devSeqByRule.set(rule.id, (_devSeqByRule.get(rule.id) || 0) + 1);
    const seqOffset = _devSeqByRule.get(rule.id);
    const { formatSN } = await import('./sn.js');
    const sn = formatSN(rule, rule.seqStart + seqOffset - 1, {
      mac: chipMac,
      wo:  woCache?.shortCode || cfg.workorderId,
    });
    return { sn, ticket: `dev-ticket-${rule.id}-${seqOffset}`, seq: seqOffset, ruleId: rule.id };
  }
  const res = await api(`/workorder/${encodeURIComponent(cfg.workorderId)}/next-sn`, {
    method: 'POST',
    body: JSON.stringify({ chipMac, ruleId: rule.id, workerId: cfg.workerId }),
  });
  return res.json();
}

// Consume the ticket after a successful flash+smoke test. Only success calls
// this — failures call reportFailure() so quota isn't spent on bricks.
export async function consumeTicket({ sn, ticket, chipMac, smokeOk }) {
  if (cfg.isDev) {
    console.info(`[dev] consume ticket ${ticket} · SN ${sn} · MAC ${chipMac} · smoke=${smokeOk}`);
    return { ok: true, remaining: -1 };
  }
  const res = await api(`/workorder/${encodeURIComponent(cfg.workorderId)}/consume`, {
    method: 'POST',
    body: JSON.stringify({ sn, ticket, chipMac, smokeOk, workerId: cfg.workerId }),
  });
  return res.json();
}

// Report a flash failure — server records it for audit but does NOT decrement quota.
export async function reportFailure({ sn, ticket, chipMac, stage, error }) {
  if (cfg.isDev) {
    console.warn(`[dev] failure ticket ${ticket} · SN ${sn} · stage ${stage} · ${error}`);
    return { ok: true };
  }
  // Vercel Hobby plan limits functions to 12, so we route failure reports
  // through the same /consume endpoint with smokeOk:false. Server-side, the
  // handler branches on smokeOk to skip the quota increment for failures.
  const res = await api(`/workorder/${encodeURIComponent(cfg.workorderId)}/consume`, {
    method: 'POST',
    body: JSON.stringify({
      sn, ticket, chipMac, smokeOk: false,   // key: this makes it a report, not a quota-consume
      stage, error: String(error), workerId: cfg.workerId,
    }),
  });
  return res.json();
}

// Look up a specific workorder (used by the .myfw file-pick auto-load path
// which needs to fetch metadata for the workorder ID embedded in the file).
export async function getWorkorderById(workorderId) {
  if (!cfg?.serverUrl) throw new Error('no server configured');
  const res = await api(`/workorder/${encodeURIComponent(workorderId)}`);
  return res.json();
}

// ── Challenge-response session flow ────────────────────────────────
// Unlocks the AES-256-GCM package key. Two-step handshake:
//   1) POST /workorder/:id/challenge → server returns a random nonce
//   2) Client computes HMAC-SHA256(nonce, bearerToken) as `response`
//   3) POST /workorder/:id/session → server verifies HMAC, returns
//      { sessionId, packageKey (hex), keyId, expiresIn }
// The key never appears in tool source — an attacker who reverse-engineers
// the .myfw file cannot decrypt it without also holding a valid bearer token
// AND passing the HMAC challenge, at which point the server audits + rate-
// limits the request.
export async function openSession(workorderId, licenseId) {
  if (!cfg?.serverUrl) throw new Error('no server configured');
  const woId = workorderId || cfg.workorderId;

  // Step 1 — request nonce.
  const chRes = await api(`/workorder/${encodeURIComponent(woId)}/challenge`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  const { challenge } = await chRes.json();
  if (!challenge) throw new Error('server did not issue a challenge');

  // Step 2 — compute HMAC-SHA256(challenge, bearer).
  const { hmacSha256Hex } = await import('./crypto.js');
  const response = await hmacSha256Hex(cfg.token || '', challenge);

  // Step 3 — exchange response for session + key.
  const sessRes = await api(`/workorder/${encodeURIComponent(woId)}/session`, {
    method: 'POST',
    body: JSON.stringify({ challenge, response, licenseId }),
  });
  return sessRes.json();  // { sessionId, packageKey, keyId, expiresIn }
}

export function getConfig() { return cfg; }

// Adopt the workorder id parsed out of the operator's uploaded .myfw when
// the URL didn't specify one. Downstream API calls (reserveSN / consume /
// session) all key off cfg.workorderId, so this is how a `/`-URL user
// gets burns to land on the correct workorder.
export function setActiveWorkorderId(newId) {
  if (!cfg) throw new Error('bootstrap first');
  if (!newId || typeof newId !== 'string') return;
  cfg.workorderId = newId;
  console.info(`[api] active workorder set to ${newId} (from uploaded .myfw)`);
}

// Adopt the per-workorder bearer that build-package.mjs embedded in the
// .myfw's license. Every /workorder/:id/* endpoint verifies the request
// bearer against wo.bearer stored server-side; without this the flasher
// would fall back to "demo" (dev-only) which prod endpoints reject.
//
// CRITICAL: adopting a real bearer also flips cfg.isDev → false. Without
// this, reserveSN / consumeTicket short-circuit to their in-memory dev
// mocks — every burn "succeeds" locally but never hits the server, so
// the workorder's used counter never advances and audit stays empty.
export function setActiveToken(tok) {
  if (!cfg) throw new Error('bootstrap first');
  if (!tok || typeof tok !== 'string') return;
  cfg.token = tok;
  if (cfg.isDev) {
    cfg.isDev = false;
    // Clear the dev-mode SN counter so any post-upload reserveSN calls
    // start from the real server sequence, not the leftover local one.
    _devSeqByRule.clear();
    console.info(`[api] elevated to prod mode — real bearer adopted, dev mocks disabled`);
    // Notify listeners (index.html's setModeLabels) so the mode badge
    // reflects the real prod state instead of staying stuck on "DEV".
    try {
      window.dispatchEvent(new CustomEvent('mff:mode-change', { detail: { isDev: false } }));
    } catch { /* jsdom/tests without window */ }
  } else {
    console.info(`[api] active bearer set (len=${tok.length})`);
  }
}
