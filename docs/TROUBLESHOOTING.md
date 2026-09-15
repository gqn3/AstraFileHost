# Troubleshooting

## Storage PUT fails or upload stalls

Check that the browser can reach S3_PUBLIC_ENDPOINT with a trusted certificate and exact APP_ORIGIN CORS. ETag must be exposed. Confirm `x-amz-checksum-sha256` is sent and the Blob length matches the signed part size. A signature error after 15 minutes requires a new URL, not a new upload. Check the storage container's restart count and memory pressure. Tune part concurrency/heap budget within measured server headroom; never remove memory limits blindly.

## Resume requests the original file

This is expected after browser restart. Reselect the same file. Renaming it or changing its lastModified/sampled bytes changes the fingerprint. Preserve cookies for anonymous management. The API reconciles completed parts from storage and does not rely solely on browser state.

## API memory increases with file size

Verify PUT/GET URLs target the storage listener, not the API. The API has a 128 KiB body limit. Do not add buffering upload routes. Background SHA-256 uses a stream; browser hashing reads only one bounded part at a time in its worker.

## Low disk despite deleted files

Trash, surviving copies and incomplete multipart sessions retain storage. SeaweedFS needs its normal volume vacuum process to physically reclaim deleted blobs. Use the AstraFile cleanup/reconciliation actions and inspect free space. Never delete engine volume files or run global Docker cleanup.

## Local services unavailable after closing Docker Desktop

Start the installed Docker Desktop engine, check only the `astrafile-local` Compose project, and restart the AstraFile API/worker if they started before dependencies were ready. Do not alter containers belonging to other applications. Frontend reachability alone is not readiness; check `/health/ready` and Admin → System health.

## Password reset unavailable

SMTP_URL must be configured in protected application settings. Verify sender/domain credentials and delivery. No default SMTP service is fabricated. Tokens expire after 30 minutes and resetting the password revokes sessions.

## Admin action is forbidden

Check the live account role/status. API keys cannot call admin routes. Only OWNER can alter roles; the final active OWNER is protected. SUPPORT can read permitted operational screens and manage support conversations. A 403 should not be worked around by changing frontend buttons.

## Worker jobs fail

Inspect the job type, safe error code, attempts and heartbeat. Fix the dependency, then retry the specific job. The worker uses a single database leader lock and persistent job records. Do not delete its Redis database. Backup requires pg_dump in the production runtime and a writable owned backup directory.

## Performance interpretation

Client upload speed, server NIC, disk write speed, storage CPU/checksum work and browser concurrency can each be the limiting factor. Local loopback benchmarks are not remote/internet results. Download authorization counts are not confirmed wire-byte measurements. Record the test data type, part size, concurrency, elapsed time, endpoint, API RSS and checksums with every benchmark.
