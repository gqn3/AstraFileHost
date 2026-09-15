# Security model

Passwords use Argon2id (64 MiB, three iterations). Session and API-key secrets are generated randomly; the database stores SHA-256 hashes. Session cookies are HttpOnly, SameSite and Secure under HTTPS. Anonymous management uses the same non-public capability mechanism. The first owner requires a generated bootstrap token; there are no shipped account passwords.

Server-side role checks distinguish owner/admin, moderation, support and ordinary user operations. API keys require explicit scopes and cannot enter administrative/session routes. Suspension invalidates sessions and every key request checks current account status. The last active owner cannot be demoted or suspended.

Unsafe cookie-authenticated API requests require the exact configured Origin plus `X-Astra-Client: web`. Bearer authentication has separate scope checks. Input is validated with Zod; SQL parameters are bound; UUID keys isolate objects from filenames. MIME detection inspects a bounded prefix. HTML/SVG/unknown active content is never inlined. PDF frames are sandboxed and text previews are byte-limited and rendered as text.

The bucket has no public credentials or anonymous storage access. Upload URLs expire in 15 minutes and bind content length/checksum. Downloads are authorized before signing and require available, non-expired metadata. Storage CORS allows only APP_ORIGIN. The dedicated proxy preserves the signed Host and disables buffering for file bytes.

## Signed URL semantics

A signed URL is a short-lived bearer capability. Revoking a share or suspending a user prevents new grants; an already issued storage URL remains usable until its 15-minute expiry. Share download limits and bandwidth quotas count authorized downloads and reserved bytes, not unique completed downloads or exact network bytes. Repeated use/Range requests to the same URL may transfer more bytes. This limitation is explicitly displayed; strict per-byte enforcement requires a data-plane authorization/accounting gateway and cannot be claimed from API metadata alone.

Production requires trusted HTTPS. Initial provisioning creates a self-signed certificate for controlled setup only; replace it before serving users. SMTP is optional; password-reset delivery is unavailable until configured.

## Logs and secrets

Application logs record route templates, request IDs, latency, status and safe error codes. They do not include bodies, cookies, Authorization, signed URL query strings, passwords or storage secrets. Proxy access logs omit query strings and are rotated through the Docker logging driver. Nginx error output is suppressed because it may include signed queries; application errors and safe proxy response status/latency remain recorded. Secrets are excluded from Git and build context. API/worker containers run as UID 10001 with a read-only filesystem and without host/Docker/SSH access.

## Optional scanning

`SCAN_COMMAND` supplies a local scanner executable. Scanning is disabled unless configured. When enabled, uploaded objects remain quarantined until a streaming scan succeeds. A scanner failure does not release a quarantined object. Scanner size/expansion/time limits require configuration suitable for the workload; archives are never unpacked by AstraFile itself.

## Operational boundaries

No shared proxy replacement, global firewall reset, OS upgrade, SSH changes, Docker prune, arbitrary host process killing or unrelated database access is part of deployment. Keep infrastructure changes confined to the reviewed project scope.

Storage metrics remain on the private container network (loopback-only port 18403 for local development), with no public proxy route. Readiness includes the worker heartbeat. Keep deployment logs, scan reports and runtime evidence in private operator storage, outside Git.

## Private accounts and capabilities

Account emails use independently keyed HMAC blind indexes; plaintext email is not retained. Account IDs are random public identifiers and cannot authenticate. New registrations are PENDING until manual activation. New share links contain 256-bit fragment secrets; only keyed digests are stored. Resolution uses a POST body and short HttpOnly access cookie. Migration 005 retires legacy short path secrets without deleting files; owners regenerate links. Names/devices/support text use record-bound AES-256-GCM. Full details, retention and rotation rules are in PRIVACY_DATA_MAP.md.

Plans independently enforce file/storage/period/bandwidth/upload/download-grant/share/version/API limits. Used and reserved bytes are distinct; reservation admission is transactional and protects a 15 GiB physical floor. A download concurrency slot is an issued 15-minute grant, not an open TCP connection. Fake completion is checked against actual stored parts; repeated failures trigger escalating creation cooldown while existing uploads remain resumable.
