# Production deployment

[English](DEPLOYMENT.md) | [العربية](ar/DEPLOYMENT.md)

The included Compose stack is a single Linux host reference deployment. It does not establish multi-zone availability or off-server file backups. Source publication and CI never deploy production.

## Prepare the host

Install Git, Python 3, OpenSSL and Docker with Compose. Review CPU/RAM/disk budgets in `infra/compose/production.yml`; initial provisioning requires at least 40 GiB free. Verify that `/opt/astrafile`, `/srv/astrafile`, the project network and chosen ports are available and belong exclusively to this installation. The script does not install Docker or alter the firewall, SSH or a shared reverse proxy.

Use a reviewed immutable checkout. For example, on the target Linux host:

```sh
git clone https://github.com/gqn3/AstraFileHost.git
cd AstraFileHost
git checkout v1.0.0
sudo python3 scripts/provision.py --host files.example.com --release v1.0.0 --scope-reviewed
```

Replace the example hostname with your own. Provisioning refuses an existing deployment, generates separate secrets under `/opt/astrafile/secrets`, writes `/opt/astrafile/deployment.env`, copies the release to `/opt/astrafile/releases/v1.0.0`, and creates a self-signed initial certificate. It selects available high ports, starting at 18443/18444; inspect the non-secret deployment settings locally. It does not start the application.

Install a **trusted certificate and matching private key** at the paths expected by `/opt/astrafile/config/nginx.conf` before exposing the service. Protect private keys. The optional IP-ACME helper requires `--host` with an IP you control, port-80 validation reachability and a separately reviewed host Nginx configuration. It is not needed for a normal domain certificate and must not overwrite a shared proxy without review.

## Start dependencies, migrate and initialize storage

From the copied release directory:

```sh
cd /opt/astrafile/releases/v1.0.0
docker compose --env-file /opt/astrafile/deployment.env -f infra/compose/production.yml build
docker compose --env-file /opt/astrafile/deployment.env -f infra/compose/production.yml up -d astrafile-postgres astrafile-redis astrafile-storage
docker compose --env-file /opt/astrafile/deployment.env -f infra/compose/production.yml run --rm --no-deps astrafile-api node dist/migrate.mjs
docker compose --env-file /opt/astrafile/deployment.env -f infra/compose/production.yml run --rm --no-deps astrafile-api node dist/storage-init.mjs
docker compose --env-file /opt/astrafile/deployment.env -f infra/compose/production.yml up -d
```

Wait for PostgreSQL to be healthy and storage/Redis to accept connections before the one-shot commands. `entrypoint.sh` loads the mounted runtime secret file without printing it. Complete `/setup` using the private bootstrap-token file and your chosen owner credentials. Verify `/health/ready`, Admin → System health, a small upload/download with matching checksum, and HTTP Range over trusted HTTPS.

The public application origin also streams signed S3 requests under `/astrafile/`; Nginx preserves signing headers and disables file buffering. The legacy storage listener is loopback-only. PostgreSQL, Redis and internal storage management ports have no public bindings. Configure firewall ingress only for the chosen public HTTPS endpoint and your certificate validation method.

## Updates

1. Review the exact target commit and verify the deployment checkout is clean and not divergent. Never discard server changes to force an update.
2. Preserve all existing configuration and key rings. Do not rerun initial provisioning. Prepare a separate immutable release directory and image tag.
3. Create an encrypted metadata backup, verify restoration to a temporary database, and verify independent object backups before schema changes.
4. Build the new images. Stop only the project API/worker for incompatible schema changes. Apply `dist/migrate.mjs` with the same secret/network mounts.
5. Update the non-secret release identifier deliberately and recreate the affected project services. Test the proxy configuration and gracefully reload it after upstream recreation.
6. Check readiness, login, multipart transfer, share access and worker processing. Retain the prior image and compatible backups.

Schema changes can make an older image incompatible; do not blindly roll back code after a migration. Migrations 002/005 introduce privacy changes and retire legacy short share capabilities. They do not delete the underlying files; owners regenerate links.

## Recovery and ongoing operations

Configure SMTP for email recovery, review account activation/quotas and tailor legal content before onboarding users. Store secrets and backup keys in protected, recoverable operator storage outside this host. Monitor capacity, failed jobs and certificate expiry. Metadata dumps do not include object bytes. See [Backup and restore](BACKUP_AND_RESTORE.md), [Security](SECURITY.md), [Storage](STORAGE.md) and [Troubleshooting](TROUBLESHOOTING.md).
