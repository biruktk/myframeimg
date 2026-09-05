// GET    /api/firmwares                              — public list (disk directory scan)
// POST   /api/firmwares?name=<file>.bin              — direct stream upload to disk
//           Content-Type: application/octet-stream
//           Query params:
//             name  — required, must match [A-Za-z0-9._-]+\.bin
//             force — "1" to overwrite an existing .bin
//           Body: raw bytes, streamed straight to public/firmware/<name>
// DELETE /api/firmwares?name=<file>.bin              — admin delete (disk-backed only)
//
// Migration note: replaced Vercel Blob client-token upload with native VPS
// disk streaming. The browser now POSTs raw bytes here (no third-party CDN
// dependency). Files are persisted under public/firmware/ so they are
// served as static assets via nginx + the local Express static middleware.

import { handler, json, isAdmin } from './_lib/http.mjs';
import { isValidFirmwareName } from './_lib/blob.mjs';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const MAX_UPLOAD = 100 * 1024 * 1024; // 100 MB hard cap (mirrors prior blob cap)
const FIRMWARE_DIR = path.join(process.cwd(), 'public', 'firmware');

function versionKey(name) {
  const m = name.toLowerCase().match(/fw[-_.]?(\d+(?:\.\d+)+)/);
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

async function listDiskFirmwares() {
  try {
    await fsp.mkdir(FIRMWARE_DIR, { recursive: true });
    const files = await fsp.readdir(FIRMWARE_DIR);
    const bins = [];
    for (const f of files) {
      if (!f.toLowerCase().endsWith('.bin')) continue;
      const st = await fsp.stat(path.join(FIRMWARE_DIR, f));
      bins.push({
        id: f,
        size: st.size,
        mtimeIso: st.mtime.toISOString(),
        source: 'disk',
        deletable: true,
      });
    }
    return bins;
  } catch {
    return [];
  }
}

export default handler(async (req, res) => {
  if (req.method === 'GET') {
    const bins = (await listDiskFirmwares()).sort(cmpVersion);
    const firmwares = bins.map((b) => ({
      id: b.id,
      label: b.id + ' (' + b.size.toLocaleString() + ' B)',
      url: 'firmware/' + b.id,
      size: b.size,
      mtimeIso: b.mtimeIso,
      source: 'disk',
      deletable: true,
    }));
    return json(res, 200, { firmwares });
  }

  if (req.method === 'POST') {
    if (!(await isAdmin(req))) {
      return json(res, 401, { error: 'admin bearer required' });
    }
    const name = req.query?.name;
    if (!isValidFirmwareName(name)) {
      return json(res, 400, {
        error: 'invalid name — must match [A-Za-z0-9._-]+\.bin and length 1-128',
      });
    }

    const force = req.query?.force === '1';
    const targetPath = path.join(FIRMWARE_DIR, name);

    if (fs.existsSync(targetPath) && !force) {
      const st = fs.statSync(targetPath);
      return json(res, 409, {
        error: 'firmware ' + name + ' already exists (size=' + st.size + 'B); rename or pass ?force=1 to replace',
        code: 'FIRMWARE_EXISTS',
        existing: { source: 'disk', size: st.size, mtimeIso: st.mtime.toISOString() },
      });
    }

    const declaredLen = Number(req.headers['content-length'] || 0);
    if (declaredLen === 0) {
      return json(res, 400, { error: 'empty body' });
    }
    if (declaredLen > MAX_UPLOAD) {
      return json(res, 413, {
        error: 'payload too large: ' + declaredLen + ' bytes (max ' + MAX_UPLOAD + ')',
      });
    }

    fs.mkdirSync(FIRMWARE_DIR, { recursive: true });

    const writeStream = fs.createWriteStream(targetPath, { mode: 0o644 });
    let bytesWritten = 0;
    let aborted = false;

    const onAbort = () => {
      if (aborted) return;
      aborted = true;
      console.warn('[api] firmware upload aborted mid-stream for ' + name);
      req.destroy();
      writeStream.destroy();
      fsp.unlink(targetPath).catch(() => {});
    };

    req.on('aborted', onAbort);
    res.on('close', () => { if (!res.writableEnded) onAbort(); });

    req.on('data', (chunk) => { bytesWritten += chunk.length; });

    try {
      await new Promise((resolve, reject) => {
        req.pipe(writeStream);
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        req.on('error', reject);
      });
    } catch (e) {
      try { await fsp.unlink(targetPath); } catch {}
      console.error('[api] firmware upload failed for ' + name + ': ' + e.message);
      return json(res, 500, { error: 'upload failed: ' + e.message });
    }

    if (aborted) return json(res, 499, { error: 'client disconnected' });

    try { fs.chmodSync(targetPath, 0o644); }
    catch (e) { console.warn('[api] chmod 644 failed for ' + name + ': ' + e.message); }

    console.log('[api] firmware uploaded: ' + name + ' · ' + bytesWritten + ' B → ' + targetPath);
    return json(res, 200, {
      ok: true,
      name: name,
      path: '/firmware/' + name,
      size: bytesWritten,
    });
  }

  if (req.method === 'DELETE') {
    if (!(await isAdmin(req))) return json(res, 401, { error: 'admin bearer required' });
    const name = req.query?.name;
    if (!isValidFirmwareName(name)) return json(res, 400, { error: 'invalid name' });
    const targetPath = path.join(FIRMWARE_DIR, name);
    try {
      await fsp.unlink(targetPath);
      console.log('[api] firmware deleted: ' + name);
      return json(res, 200, { ok: true, name: name, deleted: true });
    } catch (e) {
      if (e.code === 'ENOENT') {
        return json(res, 404, { error: 'firmware ' + name + ' not found on disk' });
      }
      return json(res, 500, { error: e.message });
    }
  }

  return json(res, 405, { error: 'method not allowed' });
});
