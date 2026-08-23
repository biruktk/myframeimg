import crypto from 'node:crypto';
import { kvGet, kvSet } from '../_lib/kv.mjs';
import { handler, isAdmin, json } from '../_lib/http.mjs';
import { genAesKey, buildPackage, sha256Hex, wrapKey, CHUNK_SIZE } from '../_lib/crypto.mjs';
import { readFirmware, putPackage } from '../_lib/blob.mjs';

export default handler(async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });
  if (!(await isAdmin(req))) return json(res, 401, { error: 'admin login required' });
  const {
    workorderId, licenseId, quota = 10, expiresAt = '2027-12-31T23:59:59Z',
    snRuleId, fwName, factoryId = 'F-DEMO',
  } = req.body || {};

  const wo = await kvGet(`workorder:${workorderId}`);
  if (!wo) return json(res, 404, { error: `workorder ${workorderId} not found` });
  if (!fwName) return json(res, 404, { error: 'fwName required' });

  // One-shot workorder policy: once a .myfw has been built for a workorder,
  // it becomes immutable. Any rebuild attempt is rejected — admin must
  // create a fresh workorder id (POST /api/admin/workorders). This makes
  // used/quota/audit strictly monotone per workorder and prevents silent
  // resets that would confuse the factory floor.
  if (wo.packageBlobUrl) {
    return json(res, 409, {
      error: `workorder ${workorderId} already has a package built; create a new workorder to rebuild`,
      code: 'WORKORDER_ALREADY_BUILT',
      existingLicenseId: wo.license?.id,
      existingFwName: wo.license?.fwName,
    });
  }

  let fwBytes;
  try { fwBytes = await readFirmware(fwName); }
  catch (e) { return json(res, 404, { error: `firmware not found: ${fwName}`, detail: e.message }); }

  const rule = (wo.snRules || []).find((r) => r.id === snRuleId) || wo.snRules[0];
  const licId = licenseId || `LIC-${workorderId}-${Date.now()}`;

  // Per-workorder bearer minted at build time. Travels with the .myfw so
  // the flasher can authenticate to /challenge /session /next-sn /consume
  // without needing a URL ?token=. The server keeps its own copy on the
  // workorder doc; endpoints only accept requests whose Bearer matches.
  const workorderBearer = crypto.randomBytes(24).toString('base64url');

  const licenseMeta = {
    id: licId, licenseId: licId, workorderId, quota, used: 0,
    issuedAt: new Date().toISOString(), expiresAt, factoryId,
    snRule: rule, fwName,
    bearer: workorderBearer,       // embedded in .myfw so flasher reads it
  };

  const key = genAesKey();
  const { bytes, keyId, fwSha256 } = buildPackage(licenseMeta, fwBytes, key);
  const blobUrl = await putPackage(workorderId, bytes);

  // Wrap the raw AES key with the server KEK before persisting to KV. The
  // wrapped form cannot be decrypted by anyone holding only the Upstash
  // token — an attacker would also need the MYFRAME_KEK env var. session.mjs
  // unwraps back to raw before returning the hex key to the client (which
  // still requires passing the HMAC challenge).
  wo.packageBlobUrl = blobUrl;
  wo.packageKey     = wrapKey(key);   // "kek1:<iv>:<ct>:<tag>"
  wo.packageKeyId   = keyId;
  wo.bearer         = workorderBearer;   // matched against Bearer header on every /workorder/:id/* call
  wo.license = {
    ...licenseMeta, used: 0,
    cipher: 'AES-256-GCM (chunked)',
    chunkSize: CHUNK_SIZE, keyId,
    fwSize: fwBytes.length, fwSha256,
  };
  await kvSet(`workorder:${workorderId}`, wo);
  // Reset ancillary state for this batch.
  await kvSet(`workorder:${workorderId}:seq:${rule.id}`, 0);
  // Note: we don't wipe old audit entries — history is append-only across
  // batches. If you want per-batch audit isolation, key by license id.

  console.log(`[api] built package ${workorderId}.myfw · fw=${fwName} · quota=${quota} · size=${bytes.length}B · license=${licId} · keyId=${keyId}`);
  return json(res, 200, {
    ok: true,
    packageBytes: bytes.length,
    licenseId: licId,
    keyId,
    cipher: 'AES-256-GCM (chunked)',
    // downloadPath is joined with SERVER (which already ends in /api) on the
    // client, so it must NOT include the /api prefix itself — otherwise the
    // request lands on /api/api/package/… and 404s.
    downloadPath: `/package/${workorderId}`,
  });
});
