# Upload protocol

1. Establish an authenticated account or anonymous HttpOnly management session.
2. POST `/api/uploads` with name, declared MIME, exact byte size, fingerprint and optional folder/expiry. The API reserves quota and creates an S3 multipart session.
3. Split the file into 64 MiB parts by default. Configuration permits 32/64/128/256 MiB. Planning increases the part size if needed to remain within 10,000 parts.
4. A Web Worker computes per-part SHA-256. The fingerprint includes name, size, lastModified and hashes of three bounded file samples. Hashing never blocks the main thread or reads the entire file before starting.
5. POST `/api/uploads/{id}/sign` with part numbers and base64 SHA-256 checksums. Each URL binds the exact part number, content length and checksum and expires after 15 minutes.
6. PUT the Blob slice to the signed S3 URL, including `x-amz-checksum-sha256`. The browser supplies Content-Length. CORS exposes ETag.
7. Persist ETag and progress in IndexedDB and acknowledge the part to the API. Four parts start in parallel; success can raise concurrency to eight, errors reduce it. Files are queued to bound total browser memory and connections.
8. Pause aborts outstanding XHRs; confirmed parts remain on storage. Resume obtains ListParts from the API and verifies the selected file fingerprint. It uploads only missing parts. Expired URLs are replaced by newly signed URLs on retry.
9. Complete reconciles the manifest, part sizes, checksums and ETags. The API verifies final size and object existence, records detected MIME and activates the file/share atomically. A background worker calculates full-object SHA-256 by streaming.

## Recovery limits

Browsers generally cannot reopen a file silently after restart. The user must reselect the same original file; its name, size, modification time and sampled bytes must match. Deleting browser cookies loses an anonymous management capability. Expired/aborted sessions cannot be resumed. The configured incomplete-session lifetime defaults to 72 hours.

Individual part retries use exponential delays with jitter, capped at 15 seconds and six attempts. Cancellation aborts the multipart session. Network failures never intentionally restart the whole file.

## Integrity

Multipart ETags are not described as whole-file hashes. Strong validation uses S3 SHA-256 part checksums, signed lengths, the complete-object size and an asynchronous full-object SHA-256. Original bytes are stored and returned unchanged. Previews use safe MIME types and do not replace the original.

The API may take a brief period to reconcile thousands of parts. Completion is idempotent: repeat it after an uncertain response. Never assume success from a client progress bar reaching 100%.
