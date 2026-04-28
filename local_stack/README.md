# local_stack (single-port local stack)

Runs `web` + `backend` together with one exposed port.

- Public entrypoint: `http://localhost:3000` (or `WEB_PORT`)
- Backend (`api`) is internal only; web API routes proxy to it.

## Quick start

```bash
cd web/local_stack
cp .env.example .env
bash run.sh
```

## Stop

```bash
cd web/local_stack
docker compose down
```

## App API base for this mode

When testing the Flutter app against this single-port stack, point:

- `API_BASE=http://<host>:3000`

because the web layer exposes `/api/*` routes and forwards to backend.
