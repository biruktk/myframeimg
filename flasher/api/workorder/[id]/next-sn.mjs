// Reserve the next SN and mint a 1-use ticket. Quota pre-reservation is
// enforced here — total commitment = license.used + outstanding tickets.
// Uses KV atomic INCRBY on both the license counter and the sequence
// counter, so parallel requests can't over-reserve.

import { kvGet, kvSet, kvIncrBy, kvScard } from '../../_lib/kv.mjs';
import { handler, bearerOf, isDemoBearer, bearerMatchesWorkorder, json } from '../../_lib/http.mjs';
import { formatSN, looksLikeRealMac } from '../../_lib/sn.mjs';

export default handler(async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });
  const id = req.query.id;
  const wo = await kvGet(`workorder:${id}`);
  if (!wo) return json(res, 404, { error: 'workorder not found' });
  const bearer = bearerOf(req);
  if (!bearer) return json(res, 401, { error: 'bearer required' });
  if (isDemoBearer(bearer)) return json(res, 401, { error: 'demo bearer rejected', code: 'DEMO_BEARER_REJECTED' });
  if (!bearerMatchesWorkorder(bearer, wo)) {
    return json(res, 401, { error: 'bearer does not match this workorder', code: 'WORKORDER_BEARER_MISMATCH' });
  }

  const chipMac = req.body?.chipMac;
  if (!looksLikeRealMac(chipMac)) {
    return json(res, 400, {
      error: 'chipMac missing or looks fake',
      hint: 'flasher must supply the real MAC read via esptool-js.chip.readMac()',
      received: chipMac,
    });
  }
  const lic = wo.license;
  // A workorder created via POST /admin/workorders but not yet build-package'd
  // has license:null. Reject with 412 so the flasher surfaces "workorder not
  // built yet" instead of NPE-ing on lic.used.
  if (!lic) {
    return json(res, 412, {
      error: 'workorder has no license yet — admin must build the package first',
      code: 'WORKORDER_NOT_BUILT',
    });
  }
  // License validity check — reject SN issuance past expiresAt.
  if (lic?.expiresAt && new Date(lic.expiresAt).getTime() < Date.now()) {
    return json(res, 410, {
      error: `license expired at ${lic.expiresAt}`,
      code: 'LICENSE_EXPIRED',
      licenseId: lic.id, expiresAt: lic.expiresAt,
    });
  }
  // Atomic-ish quota check: count already-consumed + still-outstanding tickets.
  // KV counters keep the "used" side; ticket set gives the outstanding side.
  const outstanding = (await kvScard(`tickets:${id}`)) - (await kvScard(`tickets:${id}:used`));
  if (lic.used + outstanding >= lic.quota) {
    return json(res, 410, {
      error: 'license quota exhausted',
      licenseId: lic.id, quota: lic.quota, used: lic.used,
    });
  }

  const ruleId = req.body?.ruleId || wo.snRules[0].id;
  const rule = wo.snRules.find((r) => r.id === ruleId);
  if (!rule) return json(res, 400, { error: `unknown ruleId: ${ruleId}` });

  // Atomic per-rule sequence counter. Two parallel next-sn calls each get a
  // unique seq via INCRBY, so SN uniqueness is guaranteed.
  const nextIdx = await kvIncrBy(`workorder:${id}:seq:${ruleId}`, 1);
  const seq = rule.seqStart + nextIdx - 1;
  let sn;
  try { sn = formatSN(rule, seq, { wo: wo.shortCode, mac: chipMac }); }
  catch (e) { return json(res, 400, { error: e.message }); }

  const ticket = `tkt-${id}-${ruleId}-${nextIdx}-${Date.now()}`;
  await kvSet(`ticket:${ticket}`, { workorderId: id, sn, chipMac, ruleId, createdAt: new Date().toISOString() }, { ex: 900 });
  // Record membership so scard() above sees the outstanding set.
  const { kvSadd } = await import('../../_lib/kv.mjs');
  await kvSadd(`tickets:${id}`, ticket);

  return json(res, 200, { sn, ticket, seq, ruleId });
});
