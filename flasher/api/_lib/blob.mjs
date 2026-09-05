// Blob abstraction for the .myfw package files. In production this is
// Vercel Blob (S3-like, unlimited size, CDN-fronted). In local dev without
// BLOB_READ_WRITE_TOKEN we write to /tmp so `vercel dev` can round-trip.
//
// Client fetches the .myfw via a signed public URL — this bypasses the
// serverless function response cap (4.5 MB) that would otherwise block
// serving a 15 MB package.
//
// Firmware .bin uploads are now handled NATIVELY by api/firmwares.mjs (no
// Blob involvement). This file keeps only the .myfw package helpers +
// isValidFirmwareName() which firmwares.mjs still uses.

import path from 'node:path';
import fs from 'node:fs/promises';

const LOCAL_TMP = path.join(process.cwd(), 'data', 'packages');

async function ensureLocalDir() {
  await fs.mkdir(LOCAL_TMP, { recursive: true });
}

// Store a .myfw. Returns a URL the client can GET directly.
export async function putPackage(workorderId, bytes) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import('@vercel/blob');
    const filename = path.join('packages', workorderId + '.myfw');
    const result = await put(filename, bytes, {
      access: 'public',
      contentType: 'application/octet-stream',
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return result.url;
  }
  await ensureLocalDir();
  const p = path.join(LOCAL_TMP, workorderId + '.myfw');
  await fs.writeFile(p, bytes);
  return 'local:' + p;
}

// Read a .myfw back (used only by local-dev /api/package/[id] fallback —
// in prod the client fetches the Vercel Blob URL directly).
export async function readLocalPackage(workorderId) {
  const p = path.join(LOCAL_TMP, workorderId + '.myfw');
  return fs.readFile(p);
}

// Safe filename: lower/upper/digits/./_/- and .bin extension only.
// Rejects `/`, `..`, whitespace, control chars — path traversal proof.
export function isValidFirmwareName(name) {
  return typeof name === 'string'
    && /^[A-Za-z0-9._-]+\.bin$/.test(name)
    && name.length <= 128
    && !name.startsWith('.');
}

// Read firmware .bin bytes from public/firmware/<name>. With Blob removed
// from this codebase, firmware uploads live on disk — this function is the
// single read path used by build-package.mjs and (transitively) by the
// workorder license endpoint.
export async function readFirmware(filename) {
  const p = path.join(process.cwd(), 'public', 'firmware', filename);
  return fs.readFile(p);
}
