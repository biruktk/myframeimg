// GET  /api/admin/workorders                  — list all workorders
// POST /api/admin/workorders  { id, shortCode } — create a new workorder
//                                                 (id must not already exist)

import { kvGet, kvSet } from '../_lib/kv.mjs';
import { handler, isAdmin, json } from '../_lib/http.mjs';

// Workorder id shape: alphanumeric + hyphen, 4-40 chars. Case-sensitive to
// stay close to the ordering-system's canonical form.
function isValidWorkorderId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9-]{4,40}$/.test(id);
}

export default handler(async (req, res) => {
  if (!(await isAdmin(req))) return json(res, 401, { error: 'admin login required' });

  if (req.method === 'GET') {
    const ids = (await kvGet('workorders:index')) || [];
    const workorders = [];
    for (const id of ids) {
      const wo = await kvGet(`workorder:${id}`);
      if (!wo) continue;
      const lic = wo.license || {};
      workorders.push({
        id: wo.id, shortCode: wo.shortCode,
        hasPackage: !!wo.packageBlobUrl,
        license: {
          id: lic.id, quota: lic.quota, used: lic.used,
          remaining: Math.max(0, (lic.quota || 0) - (lic.used || 0)),
          fwName: lic.fwName,
        },
      });
    }
    return json(res, 200, { workorders });
  }

  if (req.method === 'POST') {
    const { id, shortCode } = req.body || {};
    if (!isValidWorkorderId(id)) {
      return json(res, 400, { error: 'invalid id — must match [A-Za-z0-9-]{4,40}' });
    }
    // Reject collision with any existing workorder — enforces "once used,
    // never reused" from the admin's angle. A rebuilt batch requires a new
    // id so used/fwName/expires are always monotone per workorder.
    const existing = await kvGet(`workorder:${id}`);
    if (existing) return json(res, 409, { error: `workorder ${id} already exists` });

    const doc = {
      id, shortCode: shortCode || id,
      fwSha: null,
      license: null,
      snRules: [{
        id: 'sn-wo-seq',
        label: 'Workorder + seq',
        template: 'MYF-{wo}-{seq:5}-{check:1}',
        seqStart: 1,
        check: 'luhn-mod10',
      }],
      packagePath: null,
      packageKey: null,
      packageKeyId: null,
      packageBlobUrl: null,
    };
    await kvSet(`workorder:${id}`, doc);
    const idx = (await kvGet('workorders:index')) || [];
    if (!idx.includes(id)) {
      idx.push(id);
      await kvSet('workorders:index', idx);
    }
    console.log(`[api] workorder created: ${id}`);
    return json(res, 200, { ok: true, id, shortCode: doc.shortCode });
  }

  return json(res, 405, { error: 'method not allowed' });
});
