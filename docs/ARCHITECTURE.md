# Architecture

AstraFile separates permissions and metadata from file transfer. React/Vite sends small JSON requests to Fastify. UploadPart PUTs and authorized GET/Range requests go directly to the S3 endpoint. In production, a dedicated Nginx listener terminates TLS and streams storage traffic without request or response buffering. No file upload route exists on the application API; its request-body limit is 128 KiB.

PostgreSQL holds users, sessions, roles/permissions, file metadata, folders, objects, upload intents and parts, shares/access grants, downloads, storage usage, quotas, API keys, settings, audit/security events, notifications and persistent background jobs. Redis holds bounded rate counters and worker heartbeat. Neither service is shared with another application.

The S3 adapter supports providers exposing the required S3 APIs, checksums, CORS and path-style requests. SeaweedFS 4.45 is the self-hosted implementation. Other S3-compatible providers require provider-specific compatibility testing before use. No external cloud account is required.

## Consistency and concurrency

- Admission takes a transaction-scoped global reservation lock and user row lock. It checks single-file, logical-storage, upload-period and free-disk budgets before recording an intent.
- The database intent exists before storage initialization, so stranded multipart uploads can be reconciled by UUID object key.
- Upload completion locks the session, reconciles storage parts against signed sizes and SHA-256 checksums, completes multipart storage and verifies HeadObject before making the file available.
- A crash after object completion but before metadata commit is recovered through HeadObject and idempotent completion.
- Browser refresh recovers IndexedDB metadata and ListParts, after the user reselects the original local file. No storage or management credentials are stored in IndexedDB.
- Copies create metadata references to an immutable object. Logical storage quota includes each copy. Purge deletes storage only after all file references are expired or purged.
- Folder mutations take a user row lock and reject cycles. Shares and downloads check ownership and availability in the backend.
- A PostgreSQL advisory lock elects one worker. Persistent jobs are claimed transactionally, survive process restarts and retry with increasing delays. Worker heartbeat is independent of transfer transport.

## Isolation

Containers communicate only on `astrafile-private`. The application TLS listener is public; the legacy storage TLS listener is loopback-only. PostgreSQL, Redis, the filer/master/volume services and the storage administration interfaces are not published. The application container has no Docker socket, host network or SSH keys.

This is a single-server deployment. Server loss, disk loss and multi-zone availability require a separately designed object backup/replication policy. Application logic does not turn a single disk into redundant storage.

Primary protocol references: [S3 multipart limits](https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html), [S3 checksum validation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity-upload.html), [SeaweedFS credentials](https://github.com/seaweedfs/seaweedfs/wiki/S3-Credentials), [Nginx streaming proxy options](https://nginx.org/en/docs/http/ngx_http_proxy_module.html).
