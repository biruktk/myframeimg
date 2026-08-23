import crypto from 'node:crypto';
import { kvGet, kvSet, kvDel } from '../../_lib/kv.mjs';
import { handler, bearerOf, isDemoBearer, bearerMatchesWorkorder, json } from '../../_lib/http.mjs';
import { hmacSha256Hex, unwrapKey } from '../../_lib/crypto.mjs';

export default handler(async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });
  const id = req.query.id;
  const wo = await kvGet(`workorder:${id}`);
  if (!wo) return json(res, 404, { error: 'workorder not found' });
  const bearer = bearerOf(req);
  if (!bearer) return json(res, 401, { error: 'bearer required' });
  if (isDemoBearer(bearer)) {
    return json(res, 401, { error: 'demo bearer rejected in production', code: 'DEMO_BEARER_REJECTED' });
  }
  if (!bearerMatchesWorkorder(bearer, wo)) {
    return json(res, 401, { error: 'bearer does not match this workorder', code: 'WORKORDER_BEARER_MISMATCH' });
  }
  const { challenge, response, licenseId } = req.body || {};

  const ch = await kvGet(`challenge:${id}:${challenge}`);
  if (!ch) return json(res, 400, { error: 'unknown or already-used challenge' });
  if (ch.bearer !== bearer) return json(res, 403, { error: 'bearer mismatch' });

  const expected = hmacSha256Hex(bearer, challenge);
  const a = Buffer.from(expected, 'utf-8');
  const b = Buffer.from(String(response || '').toLowerCase(), 'utf-8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return json(res, 403, { error: 'response mismatch' });
  }
  const lic = wo.license;
  // A workorder created but not yet build-package'd has license:null. Refuse
  // the session so the client sees a real error, not a 500 on lic.used.
  if (!lic) {
    return json(res, 412, {
      error: 'workorder has no license yet — admin must build the package first',
      code: 'WORKORDER_NOT_BUILT',
    });
  }
  if (licenseId && licenseId !== lic.id) {
    return json(res, 409, { error: `license mismatch (file=${licenseId}, server=${lic.id})` });
  }
  if (lic.used >= lic.quota) return json(res, 410, { error: 'license quota exhausted' });
  // License expiration check — refuse to release the AES key past the
  // license's expiresAt. Without a session, the client cannot decrypt the
  // .myfw, so this alone bounds burns to the license validity window.
  if (lic.expiresAt && new Date(lic.expiresAt).getTime() < Date.now()) {
    return json(res, 410, {
      error: `license expired at ${lic.expiresAt}`,
      code: 'LICENSE_EXPIRED',
      licenseId: lic.id, expiresAt: lic.expiresAt,
    });
  }

  // One-shot: consume the challenge so the same nonce can't be reused.
  await kvDel(`challenge:${id}:${challenge}`);

  // Unwrap the stored AES key just-in-time. The stored form is opaque to
  // Redis operators; the raw key only exists in this function's stack for
  // the duration of the response. Legacy plaintext keys (pre-KEK) throw a
  // clear "rebuild required" error — no silent fallback that would defeat
  // the whole point of at-rest wrapping.
  let rawKeyHex;
  try {
    rawKeyHex = unwrapKey(wo.packageKey).toString('hex');
  } catch (e) {
    return json(res, 500, {
      error: `package key at rest is unreadable: ${e.message}`,
      code: /legacy plaintext/.test(e.message) ? 'LEGACY_KEY' : 'KEY_UNWRAP_FAILED',
    });
  }

  const sessId = crypto.randomBytes(24).toString('base64url');
  await kvSet(`session:${sessId}`, { workorderId: id, bearer, licenseId: lic.id }, { ex: 300 });
  console.log(`[api] session opened · session=${sessId.slice(0, 12)}… · license=${lic.id} · key=${wo.packageKeyId}`);
  return json(res, 200, {
    sessionId: sessId,
    packageKey: rawKeyHex,
    keyId: wo.packageKeyId,
    expiresIn: 300,
  });
});
