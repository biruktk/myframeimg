import crypto from 'node:crypto';
import { kvSadd, kvSet, kvGet, kvIncrBy, kvDel } from '../_lib/kv.mjs';
import { handler, json, ADMIN_PASSWORD } from '../_lib/http.mjs';

// Rate-limit config — 5 wrong attempts within any 15-minute rolling window
// locks the origin IP for 15 minutes. Buckets are keyed by IP so a single
// worker at a factory floor NAT can still recover; a targeted brute force
// from one attacker's IP hits the wall quickly.
const MAX_ATTEMPTS = 5;
const WINDOW_S = 15 * 60;

function clientIp(req) {
  // Vercel sets x-forwarded-for with the real client IP first, then the
  // chain of proxies. Falls back to remoteAddress for local dev.
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

export default handler(async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });
  const ip = clientIp(req);
  const bucketKey = `login:fail:${ip}`;

  // Lockout check — if a previous burst already crossed MAX_ATTEMPTS the
  // bucket carries a TTL of WINDOW_S seconds. As long as the key exists
  // above threshold we short-circuit with 429; the count itself expires
  // naturally so no janitor is needed.
  const cur = Number((await kvGet(bucketKey)) || 0);
  if (cur >= MAX_ATTEMPTS) {
    return json(res, 429, {
      error: `too many failed attempts · locked ${Math.ceil(WINDOW_S / 60)} min`,
      code: 'LOGIN_LOCKED',
    });
  }

  const { password } = req.body || {};
  if (password !== ADMIN_PASSWORD) {
    // Increment + set TTL. First failure sets the window; subsequent
    // failures within it bump the counter without extending the TTL.
    const n = await kvIncrBy(bucketKey, 1);
    if (n === 1) await kvSet(bucketKey, 1, { ex: WINDOW_S });
    console.log(`[api] login fail from ${ip} · ${n}/${MAX_ATTEMPTS}`);
    return json(res, 401, {
      error: 'wrong password',
      attemptsLeft: Math.max(0, MAX_ATTEMPTS - n),
    });
  }

  // Success — reset the counter for this IP so a legitimate operator who
  // fat-fingered once doesn't stay in the penalty box.
  await kvDel(bucketKey);
  const tok = crypto.randomBytes(24).toString('base64url');
  await kvSadd('admin:tokens', tok);
  // 24 h expiry — store as a separate key to give a bulk clean opportunity;
  // membership check still uses the set.
  await kvSet(`admin:token:${tok}`, { createdAt: new Date().toISOString() }, { ex: 86400 });
  return json(res, 200, { token: tok });
});
