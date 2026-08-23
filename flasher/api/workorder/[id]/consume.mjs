// Dual-purpose endpoint (Hobby plan limits us to 12 functions, so we don't
// have room for a separate `report` route). One of two branches runs based
// on `smokeOk`:
//   smokeOk: true  → SUCCESS  → increment license.used, mark ticket used,
//                               append `consume` audit row.
//   smokeOk: false → FAILURE  → append `report` audit row, quota untouched.
// (The `error` field, if set, is stored in the report row.)

import { kvGet, kvSet, kvSismember, kvSadd, kvSrem, kvLpush, kvLtrim, kvIncrBy, kvDel } from '../../_lib/kv.mjs';
import { handler, bearerOf, isDemoBearer, bearerMatchesWorkorder, json } from '../../_lib/http.mjs';
import { looksLikeRealMac } from '../../_lib/sn.mjs';

// Cap the per-workorder audit list at the most recent AUDIT_CAP entries.
// Every LPUSH is followed by LTRIM(0, AUDIT_CAP-1). At ~200 B per entry
// that bounds each workorder's audit footprint to ~1 MB in Upstash Redis,
// so the free-tier 256 MB budget survives arbitrarily long production runs.
const AUDIT_CAP = 5000;

export default handler(async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });
  const id = req.query.id;
  const wo = await kvGet(`workorder:${id}`);
  if (!wo) return json(res, 404, { error: 'workorder not found' });
  if (!wo.license) return json(res, 412, { error: 'workorder has no license yet', code: 'WORKORDER_NOT_BUILT' });
  const bearer = bearerOf(req);
  if (!bearer) return json(res, 401, { error: 'bearer required' });
  if (isDemoBearer(bearer)) return json(res, 401, { error: 'demo bearer rejected', code: 'DEMO_BEARER_REJECTED' });
  if (!bearerMatchesWorkorder(bearer, wo)) {
    return json(res, 401, { error: 'bearer does not match this workorder', code: 'WORKORDER_BEARER_MISMATCH' });
  }

  const { ticket, sn, chipMac, smokeOk, error, stage } = req.body || {};
  if (!looksLikeRealMac(chipMac)) return json(res, 400, { error: 'chipMac missing or looks fake', received: chipMac });
  if (!ticket) return json(res, 400, { error: 'ticket required' });

  // Failure path — record and return without touching quota. We ALSO
  // release the ticket from the outstanding set so next-sn's quota
  // pre-check doesn't count failed burns against remaining capacity.
  // The ticket:* KV entry itself is deleted so the SN can't be reused
  // via a stale ticket replay.
  if (!smokeOk) {
    await kvLpush(`audit:${id}`, {
      ts: new Date().toISOString(), op: 'report',
      ticket, sn, mac: chipMac, error, stage,
    });
    await kvLtrim(`audit:${id}`, 0, AUDIT_CAP - 1);
    await kvSrem(`tickets:${id}`, ticket);
    await kvDel(`ticket:${ticket}`);
    return json(res, 200, { ok: true, quotaConsumed: false });
  }

  // Success path — pre-checks, then atomic quota consume.
  const tkt = await kvGet(`ticket:${ticket}`);
  if (!tkt) return json(res, 400, { error: 'unknown ticket' });
  if ((await kvSismember(`tickets:${id}:used`, ticket)) === 1) {
    return json(res, 409, { error: 'ticket already consumed' });
  }
  const lic = wo.license;
  if (lic.used >= lic.quota) {
    return json(res, 410, { error: 'license quota exhausted', licenseId: lic.id, quota: lic.quota, used: lic.used });
  }

  // Atomic increment — if two consumes race, INCRBY sequences them; only
  // the first to push used past quota-1 succeeds because we re-fetch and
  // reverse if we overshot.
  const newUsed = await kvIncrBy(`workorder:${id}:used`, 1);
  if (newUsed > lic.quota) {
    await kvIncrBy(`workorder:${id}:used`, -1);
    return json(res, 410, { error: 'license quota exhausted (race)', licenseId: lic.id, quota: lic.quota });
  }
  wo.license.used = newUsed;
  await kvSet(`workorder:${id}`, wo);
  await kvSadd(`tickets:${id}:used`, ticket);
  // Ticket lifecycle: remove from outstanding set so next-sn's SCARD math
  // reflects reality. Keep the used-set entry (replay guard) and the audit
  // row, but drop the per-ticket key since it has served its purpose.
  await kvSrem(`tickets:${id}`, ticket);
  await kvDel(`ticket:${ticket}`);
  await kvLpush(`audit:${id}`, {
    ts: new Date().toISOString(), op: 'consume',
    ticket, licenseId: lic.id,
    sn, mac: chipMac,
    fwName: lic.fwName || null,
    ruleId: tkt.ruleId, smokeOk: true,
    remaining_after: lic.quota - newUsed,
  });
  await kvLtrim(`audit:${id}`, 0, AUDIT_CAP - 1);
  console.log(`[api] consumed 1 · license ${lic.id} · ${newUsed}/${lic.quota} used`);
  return json(res, 200, {
    ok: true, quotaConsumed: true,
    remaining: lic.quota - newUsed,
    licenseId: lic.id, quota: lic.quota, used: newUsed,
  });
});
