# Changelog

## [1.0.0] - 2026-09-15

First packaged release of AstraFileHost. The initial repository is private; this entry does not imply public availability or an open-source license.

### Added

- Resumable direct S3 multipart uploads, parallel part hashing/retries, pause/recovery, integrity checks and Range downloads.
- Persistent personal cloud with folders, file management, favorites, trash and conflict-safe version history.
- Opaque file/folder share capabilities, passwords, expiry, download-grant limits, QR sharing and revocation.
- Account IDs, manual activation, device/session management, configurable plan entitlements and scoped API keys.
- Privacy-preserving email lookup, protected metadata, redacted logs and encrypted metadata backup tooling.
- Administration for storage, users, security, jobs, audit, quotas, legal CMS, SEO and support.
- English/Arabic UI, RTL, themes, bilingual project documentation and 20 real demo screenshots.
- Portable deployment examples and CI validation without automatic production deployment.

### Known operational limits

- No payment processor, zero-knowledge encryption or automatic multi-host redundancy.
- Existing signed storage grants remain valid until expiry; download accounting measures authorizations, not exact wire bytes.
- Metadata backups do not include objects. SMTP, scanning, trusted TLS and off-server recovery require operator configuration.
- No software license has yet been selected.
