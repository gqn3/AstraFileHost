# Security policy

## Supported versions

| Version | Security maintenance |
|---|---|
| 1.0.x | Current release line |
| Earlier development snapshots | Upgrade to the current release |

## Reporting a vulnerability

Coordinate privately before public disclosure. Use the repository's **Security → Report a vulnerability** option when GitHub makes it available. If that option is unavailable, contact the maintainer through an existing private GitHub collaboration channel before sending sensitive details. No public security email has been designated; do not invent or publish a personal address.

Include the affected version, impact and minimal reproduction using synthetic data. Never send production credentials, dumps, user uploads, session cookies, signed URLs or working share capabilities. Avoid public issues or pull requests containing an uncoordinated exploit. The maintainer will coordinate triage and a fix; no response-time guarantee is promised.

## Architecture and secret management

Passwords use Argon2id. Email lookup uses keyed blind indexes, selected metadata is encrypted and sessions/API keys are hashed at rest. Storage remains private; permission checks precede short-lived signing. This is not zero-knowledge storage. Revocation cannot retract an already issued storage URL before its expiry.

Protect `.env`, `.secrets`, runtime volumes and backups. Generate independent random keys; retain old encryption versions needed for recovery. Never reuse example placeholders or commit generated tokens. If credentials are ever published, revoke/rotate them and remove them from history; deleting the current file alone is insufficient.

Read [Security model](docs/SECURITY.md), [Privacy data map](docs/PRIVACY_DATA_MAP.md) and [Backup and restore](docs/BACKUP_AND_RESTORE.md).
