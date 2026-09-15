# Configuration reference

[English](CONFIGURATION.md) | [العربية](ar/CONFIGURATION.md)

The canonical example is [`.env.example`](../.env.example). Defaults below come from `packages/config/index.ts` or the named subsystem. Local setup generates real secrets; none are shipped. Restart API/worker after environment changes. Authenticated dashboard settings are persisted in PostgreSQL.

## Application and networking

| Variable | Requirement / default | Meaning |
|---|---|---|
| `NODE_ENV` | Optional, `development` | `development`, `test` or `production` |
| `APP_ORIGIN` | Default `http://localhost:18400`; set explicitly in production | Exact browser origin including scheme and port; HTTPS required in production |
| `HOST` | Optional, `127.0.0.1` | API listen address; container uses `0.0.0.0` on its private network |
| `PORT` | Optional, `18402` | API port; production template uses 4000 internally |
| `TRUST_PROXY` | Optional, `127.0.0.1,::1` | Trusted proxy addresses/ranges, never arbitrary clients |

## Database and Redis

| Variable | Requirement / default | Meaning |
|---|---|---|
| `DATABASE_URL` | Required, no default | PostgreSQL connection URL; example `postgresql://USER:PASSWORD@HOST:5432/DATABASE` |
| `REDIS_URL` | Required, no default | Redis URL; example `redis://:PASSWORD@HOST:6379` |
| `POSTGRES_PASSWORD` | Local Compose only | Must match generated local database URL |
| `REDIS_PASSWORD` | Local setup metadata | Generated local credential; Redis reads `.secrets/redis.conf` |

Production Compose reads database/Redis secret files instead of these local Compose variables. Never expose their ports publicly.

## Object storage

| Variable | Requirement / default | Meaning |
|---|---|---|
| `S3_ENDPOINT` | Required | Server-reachable S3 endpoint |
| `S3_PUBLIC_ENDPOINT` | Required | Browser-reachable signing endpoint; HTTPS alongside production HTTPS |
| `S3_BUCKET` | Optional, `astrafile` | Private bucket |
| `S3_REGION` | Optional, `us-east-1` | Signing region, must match provider |
| `S3_ACCESS_KEY` | Required, minimum 12 characters | Dedicated storage credential |
| `S3_SECRET_KEY` | Required, minimum 24 characters | Storage secret |
| `S3_METRICS_ENDPOINT` | Optional, unset | Private SeaweedFS metrics URL; provider-specific |
| `STORAGE_DISK_PATH` | Required | Filesystem used for capacity checks; `.local` locally, `/data-check` in production |

See [Storage](STORAGE.md) for CORS and provider limitations. For remote S3, local free-space checks are not a measurement of provider capacity.

## Authentication and encryption

| Variable | Requirement / default | Meaning |
|---|---|---|
| `COOKIE_SECRET` | Required, minimum 32 characters | Independently generated cookie configuration secret |
| `BOOTSTRAP_TOKEN_HASH` | Required, 64 hex characters | SHA-256 of the separately retained initial setup token |
| `EMAIL_LOOKUP_KEYS` | Required, no default | Email HMAC blind-index ring |
| `SHARE_LOOKUP_KEYS` | Required, no default | Share/support capability HMAC ring |
| `FIELD_ENCRYPTION_KEYS` | Required, no default | AES-256-GCM metadata ring |
| `NETWORK_PRIVACY_KEYS` | Required, no default | Purpose-separated network correlation ring |
| `BACKUP_ENCRYPTION_KEYS` | Required, no default | Authenticated encrypted-backup ring |

Each ring is JSON shaped as `{"active":"v1","keys":{"v1":"<base64-encoded independent 32-byte key>"}}`. This placeholder is not usable configuration. `setup:local` and production provisioning generate rings without printing them. `node scripts/setup-privacy-keys.mjs .env` adds missing rings to a protected environment file; retain existing versions needed by records and backups. See [key rotation](PRIVACY_DATA_MAP.md#keys-and-rotation).

## Email, scanning and backups

| Variable | Requirement / default | Meaning |
|---|---|---|
| `SMTP_URL` | Optional, unset | SMTP transport for reset/verification/email-change delivery |
| `MAIL_FROM` | Optional, `AstraFile <noreply@localhost>` | Set a verified sender for real mail |
| `SCAN_COMMAND` | Optional, unset | Scanner executable; also enable scanning in admin settings |
| `BACKUP_ENABLED` | Optional, disabled unless `true` | Worker metadata backup schedule; production Compose enables it |
| `BACKUP_DIR` | Set when backups enabled | Writable backup destination; local example `.local/backups`, production `/backups` |

No SMTP means no email reset delivery; in-app support still works. No configured scanner means no malware-scanning guarantee. Backups exclude object bytes.

## Uploads, quotas and appearance

These are **dashboard settings**, not invented environment variables:

| Setting | Default / behavior |
|---|---|
| Part size / concurrency | 64 MiB / 4; supported 32–256 MiB options and 1–8 parts |
| Incomplete-upload timeout | 72 hours |
| Anonymous retention / trash retention | 7 / 30 days |
| Share expiry | 168 hours; policy permits changes |
| Sessions | 30 days, maximum 20 |
| Version history | Enabled; 20 versions / 90 days |
| Capacity floor / warning | 15 / 20 GiB; actual effective admission checks apply |
| Plans | FREE 200 GiB, PRO 2 TiB storage; independently editable limits |
| Language / theme | English / dark; Arabic and light/system available |

Plan entitlements and per-account overrides govern effective limits. New registrations require manual activation in this release. Increasing quotas does not provision storage.

## SEO

Use Admin → Search optimization and Pages & legal for titles, descriptions, canonical origin, social images, indexing, verification and bilingual content. These values are database-backed, not `VITE_*` secrets. Tracking is disabled until consent integration exists. See [SEO](SEO.md).

## Production Compose variables

`ASTRAFILE_RELEASE` is a required immutable image identifier; `APP_ORIGIN` configures storage CORS. `ASTRAFILE_BIND_IP` defaults to `0.0.0.0`, `ASTRAFILE_HTTPS_PORT` to 18443 and the loopback-only legacy `ASTRAFILE_STORAGE_PORT` to 18444. Provisioning records chosen available ports in `/opt/astrafile/deployment.env`. These public networking settings are separate from the protected runtime secret file.
