// AES-256-GCM chunked package encoder — matches the wire format the client
// parses in crypto.js. Uses Node built-in `crypto` module (no npm deps).

import crypto from 'node:crypto';

export const CHUNK_SIZE = 4096;
export const GCM_TAG_LEN = 16;
export const PACKAGE_MAGIC = Buffer.from('MYFA', 'utf-8');

export function genAesKey() {
  return crypto.randomBytes(32);
}

// ── Key-encrypting-key (KEK) at-rest protection ─────────────────
// Per-workorder AES keys are never stored in KV in the clear. They are
// wrapped with a server-side KEK (from env MYFRAME_KEK, 32-byte hex or
// base64) before writing, and unwrapped only inside session.mjs when the
// challenge-response HMAC is verified. If MYFRAME_KEK is absent we throw
// on wrap — an operator explicitly opted in to no-op storage would have
// to set MYFRAME_KEK=disabled which we don't accept.
function loadKek() {
  const raw = process.env.MYFRAME_KEK;
  if (!raw) throw new Error('MYFRAME_KEK env not set — cannot wrap package keys at rest');
  const hex = /^[0-9a-fA-F]+$/.test(raw);
  const buf = hex ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error(`MYFRAME_KEK must decode to 32 bytes (got ${buf.length})`);
  return buf;
}

// wrapKey → "kek1:<iv>:<ciphertext>:<tag>" (hex, colon-separated). The
// leading "kek1:" tag lets unwrap detect legacy plaintext keys stored
// before this migration and refuse them.
export function wrapKey(rawKeyBuf) {
  const kek = loadKek();
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', kek, iv);
  const ct = Buffer.concat([c.update(rawKeyBuf), c.final()]);
  return `kek1:${iv.toString('hex')}:${ct.toString('hex')}:${c.getAuthTag().toString('hex')}`;
}

export function unwrapKey(wrapped) {
  if (typeof wrapped !== 'string') throw new Error('wrapped key must be a string');
  if (!wrapped.startsWith('kek1:')) {
    throw new Error('legacy plaintext package key detected — rebuild this workorder to migrate to KEK-wrapped storage');
  }
  const [, ivHex, ctHex, tagHex] = wrapped.split(':');
  if (!ivHex || !ctHex || !tagHex) throw new Error('malformed wrapped key');
  const kek = loadKek();
  const iv = Buffer.from(ivHex, 'hex');
  const ct = Buffer.from(ctHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const d = crypto.createDecipheriv('aes-256-gcm', kek, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

export function hmacSha256Hex(secret, message) {
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

export function sha256Hex(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function u32LE(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n, 0); return b; }

// Build a MYFA v2 package. Layout matches client crypto.js parseHeader:
//   [4B "MYFA"] [4B licLen] [licLen bytes: license JSON plaintext]
//   [4B chunkCount]
//   [per chunk: [4B plaintextLen] [ciphertext] [16B tag]]
// Per-chunk nonce = nonceBase (4B) || chunkIndex u64 BE = 12B.
export function buildPackage(licenseMeta, firmwareBytes, key) {
  const fwSha = sha256Hex(firmwareBytes);
  const keyId = crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
  const totalLen = firmwareBytes.length;
  const chunkCount = Math.ceil(totalLen / CHUNK_SIZE);
  const nonceBase = crypto.randomBytes(4);

  const enriched = {
    ...licenseMeta,
    cipher: 'AES-256-GCM (chunked)',
    chunkSize: CHUNK_SIZE,
    chunkCount,
    nonceBase: nonceBase.toString('hex'),
    keyId,
    fwSize: totalLen,
    fwSha256: fwSha,
  };
  const licJson = Buffer.from(JSON.stringify(enriched), 'utf-8');

  const parts = [PACKAGE_MAGIC, u32LE(licJson.length), licJson, u32LE(chunkCount)];
  for (let i = 0; i < chunkCount; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, totalLen);
    const chunk = firmwareBytes.subarray(start, end);
    const nonce = Buffer.alloc(12);
    nonceBase.copy(nonce, 0);
    nonce.writeBigUInt64BE(BigInt(i), 4);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce, { authTagLength: GCM_TAG_LEN });
    const ct = Buffer.concat([cipher.update(chunk), cipher.final()]);
    parts.push(u32LE(ct.length), ct, cipher.getAuthTag());
  }
  return { bytes: Buffer.concat(parts), keyId, fwSha256: fwSha };
}
