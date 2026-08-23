// MyFrame Flasher — firmware crypto (v2).
//
// The .myfw file uses AES-256-GCM with a per-build key that lives on the
// server. Clients obtain the key ONLY after a challenge-response handshake
// (see api.openSession). Key material never appears in tool source.
//
// Wire format (MYFA magic):
//   [4B "MYFA"]
//   [4B licenseJsonLen]
//   [N license JSON — plaintext metadata (quota / SN rule / fwSha256 / …)]
//   [4B chunkCount]
//   [for each chunk: [4B plaintextLen] [ciphertext of that plaintextLen bytes]
//                    [16B AES-GCM tag]]
//
// Each chunk uses a nonce derived from `nonceBase` (4B random in license) and
// the chunk index (u64 big-endian). Chunks are individually authenticated,
// so a tampered chunk fails cheaply without decrypting the whole file.

const PACKAGE_MAGIC = new Uint8Array([0x4D, 0x59, 0x46, 0x41]); // "MYFA"
const GCM_TAG_LEN = 16;

export function looksLikePackage(bytes) {
  if (!bytes || typeof bytes.length !== 'number' || bytes.length < 12) return false;
  for (let i = 0; i < 4; i++) if (bytes[i] !== PACKAGE_MAGIC[i]) return false;
  return true;
}

function readU32LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
}

function u64BE(n) {
  // n is a chunk index (safe integer). Serialise as 8 big-endian bytes.
  const out = new Uint8Array(8);
  let x = BigInt(n);
  for (let i = 7; i >= 0; i--) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

function hexToU8(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

// Lightweight header preview — reads the license JSON only, WITHOUT walking
// the chunk table. Safe to call on a truncated prefix (e.g. the first
// 64 KB sliced from a 15 MB file); this is what the workorder-card
// autoload uses, since it just needs workorderId / licenseId / quota /
// expiresAt / fwName to render the card. parseHeader() is still the one
// to call at flash time — it validates every chunk offset.
export function parseLicenseOnly(bytes) {
  if (!looksLikePackage(bytes)) throw new Error('Not a MYFA package (missing magic header)');
  const licLen = readU32LE(bytes, 4);
  if (licLen <= 0 || 8 + licLen > bytes.length) {
    throw new Error(`Bad license header length: ${licLen} (payload ${bytes.length}B)`);
  }
  const licJson = new TextDecoder('utf-8').decode(bytes.subarray(8, 8 + licLen));
  try { return { license: JSON.parse(licJson) }; }
  catch (e) { throw new Error(`License JSON parse failed: ${e.message}`); }
}

// Parse the header — license JSON + chunk table (offsets, not decrypted bytes).
// Returns { license, chunks: [{offset, cipherLen, plainLen}], magic }.
export function parseHeader(bytes) {
  if (!looksLikePackage(bytes)) throw new Error('Not a MYFA package (missing magic header)');
  const licLen = readU32LE(bytes, 4);
  if (licLen <= 0 || 8 + licLen + 4 > bytes.length) {
    throw new Error(`Bad license header length: ${licLen} (payload ${bytes.length}B)`);
  }
  const licJson = new TextDecoder('utf-8').decode(bytes.subarray(8, 8 + licLen));
  let license;
  try { license = JSON.parse(licJson); } catch (e) { throw new Error(`License JSON parse failed: ${e.message}`); }

  let offset = 8 + licLen;
  const chunkCount = readU32LE(bytes, offset);
  offset += 4;
  if (chunkCount !== license.chunkCount) {
    throw new Error(`Chunk count mismatch: header=${chunkCount} license=${license.chunkCount}`);
  }

  const chunks = [];
  for (let i = 0; i < chunkCount; i++) {
    if (offset + 4 > bytes.length) throw new Error(`Truncated at chunk ${i} header`);
    const plainLen = readU32LE(bytes, offset);
    offset += 4;
    const cipherLen = plainLen + GCM_TAG_LEN; // AES-GCM ciphertext == plaintext len, plus 16-byte tag
    if (offset + cipherLen > bytes.length) throw new Error(`Truncated at chunk ${i} body`);
    chunks.push({ offset, cipherLen, plainLen });
    offset += cipherLen;
  }
  return { license, chunks };
}

// Decrypt one chunk. `keyBytes` is the raw 32-byte AES key obtained from the
// session handshake. `nonceBase` is a 4-byte prefix from the license header
// (hex-encoded). `chunkIndex` is the 0-based ordinal of the chunk.
export async function decryptChunk(keyBytes, nonceBaseHex, chunkIndex, cipherWithTag) {
  const base = hexToU8(nonceBaseHex);
  if (base.length !== 4) throw new Error(`nonceBase must be 4 bytes (got ${base.length})`);
  const nonce = new Uint8Array(12);
  nonce.set(base, 0);
  nonce.set(u64BE(chunkIndex), 4);
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce, tagLength: GCM_TAG_LEN * 8 },
    key,
    cipherWithTag,   // WebCrypto expects ciphertext||tag concatenated
  );
  return new Uint8Array(plain);
}

// Decrypt the whole firmware, chunk by chunk, calling onProgress after each.
// Returns the assembled plaintext Uint8Array. The plaintext is required by
// esptool-js writeFlash (which needs the whole buffer up front), so we DO
// hold it in browser RAM once decrypted — the streaming benefit here is
// (a) tamper detection per chunk, (b) progress reporting, (c) failing fast
// on a bad tag without decrypting the rest.
export async function decryptFirmwareStream(pkgBytes, keyHex, onProgress) {
  const { license, chunks } = parseHeader(pkgBytes);
  if (!keyHex) throw new Error('No session key — did challenge-response complete?');
  const keyBytes = hexToU8(keyHex);
  if (keyBytes.length !== 32) throw new Error(`AES key must be 32 bytes (got ${keyBytes.length})`);

  const out = new Uint8Array(license.fwSize);
  let written = 0;
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const cipherWithTag = pkgBytes.subarray(c.offset, c.offset + c.cipherLen);
    const plain = await decryptChunk(keyBytes, license.nonceBase, i, cipherWithTag);
    if (plain.length !== c.plainLen) {
      throw new Error(`Chunk ${i} plaintext length ${plain.length} != expected ${c.plainLen}`);
    }
    out.set(plain, written);
    written += plain.length;
    if (onProgress) onProgress(i + 1, chunks.length, written, license.fwSize);
  }

  // Cross-check: license carries the SHA-256 the server computed at build time.
  const sha = await sha256HexU8(out);
  if (license.fwSha256 && sha !== license.fwSha256) {
    throw new Error(`Firmware SHA-256 mismatch (expected ${license.fwSha256.slice(0, 12)}…, got ${sha.slice(0, 12)}…)`);
  }
  return { plain: out, license };
}

// Legacy entrypoint retained so existing flasher.js keeps compiling. The
// caller must have already opened a session and passed us the key.
export async function decryptFirmware(bytes, sessionKeyHex, onProgress) {
  if (!looksLikePackage(bytes)) {
    // Not a MYFA package — treat as raw firmware. This is the dev-only path.
    return { plain: bytes, license: null };
  }
  return decryptFirmwareStream(bytes, sessionKeyHex, onProgress);
}

async function sha256HexU8(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
export { sha256HexU8 as sha256Hex };

// Compute HMAC-SHA256(challenge, bearer) as lowercase hex. Used to build the
// challenge-response payload the server verifies before it hands out the key.
export async function hmacSha256Hex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
