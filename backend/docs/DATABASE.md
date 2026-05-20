# Database Architecture

## Storage model

- **Engine:** JSON document store (`web/backend/data/myframe-db.json`)
- **Access:** `db.read()`, `db.write()`, `db.mutate()` in `src/db/store.ts`
- **Seed:** Auto-created from defaults on first boot

## Entities & indexing strategy

| Collection | Key fields | Lookup pattern |
|------------|------------|----------------|
| `users` | `id`, `email`, `googleSub` | Linear scan (OK for &lt;10k users); index by email in memory per request |
| `familyGroups` | `id`, `inviteCode` | Invite code normalized uppercase |
| `frames` | `id`, `bleMac` | MAC → slideshow map |
| `uploads` | `id`, `deviceId`, `filename` | Recent uploads by device |
| `marketingSite` / `marketingCms` | nested CMS | Single document merge |
| `orders`, `notifySubscribers` | `id`, `email` | Admin list + filters |
| `auditLog` | `atMs` desc | Prepend on write (time-ordered) |

## Scalability path

1. **MVP:** Single-file JSON (current) — simple deploy, atomic writes.
2. **Growth:** SQLite or PostgreSQL with migrations; keep Express route contracts.
3. **Indexes:** `users.email`, `users.googleSub`, `familyGroups.inviteCode` unique.

## Backup

- VPS: `web/deploy/vps/backup-db.sh` (if present) or copy `data/myframe-db.json`
- PM2 restart does not wipe DB; lives beside `dist/`

## Security

- Passwords: scrypt hash + salt on `users`
- CMS admin passwords: SHA-256 stored hash in `marketingCms.cmsAdmins`
- No PII in audit `meta` beyond email references
