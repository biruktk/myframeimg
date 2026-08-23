import { kvGet, kvLrange, kvLlen } from '../../_lib/kv.mjs';
import { handler, isAdmin, json } from '../../_lib/http.mjs';

export default handler(async (req, res) => {
  if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' });
  if (!(await isAdmin(req))) return json(res, 401, { error: 'admin login required' });
  const woId = req.query.woId || req.query.id;
  const wo = await kvGet(`workorder:${woId}`);
  if (!wo) return json(res, 404, { error: `workorder ${woId} not found` });

  const raw = await kvLrange(`audit:${woId}`, 0, -1);
  const woFwName = wo.license?.fwName || '-';
  // Chronological order (LPUSH stores newest-first — we reverse). We return
  // BOTH success (consume) and failure (report) rows so admins can trace
  // failed burns too; the row's `op` field distinguishes them, and the
  // separate `failures` array makes it easy to render both in the UI.
  const chronological = raw.slice().reverse().filter(Boolean);
  const shape = (a) => ({
    ts: a.ts, op: a.op, sn: a.sn ?? null, mac: a.mac ?? null,
    smokeOk: a.smokeOk ?? (a.op === 'consume'),
    fwName: a.fwName || woFwName,
    licenseId: a.licenseId ?? null,
    ruleId: a.ruleId ?? null,
    error: a.error ?? null,
    stage: a.stage ?? null,
  });
  const entries  = chronological.filter((a) => a.op === 'consume').map(shape);
  const failures = chronological.filter((a) => a.op === 'report').map(shape);

  return json(res, 200, {
    workorderId: wo.id,
    shortCode: wo.shortCode,
    license: wo.license,
    count: entries.length,
    failureCount: failures.length,
    entries,
    failures,
  });
});
