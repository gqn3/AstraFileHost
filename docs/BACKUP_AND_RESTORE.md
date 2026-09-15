# Backup and restore

A recoverable installation needs **metadata, object bytes and key rings**. None substitutes for the others. The application does not automatically provide off-server object replication.

## Encrypted metadata backups

The worker schedules PostgreSQL dumps when `BACKUP_ENABLED=true`. Production Compose enables this with a writable `/backups` mount. Dumps use bounded authenticated AES-256-GCM frames and the active backup key; files end in `.dump.enc`. Treat even encrypted backups as private operational data.

The standard local Compose project supports:

```sh
npm run backup:local
npm run backup:verify
```

These helpers expect the default `astrafile-local-astrafile-postgres-1` container. They write local evidence under ignored `output/verification`. A custom Compose project name requires adapting the target deliberately; do not accidentally operate on another installation.

For the reference production worker, a scoped command is:

```sh
docker compose --env-file /opt/astrafile/deployment.env -f infra/compose/production.yml exec astrafile-worker /app/entrypoint.sh node dist/backup.mjs --verify
```

Run from the reviewed release directory. This creates an encrypted backup, restores it into a random temporary `astrafile_restore_*` database, checks the restored schema and drops only that temporary database. It does not overwrite production. Creation and restore verification are separate outcomes.

## Object backup

Back up the private S3 bucket using a provider-supported consistent backup or replication mechanism. Preserve immutable object keys and validate checksums. If backing up SeaweedFS volume files directly, use its supported consistency/snapshot procedure; copying live engine files arbitrarily is not a verified backup. Retention must protect objects referenced by retained metadata and file versions.

## Key recovery

Keep all field/backup key versions required by retained ciphertext, plus lookup keys needed by accounts and capabilities. Store these separately from encrypted dumps using a protected, tested recovery method. Do not publish environment files, database credentials, S3 keys, session data or private keys. Retiring an HMAC lookup key may prevent dormant identities or existing links from resolving.

## Disaster recovery procedure

1. Select a compatible application release and a coherent metadata/object recovery point.
2. Prepare an isolated recovery host and restore protected configuration/key rings.
3. Restore objects to private storage, retaining their keys. Restore metadata into a new database using authenticated decryption and `pg_restore` through the reviewed recovery tooling.
4. Verify schema, object counts/checksums, login, folder/version references, uploads and downloads before routing users to the recovered installation.
5. Reissue TLS or rotate access credentials as required; preserve encryption keys still needed by recovered data.
6. Record restore duration and recovery-point loss privately. Set your RPO/RTO from measured restoration, not from backup creation alone.

Replacing live metadata requires an explicit maintenance plan. Never run an old pre-privacy API against a newer incompatible schema. See [Privacy data map](PRIVACY_DATA_MAP.md#keys-and-rotation).
