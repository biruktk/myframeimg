// Shared HTTP helpers — Vercel Serverless Functions receive Node req/res
// objects (unlike Edge Functions which use Web fetch). Everything here is
// the Node handler style.

import crypto from 'node:crypto';
import { kvGet, kvSismember, kvSet, kvDel, ensureSeeded } from './kv.mjs';

// ADMIN_PASSWORD source of truth — env in prod, dev-only literal fallback
// with a loud console warning so a mis-configured deployment doesn't
// silently ship with the documented demo password.
export const ADMIN_PASSWORD = (() => {
  const env = process.env.ADMIN_PASSWORD;
  if (env && env.length >= 8) return env;
  if (env) console.warn(`[api] ADMIN_PASSWORD env is only ${env.length} chars — falling back to demo`);
  else console.warn('[api] ADMIN_PASSWORD env not set — using demo password "Abcd1234". Set ADMIN_PASSWORD before shipping.');
  return 'Abcd1234';
})();

// Wrap a handler so every function does: CORS preflight, body parse, error
// isolation, and the one-time KV seed. This is the entry point every route
// uses.
export function handler(fn) {
  return async (req, res) => {
    // CORS — permissive because Web Serial demos may embed the flasher in
    // other origins (kiosk shells, etc.). Tighten in prod as needed.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }

    try {
      await ensureSeeded();
      // Vercel already parses JSON body when Content-Type is application/json.
      if (typeof req.body === 'string') { try { req.body = JSON.parse(req.body); } catch { /* ignore */ } }
      req.body = req.body || {};
      await fn(req, res);
    } catch (e) {
      console.error('[api] handler error:', e);
      res.status(500).json({ error: 'internal', detail: e.message });
    }
  };
}

export function bearerOf(req) {
  const auth = req.headers['authorization'] || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

// A short list of bearers the flasher must NEVER accept in production, so
// a stale demo URL that leaked to the internet can't trigger the HMAC
// handshake and pull the AES key. If ALLOW_DEMO_BEARER=1 is set (local
// dev / CI), the check is bypassed. In production leave it unset.
const DEMO_BEARERS = new Set(['demo', 'test', 'dev', '']);
export function isDemoBearer(tok) {
  if (process.env.ALLOW_DEMO_BEARER === '1') return false;
  return DEMO_BEARERS.has((tok || '').toLowerCase());
}

// Every /workorder/:id/* endpoint MUST verify the request's Bearer matches
// the token minted for that workorder at build-package time. This is the
// only real authN layer — without it, knowing the workorder id would be
// enough to drive the HMAC handshake. The per-workorder token travels
// inside the .myfw's license header, so anyone who legitimately received
// the .myfw can burn; anyone who only knows the id cannot.
export function bearerMatchesWorkorder(bearer, wo) {
  if (!bearer || !wo?.bearer) return false;
  // Constant-time comparison to avoid timing leaks on the 32-byte token.
  const a = Buffer.from(bearer);
  const b = Buffer.from(wo.bearer);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function isAdmin(req) {
  const tok = bearerOf(req);
  if (!tok) return false;
  return (await kvSismember('admin:tokens', tok)) === 1;
}

// Simple JSON responder (used for early returns).
export function json(res, status, body) { res.status(status).json(body); }
