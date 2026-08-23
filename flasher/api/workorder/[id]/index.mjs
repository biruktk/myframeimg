import { kvGet } from '../../_lib/kv.mjs';
import { handler, json } from '../../_lib/http.mjs';

export default handler(async (req, res) => {
  if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' });
  const id = req.query.id;
  const wo = await kvGet(`workorder:${id}`);
  if (!wo) return json(res, 404, { error: 'workorder not found' });
  const lic = wo.license || {};
  const fwDisplay = lic.fwName || wo.fwSha || '-';
  return json(res, 200, {
    id: wo.id,
    shortCode: wo.shortCode,
    fwName: fwDisplay,
    fwSha: fwDisplay,
    license: { ...lic, remaining: Math.max(0, (lic.quota || 0) - (lic.used || 0)) },
    quota: lic.quota,
    used: lic.used,
    snRules: wo.snRules,
    snRule: (wo.snRules || [])[0],
  });
});
