# Local development (no Docker)

Run the backend and frontend separately:

1. **API** — `web/backend`:

   ```bash
   cd web/backend
   cp .env.example .env
   npm install
   npm run dev
   ```

2. **Next app** — `web/`:

   ```bash
   cd web
   cp .env.example .env
   npm install
   npm run dev
   ```

Configure `MYFRAME_API_URL` in `web/.env` (or rely on defaults in `web/lib/backend-url.ts`) so `web/app/api/*` routes proxy to Express.

You can mirror production variables from `web/local_stack/.env.example` into `web/backend/.env`.

`bash web/local_stack/run.sh` prints the same instructions.
