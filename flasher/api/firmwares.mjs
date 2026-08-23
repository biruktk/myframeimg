// GET    /api/firmwares                     — public list (merged Blob + disk)
// POST   /api/firmwares (JSON body)         — client-upload token exchange
//                                             (fires when @vercel/blob/client
//                                              upload() calls handleUploadUrl)
// DELETE /api/firmwares?name=x              — admin delete (Blob-hosted only)
//
// The old raw-octet-stream POST path was removed because Vercel's default
// request-body cap rejected 15 MB firmware .bin uploads with a 413 before
// the function ever ran. Client-side direct-to-Blob upload has no such
// limit — the browser PUTs directly to blob.vercel-storage.com with a
// short-lived signed token minted here.

import {
  listFirmwares, deleteFirmware, isValidFirmwareName,
} from './_lib/blob.mjs';
import { handler, json, isAdmin } from './_lib/http.mjs';

const MAX_UPLOAD = 100 * 1024 * 1024;

function versionKey(name) {
  const m = name.toLowerCase().match(/fw[-_]?(\d+(?:\.\d+)+)/);
  if (!m) return [-1];
  return m[1].split('.').map(Number);
}
function cmpVersion(a, b) {
  const av = versionKey(a.id), bv = versionKey(b.id);
  for (let i = 0; i < Math.max(av.length, bv.length); i++) {
    const diff = (bv[i] || 0) - (av[i] || 0);
    if (diff) return diff;
  }
  return a.id.localeCompare(b.id);
}

export default handler(async (req, res) => {
  if (req.method === 'GET') {
    const bins = (await listFirmwares()).sort(cmpVersion);
    const firmwares = bins.map((b) => ({
      id: b.id,
      label: `${b.id} (${b.size.toLocaleString()} B)`,
      url: `firmware/${b.id}`,
      size: b.size,
      mtimeIso: b.mtimeIso,
      source: b.source,          // 'blob' (deletable) or 'disk' (immutable)
      deletable: b.source === 'blob',
    }));
    return json(res, 200, { firmwares });
  }

  if (req.method === 'POST') {
    // Mint a short-lived client-upload token for one specific firmware
    // pathname. The browser PUTs the .bin directly to blob.vercel-storage.com
    // using this token — no large body ever traverses this function, so
    // Vercel's default body cap doesn't reject 15 MB firmware uploads.
    // Admin auth happens HERE (before mint), not on the Blob PUT.
    if (!(await isAdmin(req))) {
      return json(res, 401, { error: 'admin bearer required' });
    }
    const name = req.query?.name;
    if (!isValidFirmwareName(name)) {
      return json(res, 400, { error: 'invalid name — must match [A-Za-z0-9._-]+.bin' });
    }
    // Overwrite policy — same-name upload is REFUSED unless the caller
    // passes ?force=1. This blocks the "stolen admin token replaces
    // shipped firmware" supply-chain attack (see audit H3). Force also
    // requires a same-request confirm flag so a stale bookmark can't
    // trigger it silently.
    const force = req.query?.force === '1';
    const { listFirmwares } = await import('./_lib/blob.mjs');
    const existing = (await listFirmwares()).find((f) => f.id === name);
    if (existing && !force) {
      return json(res, 409, {
        error: `firmware ${name} already exists (source=${existing.source}); rename or pass ?force=1 to replace`,
        code: 'FIRMWARE_EXISTS',
        existing: { source: existing.source, size: existing.size, mtimeIso: existing.mtimeIso },
      });
    }
    if (existing?.source === 'disk') {
      // Disk-hosted firmware is baked into the deploy — cannot be
      // overwritten by a client upload even with ?force. Rename instead.
      return json(res, 409, {
        error: `firmware ${name} is built-in (disk-hosted); rename your upload to a different filename`,
        code: 'FIRMWARE_BUILTIN',
      });
    }
    // TTL kept short so a leaked token can only replay for ~60s.
    // 100 MB uploads over a residential link finish inside 60 s at 15+ Mbps.
    try {
      const { generateClientTokenFromReadWriteToken } = await import('@vercel/blob/client');
      const clientToken = await generateClientTokenFromReadWriteToken({
        token: process.env.BLOB_READ_WRITE_TOKEN,
        pathname: `firmware/${name}`,
        validUntil: Date.now() + 60 * 1000,
        allowedContentTypes: ['application/octet-stream'],
        addRandomSuffix: false,
        allowOverwrite: force,
        maximumSizeInBytes: MAX_UPLOAD,
        onUploadCompleted: undefined,
      });
      console.log(`[api] minted client-upload token for firmware/${name} (force=${force})`);
      return json(res, 200, { clientToken, pathname: `firmware/${name}` });
    } catch (e) {
      console.error('[api] mint client token failed:', e.message);
      return json(res, 500, { error: e.message });
    }
  }

  if (req.method === 'DELETE') {
    if (!(await isAdmin(req))) return json(res, 401, { error: 'admin bearer required' });
    const name = req.query?.name;
    if (!isValidFirmwareName(name)) return json(res, 400, { error: 'invalid name' });
    try {
      const result = await deleteFirmware(name);
      console.log(`[api] firmware deleted: ${name}`);
      return json(res, 200, result);
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }

  return json(res, 405, { error: 'method not allowed' });
});
