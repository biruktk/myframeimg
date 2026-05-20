# MyFrame REST API

Base URL: `http://HOST:3001` (production: set `PUBLIC_BASE_URL` / VPS IP).

OpenAPI sketch: [`docs/openapi.yaml`](../../../docs/openapi.yaml).

## Authentication

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/auth/register` | — |
| POST | `/api/auth/login` | — |
| POST | `/api/auth/google` | Body `{ idToken }` |
| POST | `/api/auth/test-login` | — (test user) |
| GET | `/api/auth/session` | `Authorization: Bearer <jwt>` |
| POST | `/mobile/google-auth` | Body `{ idToken }` (mobile browser flow) |

## Mobile

| Method | Path | Description |
|--------|------|-------------|
| GET | `/mobile/google-signin` | HTML Google Sign-In page |
| POST | `/mobile/google-auth` | Same as `/api/auth/google` |

## User portal

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/user/dashboard` | Bearer JWT |
| PATCH | `/api/user/playlists/:id` | Bearer JWT |

## Family

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/family/create` | Bearer |
| POST | `/api/family/join` | Bearer |
| GET | `/api/family/members` | Bearer |
| POST | `/api/family/leave` | Bearer |
| POST | `/api/family/invite/rotate` | Bearer |

## Device & photos

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/device/status` | — |
| POST | `/api/device/send` | — |
| POST | `/api/photo/upload` | `x-pairing-token` or Bearer |

## Public / marketing

| Method | Path |
|--------|------|
| GET | `/api/public/site` |
| GET | `/api/public/blogs` |
| GET | `/api/public/blogs/by-slug/:slug` |
| POST | `/api/public/orders` |
| POST | `/api/public/subscribers` |

## Admin (`x-admin-token` or `Authorization: Bearer`)

See `src/routes/admin.ts` and `cms_manage_routes.ts`. Super-admin only:

- `POST /api/admin/admins`
- `PUT /api/admin/admins/:id`
- `DELETE /api/admin/admins/:id`

## Health

`GET /health` → `{ ok, service, mobileGoogleSignIn, googleAuthConfigured }`

## Errors

JSON shape: `{ ok: false, error: "error_key" }`

Common: `unauthorized_admin_token`, `invalid_token`, `route_not_found`, `super_admin_required`.
