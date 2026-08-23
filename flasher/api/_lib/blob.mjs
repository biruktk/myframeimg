// Blob abstraction for the .myfw package files. In production this is
// Vercel Blob (S3-like, unlimited size, CDN-fronted). In local dev without
// BLOB_READ_WRITE_TOKEN we write to /tmp so `vercel dev` can round-trip.
//
// Client fetches the .myfw via a signed public URL — this bypasses the
// serverless function response cap (4.5 MB) that would otherwise block
// serving a 15 MB package.

import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

const LOCAL_TMP = path.join(process.cwd(), 'data', 'packages');

async function ensureLocalDir() {
  await fs.mkdir(LOCAL_TMP, { recursive: true });
}

// Store a .myfw. Returns a URL the client can GET directly.
export async function putPackage(workorderId, bytes) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import('@vercel/blob');
    const filename = `packages/${workorderId}.myfw`;
    const result = await put(filename, bytes, {
      access: 'public',
      contentType: 'application/octet-stream',
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return result.url;
  }
  // Local dev fallback — write to /tmp, return a same-origin URL that our
  // /api/package/[id] endpoint will serve back.
  await ensureLocalDir();
  const p = path.join(LOCAL_TMP, `${workorderId}.myfw`);
  await fs.writeFile(p, bytes);
  // Callers will build the URL; we return a marker so they know it's local.
  return `local:${p}`;
}

// Read a .myfw back (used only by local-dev /api/package/[id] fallback —
// in prod the client fetches the Vercel Blob URL directly).
export async function readLocalPackage(workorderId) {
  const p = path.join(LOCAL_TMP, `${workorderId}.myfw`);
  return fs.readFile(p);
}

// Firmware .bin storage. Two layers, in this priority:
//   1) Blob at pathname `firmware/{name}` — uploaded via admin UI, MUTABLE
//   2) `public/firmware/*.bin` — shipped in git, IMMUTABLE
//
// Merged view: the admin sees both, tagged by `source`. Blob names
// override same-named disk files. Only Blob-hosted firmwares are deletable
// through the API — disk-hosted are only replaceable via git commit.

// Safe filename: lower/upper/digits/./_/- and .bin extension only.
// Rejects `/`, `..`, whitespace, control chars — path traversal proof.
export function isValidFirmwareName(name) {
  return typeof name === 'string'
    && /^[A-Za-z0-9._-]+\.bin$/.test(name)
    && name.length <= 128
    && !name.startsWith('.');
}

// ── Disk (static) layer ──────────────────────────────────────
async function readDiskFirmware(filename) {
  const roots = [
    path.join(process.cwd(), 'public', 'firmware'),
    path.join(process.cwd(), 'firmware'),
  ];
  for (const root of roots) {
    try { return await fs.readFile(path.join(root, filename)); }
    catch { /* try next */ }
  }
  return null;
}

async function listDiskFirmwares() {
  const roots = [
    path.join(process.cwd(), 'public', 'firmware'),
    path.join(process.cwd(), 'firmware'),
  ];
  for (const root of roots) {
    try {
      const files = await fs.readdir(root);
      const bins = [];
      for (const f of files) {
        if (!f.toLowerCase().endsWith('.bin')) continue;
        const st = await fs.stat(path.join(root, f));
        bins.push({ id: f, size: st.size, mtimeIso: st.mtime.toISOString(), source: 'disk' });
      }
      return bins;
    } catch { /* try next */ }
  }
  return [];
}

// ── Blob (dynamic) layer ─────────────────────────────────────
async function listBlobFirmwares() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return [];
  const { list } = await import('@vercel/blob');
  const { blobs } = await list({ prefix: 'firmware/', limit: 1000 });
  return blobs
    .filter((b) => b.pathname.toLowerCase().endsWith('.bin'))
    .map((b) => ({
      id: b.pathname.replace(/^firmware\//, ''),
      size: b.size,
      mtimeIso: b.uploadedAt ? new Date(b.uploadedAt).toISOString() : null,
      url: b.url,
      source: 'blob',
    }));
}

async function readBlobFirmware(filename) {
  const list = await listBlobFirmwares();
  const hit = list.find((b) => b.id === filename);
  if (!hit) return null;
  const r = await fetch(hit.url);
  if (!r.ok) throw new Error(`blob fetch ${filename} → ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

export async function putFirmware(name, bytes) {
  if (!isValidFirmwareName(name)) throw new Error(`invalid firmware name: ${name}`);
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN not set — cannot upload firmware');
  }
  const { put } = await import('@vercel/blob');
  const result = await put(`firmware/${name}`, bytes, {
    access: 'public',
    contentType: 'application/octet-stream',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return { name, size: bytes.length, url: result.url, source: 'blob' };
}

export async function deleteFirmware(name) {
  if (!isValidFirmwareName(name)) throw new Error(`invalid firmware name: ${name}`);
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN not set — cannot delete firmware');
  }
  const blobList = await listBlobFirmwares();
  const hit = blobList.find((b) => b.id === name);
  if (!hit) throw new Error(`firmware ${name} not found in Blob (disk-hosted firmwares are not deletable via API)`);
  const { del } = await import('@vercel/blob');
  await del(hit.url);
  return { name, deleted: true };
}

// ── Merged read/list ─────────────────────────────────────────
// Blob overrides disk on same name (admins can hot-patch a shipped bin
// without a redeploy). Callers get the raw bytes regardless of source.
//
// STRICT error handling — an admin who uploaded fw-1.0.bin must never see
// their build silently degrade to the git-shipped fw-0.9.bin when Blob is
// briefly unhealthy. Only fall back to disk when Blob confirms the file
// is NOT PRESENT; any other Blob failure (network, 5xx, auth) is a hard
// error the caller must surface rather than mask.
export async function readFirmware(filename) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const list = await listBlobFirmwares();
    const hit = list.find((b) => b.id === filename);
    if (hit) {
      const r = await fetch(hit.url);
      if (!r.ok) {
        throw new Error(`Blob fetch failed for ${filename} (HTTP ${r.status}) — refusing to silently fall back to disk`);
      }
      return Buffer.from(await r.arrayBuffer());
    }
    // hit === undefined here means the Blob store confirms this name is
    // not there. Fall through to the immutable disk copy.
  }
  const fromDisk = await readDiskFirmware(filename);
  if (fromDisk) return fromDisk;
  throw new Error(`firmware not found: ${filename}`);
}

export async function listFirmwares() {
  const [blob, disk] = await Promise.all([listBlobFirmwares(), listDiskFirmwares()]);
  const seen = new Set(blob.map((b) => b.id));
  const merged = [...blob, ...disk.filter((d) => !seen.has(d.id))];
  return merged;
}
