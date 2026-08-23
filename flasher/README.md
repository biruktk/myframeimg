# MyFrame Production Center · Vercel Deployment

Chrome-based firmware flasher for ESP32-C5 boards, with an admin console for
generating encrypted, quota-controlled `.myfw` license packages. Every burn is
authenticated, decremented, and audited server-side.

- **Static frontend** in `public/` — served from Vercel's CDN
- **Serverless functions** in `api/*.mjs` — 12 stateless Node routes
- **State** in Vercel KV (Upstash Redis) — atomic quota, per-workorder audit
- **Package storage** in Vercel Blob — 15 MB `.myfw` served via CDN
- **Encryption** — AES-256-GCM chunked; per-workorder AES key wrapped with a
  server KEK at rest; per-workorder bearer embedded in the `.myfw` license
- **Direct-to-Blob uploads** — firmware `.bin` files bypass function body limits

---

## Deploy in 10 minutes

```bash
npm i -g vercel

cd flasher-web-vercel
npm install
vercel link                   # associate with a Vercel project
```

### Attach storage (Vercel dashboard)

`Project → Storage → Create`:
- **KV / Upstash Redis** — auto-injects `KV_REST_API_URL`, `KV_REST_API_TOKEN`
- **Blob** — auto-injects `BLOB_READ_WRITE_TOKEN`

### Environment variables

Set under `Project → Settings → Environment Variables`:

| Variable | Required | Notes |
|---|---|---|
| `MYFRAME_KEK` | **Yes** | 32-byte hex or base64 KEK. Wraps every workorder's AES key at rest. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. **BACK THIS UP** — losing it makes every existing workorder undecryptable. |
| `ADMIN_PASSWORD` | Recommended | Admin login. If unset, ships with the demo password `Abcd1234` and logs a warning on cold start. |
| `ALLOW_DEMO_BEARER` | No | Set to `1` for local `vercel dev` only. Bypasses the demo-bearer guard. Never set in production. |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Yes | Auto-set by the KV integration. |
| `BLOB_READ_WRITE_TOKEN` | Yes | Auto-set by the Blob integration. |

### Ship it

```bash
vercel deploy --prod
```

Open the printed URL, then `/admin` to log in.

---

## Deploying to a different host (not Vercel)

The API layer only depends on:
- **Node.js 18+**
- **Upstash Redis** (or any Redis with the same REST wire; we use `@upstash/redis`)
- **Vercel Blob** (or any S3-compatible store — swap `api/_lib/blob.mjs`)

To run on Cloudflare Workers, Fly.io, Render, self-hosted Node, or your own
Kubernetes cluster:

1. Replace `api/_lib/kv.mjs` with your Redis client (surface: `get/set/del/incrby/lpush/lrange/llen/ltrim/sadd/sismember/scard/srem/keys`).
2. Replace `api/_lib/blob.mjs` with your object storage (surface: `putPackage/readLocalPackage/readFirmware/listFirmwares/putFirmware/deleteFirmware`).
3. Bring your own HTTP router — the handlers in `api/*.mjs` take `(req, res)` Node style.
4. Keep the environment variables the same (or update `_lib/http.mjs` accordingly).

The **static frontend in `public/`** is host-agnostic — any CDN + rewrite
`/admin → admin.html` will serve it as-is.

---

## Wire protocol (server ↔ client)

12 endpoints, all under `/api`:

| Method + Path | Purpose | Auth |
|---|---|---|
| `POST /admin/login` | Password → 24h admin token. Rate-limited: 5 fails per IP per 15 min → 429 lockout. | Password body |
| `GET  /admin/workorders` | List all workorders. | Admin bearer |
| `POST /admin/workorders` | Create workorder (one-shot; existing id → 409). | Admin bearer |
| `POST /admin/build-package` | Build `.myfw`. Rejected with 409 if already built. | Admin bearer |
| `GET  /admin/audit/{woId}` | Audit rows for a workorder (successes + failures). | Admin bearer |
| `GET  /firmwares` | Merged Blob + disk firmware inventory. | Public |
| `POST /firmwares?name=x.bin` | Mint 60 s client-upload token (direct-to-Blob). Same-name → 409. | Admin bearer |
| `DELETE /firmwares?name=x.bin` | Delete Blob-hosted firmware (disk-hosted protected). | Admin bearer |
| `GET  /workorder/{id}` | Workorder metadata. | Any |
| `POST /workorder/{id}/challenge` | HMAC nonce (60 s TTL). | WO bearer |
| `POST /workorder/{id}/session` | Exchange HMAC → packageKey (KEK-unwrapped just-in-time). | WO bearer |
| `POST /workorder/{id}/next-sn` | Atomic SN + ticket. Quota pre-reserved via outstanding set. | WO bearer |
| `POST /workorder/{id}/consume` | `smokeOk:true` → INCR used + audit consume. `smokeOk:false` → audit report only. | WO bearer |
| `GET  /package/{id}` | 302 to Blob URL, or `?url=1` → JSON `{ url, size }` for streaming download. | Admin bearer |

### Auth model

- **Admin bearer** — issued by `/admin/login`. Rate-limited. Used for `/admin/*` and `/firmwares?name=` writes.
- **Workorder bearer** (`wo.bearer`) — minted at `/admin/build-package` time, stored on the workorder document AND embedded in the `.myfw`'s license header as `bearer`. The flasher client reads it after upload and uses it for all four `/workorder/:id/*` calls. Verified with `crypto.timingSafeEqual`.
- **Demo-bearer guard** — `demo/test/dev/""` bearers are rejected in production (`DEMO_BEARER_REJECTED`). Override with `ALLOW_DEMO_BEARER=1` for local dev.

### Data at rest (KV keys)

```
workorder:{id}                → { id, snRules, license: {…}, packageKey (KEK-wrapped), bearer, … }
workorders:index              → [id, id, …]
challenge:{id}:{nonce}        → { bearer } · TTL 60 s
session:{id}                  → { bearer, licenseId } · TTL 300 s
ticket:{ticket}               → { workorderId, sn, chipMac, ruleId } · TTL 900 s
tickets:{id}                  → Set of outstanding tickets  (SREM on consume/report)
tickets:{id}:used             → Set of consumed tickets     (replay guard)
workorder:{id}:used           → INCRBY counter for quota
workorder:{id}:seq:{ruleId}   → INCRBY counter for SN sequence
audit:{id}                    → LPUSH list, LTRIMed at 5000 entries
admin:tokens                  → Set of live admin bearers
admin:token:{tok}             → { createdAt } · TTL 86400 s
login:fail:{ip}               → INCRBY counter · TTL 900 s (rate limit)
```

---

## Full production flow

```
Admin console (/admin)                          Flasher (/)
─────────────────────                           ────────────────────
1. Log in                                       6. Open URL
   → 24 h admin bearer                             /?workorder=WO-XXX
                                                7. Upload .myfw
2. Firmware source management                      → parseLicenseOnly reads header
   Upload / delete .bin (direct-to-Blob)           → workorderId + bearer adopted
                                                   → mode elevates to Production
3. New workorder → POST /admin/workorders          → server sync workorder card
   → wo doc created, index updated              8. Plug board(s)
                                                   → per-board flashOne():
4. Generate .myfw                                    ├─ reserveSN
   → mint random 24-byte bearer                      ├─ openSession (HMAC + KEK unwrap)
   → build AES-GCM chunked package                   ├─ decrypt (client-side, ~15 MB plaintext)
   → wrap AES key with KEK                           ├─ writeFlash + `plain.fill(0)`
   → putPackage to Vercel Blob                       ├─ hard reset + smoke test
   → wo.bearer stored on wo doc                      └─ consume (INCR used + LPUSH audit)
                                                9. Repeat until quota exhausted
5. Auto-download .myfw                             → all attempts land in
   → progress bar via streamed fetch                 audit:{id} (LTRIM 5000)
```

---

## Security-relevant guarantees

- **License file is inert without the workorder bearer** — even a legitimate `.myfw` cannot be decrypted without either the embedded bearer OR direct KV read (attacker needs BOTH `BLOB_READ_WRITE_TOKEN` AND `MYFRAME_KEK`).
- **Bearer + workorder id are validated on every RPC** — `timingSafeEqual` against `wo.bearer`.
- **Quota is atomic** — INCR-based with overshoot rollback; concurrent `/consume` cannot exceed the license limit.
- **Ticket replay is blocked** — every ticket is one-use and SADD'd to `tickets:{id}:used`.
- **License expiry enforced at two points** — `/session` refuses to release the key past `expiresAt`; `/next-sn` refuses to mint an SN.
- **Rate-limited login** — 5 wrong passwords per IP per 15 min → 429 lockout.
- **Chunk streaming** — no full-plaintext buffer server-side. Client zeroes the plaintext buffer right after `writeFlash` returns.

---

## Accepted risks (documented, not yet mitigated)

- **Blob download URL is permanent** — once an admin has fetched a `.myfw`, its Vercel Blob public URL doesn't expire. A leaked URL means the encrypted package can be re-fetched forever. Only bearers embedded in the `.myfw` grant burn rights; without the bearer the file is inert.
- **Bearer is stored in the license JSON plaintext** — an insider who extracts the .myfw file can read the bearer. Quota still bounds their damage; enforcement is by design "possess the file = can burn up to quota", which is the intended production semantic.
- **No `onUploadCompleted` webhook** on firmware uploads — a client-side abort mid-upload can leave a partial Blob. Currently mitigated by `listFirmwares` scanning the bucket on each admin visit.

---

## 🔮 Roadmap · unify admin auth with the main website backend

**Planned** — currently the admin login uses a standalone password → bearer flow.
When the customer-facing MyFrame website goes live, admin access here must be
gated by the **same identity provider** so:

- Factory admins log in via the main website's SSO (WeChat / Google / whatever).
- Their session ID (or JWT) is what `/api/admin/*` endpoints trust.
- Removing an employee from the website's user table immediately revokes their
  production-console access — no separate password to rotate.

Integration options once the website exists:

1. **JWT bearer** — website hands out a short-lived JWT; every `/api/admin/*` request carries it; `_lib/http.mjs` `isAdmin()` verifies signature and role claim.
2. **OAuth 2.0 code flow** — swap `/api/admin/login` for a callback endpoint that redeems an authorization code with the website's `/oauth/token` endpoint.
3. **Reverse proxy** — put the flasher deployment behind the website's API gateway; strip the standalone login entirely.

Whatever the choice, the current `ADMIN_PASSWORD` env variable stays supported
as a break-glass for local development. Production deployments should set it to
a random 32-byte string and rotate on any suspected compromise until SSO ships.

---

## Local dev (`vercel dev`)

```bash
cp .env.example .env.local
# Provide MYFRAME_KEK at minimum:
#   MYFRAME_KEK=<64 hex chars>
#   ALLOW_DEMO_BEARER=1
vercel dev
```

Without `BLOB_READ_WRITE_TOKEN`, `.myfw` packages are stored to `/tmp` and
served back through the function. Without KV credentials, in-memory Map is
used — state is lost on restart.

---

## Regenerate the vendored Blob client bundle

We ship `public/vendor/vercel-blob-client.js` — an esbuild-bundled copy of
`@vercel/blob/client` — so the admin's upload path doesn't depend on esm.sh
or any external CDN. To regenerate when the upstream package updates:

```bash
npm run bundle:blob-client
```

---

## Tests

There's no automated test suite yet. Manual E2E:

1. `/admin` → password → build a workorder → download .myfw.
2. `/?workorder=WO-XXX` → upload → burn a board → verify audit shows +1.
3. Try demo bearer against `/api/workorder/…/challenge` → expect `DEMO_BEARER_REJECTED`.
4. Try wrong password 5× → expect `LOGIN_LOCKED`.
5. Try to rebuild an already-built workorder → expect `WORKORDER_ALREADY_BUILT`.
6. Upload a `.myfw` with a different workorderId → expect mismatch banner.
