// MyFrame Flasher — self-hosted Node/Express runner.
// Serves the static public/ frontend + the Vercel-style api/*.mjs handlers
// (Node req/res style). No Vercel, no Blob, no Redis required — the handlers
// already ship in-memory KV + local-disk blob fallbacks.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

// Load .env (MYFRAME_KEK / ADMIN_PASSWORD / NODE_ENV / PORT) if present.
try {
  const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch { /* ignore */ }

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '120mb' }));

// Static frontend — relative asset paths resolve under any base path (/firmware).
app.use(express.static(path.join(ROOT, 'public')));

// Vercel rewrites: / -> index.html, /admin -> admin.html
app.get('/', (_req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));
app.get('/admin', (_req, res) => res.sendFile(path.join(ROOT, 'public', 'admin.html')));

// Lazy loader for the api/*.mjs handlers.
async function load(modPath) {
  return import(path.join(ROOT, 'api', modPath)).then((m) => m.default);
}

// Wrap a handler: merge Express :params into req.query (Vercel handlers read
// req.query.id / req.query.woId), then invoke with error isolation.
function route(modPath) {
  return async (req, res) => {
    for (const [k, v] of Object.entries(req.params || {})) {
      if (req.query[k] === undefined) req.query[k] = v;
    }
    try {
      const h = await load(modPath);
      await h(req, res);
    } catch (e) {
      console.error('[flasher] route error:', modPath, e);
      if (!res.headersSent) res.status(500).json({ error: 'internal', detail: String(e?.message || e) });
    }
  };
}

app.post('/api/admin/login', route('admin/login.mjs'));
app.get('/api/admin/workorders', route('admin/workorders.mjs'));
app.post('/api/admin/workorders', route('admin/workorders.mjs'));
app.post('/api/admin/build-package', route('admin/build-package.mjs'));
app.get('/api/admin/audit/:woId', route('admin/audit/[woId].mjs'));
app.get('/api/firmwares', route('firmwares.mjs'));
app.post('/api/firmwares', route('firmwares.mjs'));
app.delete('/api/firmwares', route('firmwares.mjs'));
app.get('/api/workorder/:id', route('workorder/[id]/index.mjs'));
app.post('/api/workorder/:id/challenge', route('workorder/[id]/challenge.mjs'));
app.post('/api/workorder/:id/session', route('workorder/[id]/session.mjs'));
app.post('/api/workorder/:id/next-sn', route('workorder/[id]/next-sn.mjs'));
app.post('/api/workorder/:id/consume', route('workorder/[id]/consume.mjs'));
app.get('/api/workorder/:id/firmware', route('workorder/[id]/firmware.mjs'));
app.get('/api/package/:woId', route('package/[woId].mjs'));

app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }));

const port = Number(process.env.PORT || 3002);
app.listen(port, () => {
  console.log(`[flasher] listening on :${port}`);
});
