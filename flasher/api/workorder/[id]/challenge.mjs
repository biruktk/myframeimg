import crypto from 'node:crypto';
import { kvGet, kvSet } from '../../_lib/kv.mjs';
import { handler, bearerOf, isDemoBearer, bearerMatchesWorkorder, json } from '../../_lib/http.mjs';

export default handler(async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });
  const id = req.query.id;
  const wo = await kvGet(`workorder:${id}`);
  if (!wo) return json(res, 404, { error: 'workorder not found' });
  const bearer = bearerOf(req);
  if (!bearer) return json(res, 401, { error: 'bearer required' });
  // Reject well-known placeholder bearers ("demo", "test", …) so leaked
  // dev URLs can't drive the HMAC handshake in production. Local dev sets
  // ALLOW_DEMO_BEARER=1 to bypass this guard.
  if (isDemoBearer(bearer)) {
    return json(res, 401, {
      error: 'bearer looks like a demo placeholder — production requires a real token',
      code: 'DEMO_BEARER_REJECTED',
    });
  }
  // Per-workorder bearer — must match what build-package.mjs stored on the
  // workorder doc. If a workorder has no `bearer` field (legacy, never
  // rebuilt after this migration), we refuse rather than silently accept.
  if (!bearerMatchesWorkorder(bearer, wo)) {
    return json(res, 401, {
      error: 'bearer does not match this workorder — use the token embedded in the .myfw',
      code: 'WORKORDER_BEARER_MISMATCH',
    });
  }
  const nonce = crypto.randomBytes(32).toString('hex');
  // 60 s TTL — challenges auto-expire in KV so we don't need periodic cleanup.
  await kvSet(`challenge:${id}:${nonce}`, { bearer, createdAt: new Date().toISOString() }, { ex: 60 });
  return json(res, 200, { challenge: nonce, expiresIn: 60, algorithm: 'HMAC-SHA256' });
});
