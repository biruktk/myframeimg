// Rather than stream the (multi-MB) package through the serverless function
// — which would blow past Vercel's 4.5 MB response cap — we 302-redirect the
// client to the Vercel Blob URL. The client's `fetch()` follows redirects
// transparently, so no client-side change is needed.
//
// Local dev without Blob: readLocalPackage() serves from /tmp.

import { kvGet } from '../../_lib/kv.mjs';
import { readLocalPackage } from '../../_lib/blob.mjs';
import { handler, json } from '../../_lib/http.mjs';

export default handler(async (req, res) => {
  if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' });
  const id = req.query.id;
  const wo = await kvGet(`workorder:${id}`);
  if (!wo) return json(res, 404, { error: 'workorder not found' });
  const url = wo.packageBlobUrl;
  if (!url) return json(res, 412, {
    error: 'no encrypted package built for this workorder',
    hint: 'Log into the admin panel and click 「生成 .myfw」 first.',
    adminUrl: '/admin.html',
  });

  // Prod: Blob URL — redirect.
  if (url.startsWith('http')) {
    res.setHeader('X-Package-Type', 'myfw-aesgcm');
    res.setHeader('X-Workorder', id);
    return res.redirect(302, url);
  }
  // Local dev: `local:/tmp/...` — read the bytes and stream them.
  const buf = await readLocalPackage(id);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', buf.length);
  res.setHeader('X-Package-Type', 'myfw-aesgcm');
  res.setHeader('X-Workorder', id);
  res.status(200).send(buf);
});
