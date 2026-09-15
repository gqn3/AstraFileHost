# Public control-plane API

Base URL: `APP_ORIGIN/api`. Interactive documentation is at `/api/docs` and requires a staff session. Browser mutations require the exact Origin, JSON request body where needed and `X-Astra-Client: web`; session cookies are HttpOnly. Programmatic access uses `Authorization: Bearer <scoped-key>`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/guest` | Create an anonymous management session |
| POST | `/auth/register`, `/auth/login`, `/auth/logout` | Account/session operations |
| POST | `/auth/forgot`, `/auth/reset` | Email reset request/redemption |
| GET | `/auth/me`, `/auth/sessions` | Identity and active sessions |
| POST | `/uploads` | Create multipart intent; metadata only |
| GET | `/uploads/{id}` | Reconcile authoritative storage parts |
| POST | `/uploads/{id}/sign` | Sign at most 16 specified parts |
| POST | `/uploads/{id}/ack` | Checkpoint returned ETag |
| POST | `/uploads/{id}/complete` | Verify and complete idempotently |
| POST | `/uploads/{id}/abort` | Abort an incomplete session |
| GET | `/files`, `/files/{id}`, `/files/usage` | Search/list/details/quota |
| PATCH | `/files/{id}` | Rename, move, favorite, expiration |
| POST | `/files/bulk` | Move/copy/trash/restore/permanent purge |
| POST | `/files/{id}/download` | Authorize a 15-minute direct GET URL |
| GET/POST | `/folders` | List/create folders |
| PATCH | `/folders/{id}` | Rename/reparent/trash/restore folder |
| GET/POST | `/shares` | List/create shares |
| PATCH/DELETE | `/shares/{id}` | Edit/revoke a share |
| GET | `/public/shares/{id}` | Public metadata, after share authorization |
| POST | `/public/shares/{id}/unlock` | Exchange a share password for HttpOnly access |
| POST | `/public/shares/{id}/download` | Authorize a specific shared file |
| POST | `/public/shares/{id}/report` | Submit abuse report |
| GET/POST/DELETE | `/keys`, `/keys/{id}` | Manage scoped keys |

## Multipart example

```json
{"name":"archive.zip","size":18253611008,"mime":"application/zip","fingerprint":"<64 lowercase hex characters>"}
```

The response includes session `id`, `fileId`, `partSize`, `partCount` and suggested concurrency. Sign a part with:

```json
{"parts":[{"number":1,"checksum":"<base64 SHA-256 digest>"}]}
```

PUT the exact Blob/stream segment to the returned URL with the returned checksum header. Store ETag, then acknowledge with `{"number":1,"etag":"..."}`. Complete with an empty JSON object after all parts have finished. The API never accepts file bytes.

API key scopes are `files:read`, `files:write`, `uploads:write`, `shares:write`. Keys cannot access authentication or administration endpoints. Error responses include a stable `code`, human-readable `error` and request ID for unexpected errors. HTTP 409 incomplete upload means resume missing parts; 507 indicates capacity protection; 429 indicates rate/quota limits.

Presigned URLs are secrets for their lifetime. Do not log them or put them in analytics. A share URL is distinct from an anonymous management capability.

## Privacy, Cloud and editorial endpoints

`POST /shares/resolve` accepts `{secret}` and returns the share ID plus an HttpOnly access cookie. An ID alone cannot read a share. Create/regenerate responses show the secret once; share listings never recover it.

`GET /cloud/changes?cursor=0&limit=200` returns ordered per-account mutations. `GET /files/{id}/versions`, `POST /files/{id}/versions` with sourceFileId/expectedRevision, and `POST /files/{id}/versions/restore` with versionId/expectedRevision support conflict-safe history.

`GET /account/entitlements` shows effective policy and overrides. `/admin/plans` lists plans; `PUT /admin/plans/{id}` edits them. Device rename/revocation uses `/auth/sessions/{id}` and `/auth/sessions/others`. Email verification/change uses transient submitted addresses and keyed lookups.

Public `/pages` and `/pages/{slug}?lang=en` expose published CMS content. Staff `/admin/pages` supports editing, publishing and revision restore; `/admin/seo` manages defaults. `/support/tickets` creates/lists account tickets, `/support/resolve` exchanges anonymous ticket secrets, and `/admin/support` manages the inbox.
