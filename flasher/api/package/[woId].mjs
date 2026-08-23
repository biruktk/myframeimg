// Admin download endpoint. In prod, 302-redirects to the Vercel Blob URL
// so the browser triggers a save-as. In local dev, streams the /tmp file.

import { kvGet } from '../_lib/kv.mjs';
import { readLocalPackage } from '../_lib/blob.mjs';
import { handler, isAdmin, json } from '../_lib/http.mjs';
import path from 'node:path';

export default handler(async (req, res) => {
  if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' });
  if (!(await isAdmin(req))) return json(res, 401, { error: 'admin login required' });
  const woId = req.query.woId || req.query.id;
  const wo = await kvGet(`workorder:${woId}`);
  if (!wo?.packageBlobUrl) return json(res, 404, { error: `no package built for ${woId}` });

  if (wo.packageBlobUrl.startsWith('http')) {
    // Two modes:
    //   ?url=1 → return JSON { url, size } so the client can fetch the
    //            Blob URL directly (browser reads Content-Length + CORS
    //            headers from the public Blob CDN → progress bar works).
    //   default → 302 redirect (legacy path, kept for the "click link
    //             to save" flow used by external tools).
    if (req.query.url === '1') {
      const size = wo.license?.fwSize ? Number(wo.license.fwSize) : null;
      return json(res, 200, {
        url: wo.packageBlobUrl,
        size,
        type: 'application/octet-stream',
        filename: `${woId}.myfw`,
      });
    }
    res.setHeader('X-Package-Type', 'myfw-aesgcm');
    return res.redirect(302, wo.packageBlobUrl);
  }
  // Local dev — stream from /tmp with Content-Disposition so browser saves.
  const buf = await readLocalPackage(woId);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${woId}.myfw"`);
  res.setHeader('Content-Length', buf.length);
  res.setHeader('X-Package-Type', 'myfw-aesgcm');
  res.status(200).send(buf);
});
