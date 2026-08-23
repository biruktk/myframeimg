# Changelog

## v1.1.0 · 2026-08-20

### Security
- **Per-workorder bearer**, minted at `/admin/build-package` time and embedded
  in the `.myfw` license header. Every `/api/workorder/{id}/*` endpoint
  verifies it with `crypto.timingSafeEqual` against `wo.bearer`.
- **KEK-wrapped AES key at rest** — package AES-256-GCM keys are wrapped with
  `MYFRAME_KEK` (env) using AES-256-GCM before being stored in KV.
  Unwrapped just-in-time inside `/session` after HMAC challenge succeeds.
- **Demo-bearer guard** — `demo/test/dev/""` bearers are rejected in
  production. Set `ALLOW_DEMO_BEARER=1` for local dev.
- **Admin login rate-limit** — 5 wrong passwords per client IP per 15-minute
  rolling window trigger a 429 `LOGIN_LOCKED` response.
- **Firmware overwrite guard** — same-name `.bin` uploads return 409
  `FIRMWARE_EXISTS`; overwrite requires `?force=1` + client confirmation.
  Disk-hosted firmware (git-shipped) is never overwritable through the API.
- **One-shot workorder** — attempting to rebuild a `.myfw` for an existing
  workorder returns 409 `WORKORDER_ALREADY_BUILT`.
- **License expiry enforcement** — both `/next-sn` and `/session` refuse when
  `expiresAt < now` (410 `LICENSE_EXPIRED`).
- **Null-license short-circuit** — `/next-sn`, `/session`, `/consume` return
  412 `WORKORDER_NOT_BUILT` before touching `lic.used`.
- **Prod-mode elevation** — when the flasher adopts a bearer from the uploaded
  `.myfw`, `cfg.isDev` flips to `false`. This closes the previous silent-mock
  path where burns "succeeded" locally without touching the server.
- **Plaintext buffer zeroed** — after `writeFlash` completes the client
  `plain.fill(0)` the decrypted firmware buffer before releasing the reference.
- **Blob strict fallback** — `readFirmware` no longer silently degrades from
  Blob → disk on any non-404 Blob error.

### Storage
- **Client-side direct-to-Blob** firmware upload — mints a 60-second signed
  client token via `generateClientTokenFromReadWriteToken` and lets the browser
  PUT bytes straight to `blob.vercel-storage.com`. Bypasses Vercel Functions'
  request-body cap for 15 MB firmware `.bin`. Vendored bundle at
  `public/vendor/vercel-blob-client.js` — no third-party CDN dependency.
- **Audit log LTRIM cap** — `audit:{id}` list capped at 5000 most-recent
  entries per workorder (~1 MB) so Upstash Redis budget survives long runs.
- **Tickets released** — `/consume` SREMs the ticket from `tickets:{id}` on
  both success and failure paths, preventing false quota exhaustion.

### UX
- **English by default** — language detection no longer falls back to Chinese
  when neither URL param nor localStorage is set.
- **Mode badge live update** — adopting a bearer dispatches a
  `mff:mode-change` event; the badge switches from "Develop" to
  "Production · WO-…" the moment upload succeeds.
- **Streaming download with progress** — `/api/package/{id}?url=1` returns
  `{ url, size }` JSON, the client fetches Blob CDN directly with a
  ReadableStream reader and updates a progress bar in real time.
- **Streaming upload with progress** — admin firmware upload runs through
  `@vercel/blob/client` `put()` with `onUploadProgress` driving a live
  Cinnabar-filled progress bar.
- **Multi-stage upload status** — flasher `.myfw` picker walks through
  ⏳ read → ⏳ parse → ⏳ sync → ✓ ready (or ✕ with reason).
- **Auto-flash gated by uploaded `.myfw`** — hot-plug events are ignored until
  a valid file is loaded. Previously they consumed SN reservations.
- **CTA chain** — build-package success shows an "Open Flasher ↗" button
  auto-populated with the new workorder id; a green "Ready · plug a board"
  banner shows in the workorder card once the `.myfw` is loaded and quota
  remains; empty-buildable state focuses the "new workorder" input.
- **Fonts** — English serif upgraded to Fraunces (display) + Newsreader
  (body) so mid-body text no longer feels thin. Logo `MY FRAME` stays on
  Cormorant Garamond.
- **Admin header** enlarged so `MY FRAME · Admin · Production Center` reads
  at hero rhythm, not header-decoration size.
- **Audit table** shows both success (✓) and failure (✕) rows with error
  detail column; SN/MAC cells are click-to-copy; column headers sort;
  new "Export CSV" button dumps the current view.
- **Polling pauses when tab hidden** — no wasted RPCs while the admin tab
  is in background.
- **Legacy `.myfw` and workorder-mismatch banners** include one-click links
  to the correct URL / admin page.
- **Friendly disconnect message** — mid-flash board pulls now show
  "Board disconnected · re-plug and retry" instead of raw esptool errors.
- **`clearBtn` confirms** when any slot is still in progress.
- **12-color palette compliance** — all off-palette hex values removed;
  status backgrounds use `--tint-error/warn/success` half-tinted tokens.

### Storage hygiene
- **Client-side firmware cache release** — swapping the uploaded `.myfw`
  clears the previous encrypted-buffer reference so it can be GC'd.
- **Package overwrite** — `putPackage` uses `allowOverwrite: true` on the
  same workorder pathname so rebuilds don't accumulate blobs. Combined
  with the one-shot workorder guard, only one blob exists per workorder.

### API changes (client-visible)
- `POST /api/admin/workorders` — new. Creates a workorder.
- `POST /api/firmwares?name=…` — no longer accepts an octet-stream body.
  Returns a 60 s client-upload token instead.
- `GET  /api/package/{id}?url=1` — new JSON mode returning `{ url, size }`.
- `POST /api/workorder/{id}/consume` — merged the old `/report` endpoint
  (branches on `smokeOk`) to fit Vercel Hobby's 12-function limit.
- All `/api/workorder/{id}/*` endpoints now require a bearer that matches
  `wo.bearer`; `demo` bearers rejected server-side.

---

## v1.0.0 · 2026-08-19

Initial Vercel deployment. AES-256-GCM chunked packages, HMAC challenge-
response session, admin console, multi-board Web Serial flashing.
