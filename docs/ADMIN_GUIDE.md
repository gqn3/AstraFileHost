# Administration

Sign in with an OWNER or permitted staff account and open `/admin/overview`. All displayed file/user/share/job counts come from PostgreSQL or live health checks. No demo analytics are seeded.

| Screen | Operations |
|---|---|
| Overview | Real file/storage/user/upload counts, daily history, dependency checks, API RSS/CPU, disk capacity, pending/failed jobs and sampled storage receive/send rates |
| Files | Search metadata/owner/ID/key/hash/share, inspect, block/unblock, trash/restore, expire, reassign ownership |
| Uploads | Session state, reserved/transferred bytes and parts; abort incomplete sessions |
| Shares | Inspect, disable/enable, regenerate, update password/expiry/limits |
| Users | Quotas, suspend/ban/restore, invalidate sessions; role changes by OWNER only |
| Storage | Backend identity without credentials, health, latency, objects, capacity, multipart usage, reconciliation |
| Security | Authentication/rate events, IP blocks and abuse review |
| Jobs | Persistent status, attempts/errors, retry, cleanup/reconciliation/backup requests |
| Audit | Actor/action/target/time and before/after summaries without secrets |
| Analytics | Completed upload volume and download authorization reservations |
| API access | Hashed-key metadata and revocation; create scoped keys from Account |
| Settings | General, upload, share, account, security, capacity, appearance, maintenance and role quota policies |
| Reports / notifications | Dedicated abuse review and operational notification screens |
| System health | API dependency and worker heartbeat status |

SUPPORT can read operational screens and manage support tickets/replies/internal notes. MODERATOR can moderate files/shares, abort uploads and review abuse/IP blocks. ADMIN can manage settings, users and jobs; OWNER controls role elevation. The final active OWNER is protected.

Blocking an object prevents new download grants for its copies. Previously issued signed URLs remain usable until expiry. Permanent file deletion is available in the file manager after moving files to Trash and confirming; storage cleanup runs only after no surviving reference remains.

Use Account to change your password, inspect/revoke sessions and create/revoke scoped API keys. New keys are displayed once. Keep anonymous browser cookies to retain management rights; registration upgrades the guest workspace without moving file bytes.

Maintenance/read-only modes preserve downloads while restricting changes. Review low-disk alerts before lowering thresholds. Increasing quotas does not add physical storage.

Storage transfer rates use 10-second counter samples, update after requests finish, and include background integrity reads. Daily/monthly download figures remain authorization reservations, as labeled. Branding settings support an existing admin-owned PNG/JPEG/WebP of at most 1 MiB, homepage text, default language/theme, and share policy switches.

## Accounts, plans, pages and support

Activate PENDING accounts using their AF Account ID; email is not displayed. FREE is 200 GiB and PRO is 2 TiB by default. Admin Plans edits every independent limit. User overrides survive plan changes and can be explicitly removed. Physical capacity still limits admission. Device management is under Account / Devices.

Pages & legal provides bilingual sanitized rich text, drafts, publish/unpublish and revision restore. Restoring a revision creates a draft; publishing is separate. Search optimization manages defaults, page metadata, canonical URLs, robots/sitemap and Google verification. Analytics IDs can be prepared but tracking is disabled until consent integration is added. Private pages are never indexed.

Contact inbox supports search, category/status filters, assignment, private notes, in-app replies and close/reopen. Anonymous tickets use one-time fragment links; registered tickets use Account ID. Closed tickets expire after 90 days. No SMTP is required for in-app support.
