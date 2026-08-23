import fs from "node:fs";
import path from "node:path";
const STORE_PATH = path.join(process.cwd(), "data", "kv-store.json");
// KV abstraction — @upstash/redis in production (backed by the Upstash
// instance you provisioned in Vercel), in-memory Map for local dev without
// credentials. Same wire protocol as Vercel KV (they wrap Upstash under
// the hood); we go direct so the dep tree is smaller and unambiguous.

let kv;

async function loadKv() {
  if (kv) return kv;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    try {
      const { Redis } = await import('@upstash/redis');
      const client = new Redis({ url, token });
      // Adapt the Upstash client to the smaller kv-style surface the rest
      // of the code expects. @upstash/redis exposes .get/.set/.del/.incrby/
      // .lpush/.lrange/.llen/.sadd/.sismember/.scard/.keys — 1:1 mapping.
      kv = {
        get: (k) => client.get(k),
        set: (k, v, opts = {}) => opts.ex ? client.set(k, v, { ex: opts.ex }) : client.set(k, v),
        del: (...ks) => client.del(...ks),
        incrby: (k, by = 1) => client.incrby(k, by),
        lpush: (k, ...vs) => client.lpush(k, ...vs.map((v) => typeof v === 'string' ? v : JSON.stringify(v))),
        lrange: async (k, s, e) => (await client.lrange(k, s, e)).map((x) => {
          if (typeof x !== 'string') return x;
          try { return JSON.parse(x); } catch { return x; }
        }),
        llen: (k) => client.llen(k),
        ltrim: (k, start, stop) => client.ltrim(k, start, stop),
        sadd: (k, ...vs) => client.sadd(k, ...vs),
        sismember: (k, v) => client.sismember(k, v),
        scard: (k) => client.scard(k),
        srem: (k, ...vs) => client.srem(k, ...vs),
        keys: (pattern) => client.keys(pattern),
      };
      return kv;
    } catch (e) {
      console.warn('[kv] @upstash/redis import failed, using in-memory fallback:', e.message);
    }
  }
  kv = memoryKv();
  return kv;
}

// Minimal in-memory shim covering the operations this app uses.
function memoryKv() {
  const store = new Map();
  const expiries = new Map();

  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
      for (const [k, v] of Object.entries(raw.store || {})) {
        if (v && typeof v === "object" && v._isSet) {
          store.set(k, new Set(v.items));
        } else {
          store.set(k, v);
        }
      }
      for (const [k, v] of Object.entries(raw.expiries || {})) {
        expiries.set(k, v);
      }
      console.log("[kv] loaded " + store.size + " keys from persistent disk store");
    }
  } catch (e) {
    console.warn("[kv] failed to load persistent store:", e.message);
  }

  let saveTimer = null;
  const saveToDisk = () => {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      try {
        const obj = {};
        for (const [k, v] of store.entries()) {
          if (v instanceof Set) {
            obj[k] = { _isSet: true, items: Array.from(v) };
          } else {
            obj[k] = v;
          }
        }
        const expObj = {};
        for (const [k, v] of expiries.entries()) expObj[k] = v;
        const dir = path.dirname(STORE_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(STORE_PATH, JSON.stringify({ store: obj, expiries: expObj }, null, 2), "utf8");
      } catch (e) {
        console.error("[kv] error saving to disk:", e.message);
      }
    }, 100);
  };

  const touch = (k) => {
    const exp = expiries.get(k);
    if (exp && exp < Date.now()) { store.delete(k); expiries.delete(k); saveToDisk(); }
  };
  return {
    async get(key) { touch(key); return store.get(key) ?? null; },
    async set(key, val, opts = {}) {
      store.set(key, val);
      if (opts.ex) expiries.set(key, Date.now() + opts.ex * 1000);
      saveToDisk();
      return "OK";
    },
    async del(...keys) { let n = 0; for (const k of keys) { if (store.delete(k)) n++; expiries.delete(k); } saveToDisk(); return n; },
    async incrby(key, by = 1) { touch(key); const cur = Number(store.get(key) || 0) + by; store.set(key, cur); saveToDisk(); return cur; },
    async lpush(key, ...vals) { touch(key); const arr = store.get(key) || []; arr.unshift(...vals); store.set(key, arr); saveToDisk(); return arr.length; },
    async lrange(key, start, stop) { touch(key); const arr = store.get(key) || []; return arr.slice(start, stop === -1 ? undefined : stop + 1); },
    async llen(key) { touch(key); return (store.get(key) || []).length; },
    async ltrim(key, start, stop) {
      touch(key);
      const arr = store.get(key) || [];
      const s = start < 0 ? Math.max(0, arr.length + start) : start;
      const e = stop < 0 ? arr.length + stop + 1 : stop + 1;
      store.set(key, arr.slice(s, e));
      saveToDisk();
      return "OK";
    },
    async sadd(key, ...vals) { touch(key); const s = store.get(key) || new Set(); for (const v of vals) s.add(v); store.set(key, s); saveToDisk(); return s.size; },
    async sismember(key, val) { touch(key); const s = store.get(key); return s && s.has(val) ? 1 : 0; },
    async scard(key) { touch(key); const s = store.get(key); return s ? s.size : 0; },
    async srem(key, ...vals) { touch(key); const s = store.get(key); if (!s) return 0; let n = 0; for (const v of vals) if (s.delete(v)) n++; saveToDisk(); return n; },
    async keys(pattern) { const re = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$"); return [...store.keys()].filter((k) => re.test(k)); },
  };
}

// Wrapped exports — every call goes through loadKv() so lazy-init works.
export async function kvGet(k)                { return (await loadKv()).get(k); }
export async function kvSet(k, v, opts)       { return (await loadKv()).set(k, v, opts); }
export async function kvDel(...ks)            { return (await loadKv()).del(...ks); }
export async function kvIncrBy(k, by = 1)     { return (await loadKv()).incrby(k, by); }
export async function kvLpush(k, ...vs)       { return (await loadKv()).lpush(k, ...vs); }
export async function kvLrange(k, s, e)       { return (await loadKv()).lrange(k, s, e); }
export async function kvLlen(k)               { return (await loadKv()).llen(k); }
export async function kvLtrim(k, start, stop) { return (await loadKv()).ltrim(k, start, stop); }
export async function kvSadd(k, ...vs)        { return (await loadKv()).sadd(k, ...vs); }
export async function kvSismember(k, v)       { return (await loadKv()).sismember(k, v); }
export async function kvScard(k)              { return (await loadKv()).scard(k); }
export async function kvSrem(k, ...vs)        { return (await loadKv()).srem(k, ...vs); }
export async function kvKeys(pattern)         { return (await loadKv()).keys(pattern); }

// One-time seed on cold start if the store is empty. Vercel KV persists,
// so this only actually writes on the very first invocation ever.
const DEFAULT_WORKORDERS = [
  { id: 'WO-DEV-0001', shortCode: 'DEV001', quota: 10 },
  { id: 'WO-DEV-0002', shortCode: 'DEV002', quota: 50 },
  { id: 'WO-BATCH-A',  shortCode: 'BATCHA', quota: 100 },
  { id: 'WO-BATCH-B',  shortCode: 'BATCHB', quota: 200 },
];

export async function ensureSeeded() {
  const idx = await kvGet('workorders:index');
  if (idx && Array.isArray(idx) && idx.length > 0) return;
  const ids = [];
  for (const wo of DEFAULT_WORKORDERS) {
    const doc = {
      id: wo.id, shortCode: wo.shortCode,
      fwSha: 'bb9cb25',
      license: {
        id: `LIC-INIT-${wo.shortCode}`,
        quota: wo.quota, used: 0,
        issuedAt: '2026-08-20T00:00:00Z',
        expiresAt: '2026-12-31T23:59:59Z',
        factoryId: 'F-DEMO',
      },
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
    await kvSet(`workorder:${wo.id}`, doc);
    ids.push(wo.id);
  }
  await kvSet('workorders:index', ids);
}
