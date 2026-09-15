# Storage operations

The default backend is a private SeaweedFS S3 bucket named `astrafile`. Objects use only `objects/{UUID}` keys. User filenames are metadata, never filesystem paths. Root credentials exist solely in the project's protected configuration; browsers receive part-specific PUT or object-specific GET URLs.

Production storage lives under `/srv/astrafile/storage`. The API mounts the same filesystem read-only at `/data-check` for admission checks. Local Docker Desktop uses a dedicated Docker volume; local capacity figures reflect the Windows backing drive and must not be represented as remote Linux disk measurements.

Go heap controls (`GOMEMLIMIT=768MiB`, `GOGC=50`) keep storage allocation within the initial 1.5 GiB container budget. Actual memory, CPU and disk requirements must be measured on the target server. Do not deploy this budget unchanged on a server without the available capacity.

## Capacity protection

New uploads reserve their entire expected size and are rejected before the configured free-space floor. Logical account quotas count pending files, completed files, trash and copies until expiration or permanent purge. Critical thresholds do not disable existing downloads.

SeaweedFS uses append-only volume storage. Deleting an object releases logical allocation, but physical disk space can require the storage engine's vacuum cycle. Do not remove volume files manually. After large acceptance tests, verify actual free disk rather than assuming deleted bytes were reclaimed immediately.

## Lifecycle and reconciliation

- Scheduled cleanup expires files/shares and incomplete multipart sessions.
- Trash retention defaults to 30 days, anonymous retention to seven days.
- Permanent deletion requires explicit confirmation and goes through an idempotent purge job.
- Reconciliation scans only the owned bucket prefix. Unknown objects/MPUs receive a 72-hour grace period. Metadata records missing objects as blocked and logs an audit event.
- Object sharing/copy references prevent premature deletion. Archive content is never extracted.

## External S3 providers

Configure the internal/public endpoint, region, bucket and dedicated credentials in the protected environment. Test signed Content-Length, SHA-256 rejection, multipart completion/recovery, ListParts pagination, CORS ETag exposure, Unicode download names and HTTP Range before switching. Endpoint changes require a planned migration of existing object metadata and data; changing a dropdown is not a data migration.

Object backup is separate from PostgreSQL backup. Use provider replication or an independently scheduled object copy with integrity verification. Never claim metadata backup also protects file bytes.


## Endpoint examples

The bundled SeaweedFS setup is ready for the local installation commands. An external MinIO deployment can use protected environment entries shaped as:

```dotenv
S3_ENDPOINT=http://minio:9000
S3_PUBLIC_ENDPOINT=https://storage.example.com
S3_BUCKET=astrafile
S3_REGION=us-east-1
S3_ACCESS_KEY=CHANGE_ME_ACCESS_KEY
S3_SECRET_KEY=CHANGE_ME_INDEPENDENT_STORAGE_SECRET
```

An external provider uses the same variables, for example `S3_ENDPOINT=https://s3.example.com` and `S3_PUBLIC_ENDPOINT=https://s3.example.com`, with its actual region and dedicated bucket credentials. All values above are examples, not usable credentials. AstraFile uses path-style requests; verify that the provider supports them. No provider is certified compatible merely by accepting its endpoint URL.

Create the private bucket with your provider first if its region/policy requires provider-specific creation parameters, then run `npm run storage:init` to apply the application's CORS policy. This command creates a missing bucket only using the adapter's generic creation request; it does not provision a provider account.

CORS allows the exact `APP_ORIGIN`, methods GET/HEAD/PUT and headers `content-type`, `x-amz-checksum-sha256`, `range`. Expose `ETag`, `Content-Length`, `Content-Range`, `Accept-Ranges` and `x-amz-checksum-sha256`. Wildcard credential access is unnecessary. The public endpoint must be reachable from the user's browser with trusted TLS; internal Docker names are unsuitable.

Before migration, test multipart checksums/rejection, ListParts reconciliation, presigned content length, completion retries and GET Range/206. Update metadata and object location together. Local filesystem capacity checks do not measure an external provider's remaining quota; configure provider monitoring separately.
