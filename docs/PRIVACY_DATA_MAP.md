# Privacy data map

Schema: migrations 001–005. Generated from every current public-schema column, including views. No account email is stored in plaintext or reversibly encrypted. Public CMS support email is an optional business contact intentionally published by an administrator, not an account email.

Files remain server-managed original bytes, not end-to-end encrypted. Operators with storage access can read file content. File/folder names are owner-visible metadata and can contain personal information supplied by users; avoid placing secrets in names. AEAD covers display names, device names, ticket subjects and ticket bodies.

## Access and retention

API authorization restricts account data to its owner and privileged staff to necessary operational actions. Staff cannot retrieve account emails, passwords, share secrets, API keys or session tokens. Support staff decrypt ticket text only through authorized inbox routes; internal notes never reach public ticket responses. Database/storage operators retain infrastructure access.

Configured privacy retention defaults to 30 days; operational correlation fields expire independently from accounting records. Open tickets and cloud change history currently have account-lifetime retention. Encrypted metadata backups require operator retention management and separate protected key custody; a verified encrypted metadata copy and DPAPI-sealed recovery settings are now held off-server. This does not provide off-server object recovery. Uploaded objects are not included in metadata backups.

## Every column

| Table.column | Classification / stored representation | Application access | Retention |
|---|---|---|---|
| `abuse_reports.id` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `abuse_reports.share_id` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `abuse_reports.reason` | User-supplied or operational text; may contain personal data | Owner / authorized staff (public only when explicitly shared) | Record lifetime; explicit project lifecycle action |
| `abuse_reports.status` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `abuse_reports.decision` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `abuse_reports.actor_id` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `abuse_reports.created_at` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `account_storage_usage.owner_id` | Derived accounting / synchronization metadata | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `account_storage_usage.used_bytes` | Derived accounting / synchronization metadata | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `account_storage_usage.reserved_bytes` | Derived accounting / synchronization metadata | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `account_storage_usage.incomplete_uploads` | Derived accounting / synchronization metadata | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `api_keys.id` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `api_keys.owner_id` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `api_keys.name` | User-supplied or operational text; may contain personal data | Owner / authorized staff (public only when explicitly shared) | Record lifetime; explicit project lifecycle action |
| `api_keys.token_hash` | One-way credential digest (share/support HMAC, random session/API SHA-256) | Authentication only; no API disclosure | Record lifetime; explicit project lifecycle action |
| `api_keys.prefix` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `api_keys.scopes` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `api_keys.expires_at` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `api_keys.revoked_at` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `api_keys.last_used_at` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `api_keys.created_at` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `audit_logs.id` | Operational metadata (plaintext) | Owner / authorized staff | Audit history retained; IP correlation cleared after privacyRetentionDays |
| `audit_logs.actor_id` | Operational metadata (plaintext) | Owner / authorized staff | Audit history retained; IP correlation cleared after privacyRetentionDays |
| `audit_logs.action` | Operational metadata (plaintext) | Owner / authorized staff | Audit history retained; IP correlation cleared after privacyRetentionDays |
| `audit_logs.target` | Redacted operational events / bounded status; no request bodies or credentials | Authorized staff | Audit history retained; IP correlation cleared after privacyRetentionDays |
| `audit_logs.detail` | Redacted operational events / bounded status; no request bodies or credentials | Authorized staff | Audit history retained; IP correlation cleared after privacyRetentionDays |
| `audit_logs.ip` | Daily rotating keyed pseudonym; stable purpose-separated HMAC only in ip_blocks | Restricted abuse correlation; no raw address | Audit history retained; IP correlation cleared after privacyRetentionDays |
| `audit_logs.created_at` | Operational metadata (plaintext) | Owner / authorized staff | Audit history retained; IP correlation cleared after privacyRetentionDays |
| `background_jobs.id` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `background_jobs.kind` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `background_jobs.target` | Redacted operational events / bounded status; no request bodies or credentials | Authorized staff | Record lifetime; explicit project lifecycle action |
| `background_jobs.status` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `background_jobs.attempts` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `background_jobs.error` | Redacted operational events / bounded status; no request bodies or credentials | Authorized staff | Record lifetime; explicit project lifecycle action |
| `background_jobs.detail` | Redacted operational events / bounded status; no request bodies or credentials | Authorized staff | Record lifetime; explicit project lifecycle action |
| `background_jobs.created_at` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `background_jobs.updated_at` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `cloud_changes.owner_id` | Operational metadata (plaintext) | Owner / authorized staff | Account lifetime; contains identifiers and operations, no content |
| `cloud_changes.sequence` | Operational metadata (plaintext) | Owner / authorized staff | Account lifetime; contains identifiers and operations, no content |
| `cloud_changes.entity` | Operational metadata (plaintext) | Owner / authorized staff | Account lifetime; contains identifiers and operations, no content |
| `cloud_changes.entity_id` | Operational metadata (plaintext) | Owner / authorized staff | Account lifetime; contains identifiers and operations, no content |
| `cloud_changes.operation` | Operational metadata (plaintext) | Owner / authorized staff | Account lifetime; contains identifiers and operations, no content |
| `cloud_changes.revision` | Operational metadata (plaintext) | Owner / authorized staff | Account lifetime; contains identifiers and operations, no content |
| `cloud_changes.created_at` | Operational metadata (plaintext) | Owner / authorized staff | Account lifetime; contains identifiers and operations, no content |
| `cloud_cursors.owner_id` | Derived accounting / synchronization metadata | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `cloud_cursors.sequence` | Derived accounting / synchronization metadata | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `cms_pages.id` | Public editorial content / configuration; drafts private | Published snapshot public; revisions/admin configuration staff only | Record lifetime; explicit project lifecycle action |
| `cms_pages.slug` | Public editorial content / configuration; drafts private | Published snapshot public; revisions/admin configuration staff only | Record lifetime; explicit project lifecycle action |
| `cms_pages.kind` | Public editorial content / configuration; drafts private | Published snapshot public; revisions/admin configuration staff only | Record lifetime; explicit project lifecycle action |
| `cms_pages.draft` | Public editorial content / configuration; drafts private | Published snapshot public; revisions/admin configuration staff only | Record lifetime; explicit project lifecycle action |
| `cms_pages.published` | Public editorial content / configuration; drafts private | Published snapshot public; revisions/admin configuration staff only | Record lifetime; explicit project lifecycle action |
| `cms_pages.published_at` | Public editorial content / configuration; drafts private | Published snapshot public; revisions/admin configuration staff only | Record lifetime; explicit project lifecycle action |
| `cms_pages.revision` | Public editorial content / configuration; drafts private | Published snapshot public; revisions/admin configuration staff only | Record lifetime; explicit project lifecycle action |
| `cms_pages.updated_at` | Public editorial content / configuration; drafts private | Published snapshot public; revisions/admin configuration staff only | Record lifetime; explicit project lifecycle action |
| `cms_revisions.id` | Public editorial content / configuration; drafts private | Published snapshot public; revisions/admin configuration staff only | Record lifetime; explicit project lifecycle action |
| `cms_revisions.page_id` | Public editorial content / configuration; drafts private | Published snapshot public; revisions/admin configuration staff only | Record lifetime; explicit project lifecycle action |
| `cms_revisions.revision` | Public editorial content / configuration; drafts private | Published snapshot public; revisions/admin configuration staff only | Record lifetime; explicit project lifecycle action |
| `cms_revisions.snapshot` | Public editorial content / configuration; drafts private | Published snapshot public; revisions/admin configuration staff only | Record lifetime; explicit project lifecycle action |
| `cms_revisions.actor_id` | Public editorial content / configuration; drafts private | Published snapshot public; revisions/admin configuration staff only | Record lifetime; explicit project lifecycle action |
| `cms_revisions.created_at` | Public editorial content / configuration; drafts private | Published snapshot public; revisions/admin configuration staff only | Record lifetime; explicit project lifecycle action |
| `downloads.id` | Operational metadata (plaintext) | Owner / authorized staff | Accounting record retained; IP correlation cleared after privacyRetentionDays |
| `downloads.file_id` | Operational metadata (plaintext) | Owner / authorized staff | Accounting record retained; IP correlation cleared after privacyRetentionDays |
| `downloads.share_id` | Operational metadata (plaintext) | Owner / authorized staff | Accounting record retained; IP correlation cleared after privacyRetentionDays |
| `downloads.owner_id` | Operational metadata (plaintext) | Owner / authorized staff | Accounting record retained; IP correlation cleared after privacyRetentionDays |
| `downloads.bytes_authorized` | Operational metadata (plaintext) | Owner / authorized staff | Accounting record retained; IP correlation cleared after privacyRetentionDays |
| `downloads.ip` | Daily rotating keyed pseudonym; stable purpose-separated HMAC only in ip_blocks | Restricted abuse correlation; no raw address | Accounting record retained; IP correlation cleared after privacyRetentionDays |
| `downloads.created_at` | Operational metadata (plaintext) | Owner / authorized staff | Accounting record retained; IP correlation cleared after privacyRetentionDays |
| `email_verifications.id` | Operational metadata (plaintext) | Owner / authorized staff | Until expiry (24 hours) or consumption; expired rows removed |
| `email_verifications.user_id` | Operational metadata (plaintext) | Owner / authorized staff | Until expiry (24 hours) or consumption; expired rows removed |
| `email_verifications.email_lookup` | Versioned keyed HMAC blind email index | Authentication only; no API disclosure | Until expiry (24 hours) or consumption; expired rows removed |
| `email_verifications.token_hash` | One-way credential digest (share/support HMAC, random session/API SHA-256) | Authentication only; no API disclosure | Until expiry (24 hours) or consumption; expired rows removed |
| `email_verifications.purpose` | Operational metadata (plaintext) | Owner / authorized staff | Until expiry (24 hours) or consumption; expired rows removed |
| `email_verifications.expires_at` | Operational metadata (plaintext) | Owner / authorized staff | Until expiry (24 hours) or consumption; expired rows removed |
| `email_verifications.consumed_at` | Operational metadata (plaintext) | Owner / authorized staff | Until expiry (24 hours) or consumption; expired rows removed |
| `email_verifications.created_at` | Operational metadata (plaintext) | Owner / authorized staff | Until expiry (24 hours) or consumption; expired rows removed |
| `file_objects.id` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `file_objects.backend_id` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `file_objects.object_key` | Internal storage identifier; never a public credential | API/worker only | Record lifetime; explicit project lifecycle action |
| `file_objects.expected_size` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `file_objects.size` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `file_objects.etag` | Content integrity/fingerprint metadata; not a capability | Owner / authorized services | Record lifetime; explicit project lifecycle action |
| `file_objects.sha256` | Content integrity/fingerprint metadata; not a capability | Owner / authorized services | Record lifetime; explicit project lifecycle action |
| `file_objects.checksum_sha256` | Content integrity/fingerprint metadata; not a capability | Owner / authorized services | Record lifetime; explicit project lifecycle action |
| `file_objects.detected_mime` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `file_objects.state` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `file_objects.created_at` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `file_objects.verified_at` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `file_versions.id` | Operational metadata (plaintext) | Owner / authorized staff | Global and plan count/age minimum; file purge removes references |
| `file_versions.file_id` | Operational metadata (plaintext) | Owner / authorized staff | Global and plan count/age minimum; file purge removes references |
| `file_versions.object_id` | Operational metadata (plaintext) | Owner / authorized staff | Global and plan count/age minimum; file purge removes references |
| `file_versions.revision` | Operational metadata (plaintext) | Owner / authorized staff | Global and plan count/age minimum; file purge removes references |
| `file_versions.name` | User-supplied or operational text; may contain personal data | Owner / authorized staff (public only when explicitly shared) | Global and plan count/age minimum; file purge removes references |
| `file_versions.declared_mime` | Operational metadata (plaintext) | Owner / authorized staff | Global and plan count/age minimum; file purge removes references |
| `file_versions.created_at` | Operational metadata (plaintext) | Owner / authorized staff | Global and plan count/age minimum; file purge removes references |
| `files.id` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `files.owner_id` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `files.object_id` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `files.folder_id` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `files.name` | User-supplied or operational text; may contain personal data | Owner / authorized staff (public only when explicitly shared) | Record lifetime; explicit project lifecycle action |
| `files.declared_mime` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `files.state` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `files.favorite` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `files.expires_at` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `files.deleted_at` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `files.created_at` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `files.revision` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `folders.id` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `folders.owner_id` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `folders.parent_id` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `folders.name` | User-supplied or operational text; may contain personal data | Owner / authorized staff (public only when explicitly shared) | Record lifetime; explicit project lifecycle action |
| `folders.deleted_at` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `folders.created_at` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `folders.revision` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `ip_blocks.ip` | Daily rotating keyed pseudonym; stable purpose-separated HMAC only in ip_blocks | Restricted abuse correlation; no raw address | Until configured expiry or explicit removal |
| `ip_blocks.reason` | User-supplied or operational text; may contain personal data | Owner / authorized staff (public only when explicitly shared) | Until configured expiry or explicit removal |
| `ip_blocks.actor_id` | Operational metadata (plaintext) | Owner / authorized staff | Until configured expiry or explicit removal |
| `ip_blocks.expires_at` | Operational metadata (plaintext) | Owner / authorized staff | Until configured expiry or explicit removal |
| `ip_blocks.created_at` | Operational metadata (plaintext) | Owner / authorized staff | Until configured expiry or explicit removal |
| `multipart_sessions.upload_id` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `multipart_sessions.storage_upload_id` | Internal storage identifier; never a public credential | API/worker only | Record lifetime; explicit project lifecycle action |
| `notifications.id` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `notifications.user_id` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `notifications.kind` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `notifications.message` | User-supplied or operational text; may contain personal data | Owner / authorized staff (public only when explicitly shared) | Record lifetime; explicit project lifecycle action |
| `notifications.read_at` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `notifications.created_at` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `password_resets.id` | Operational metadata (plaintext) | Owner / authorized staff | Expiry plus 1 day; single use |
| `password_resets.user_id` | Operational metadata (plaintext) | Owner / authorized staff | Expiry plus 1 day; single use |
| `password_resets.token_hash` | One-way credential digest (share/support HMAC, random session/API SHA-256) | Authentication only; no API disclosure | Expiry plus 1 day; single use |
| `password_resets.expires_at` | Operational metadata (plaintext) | Owner / authorized staff | Expiry plus 1 day; single use |
| `password_resets.consumed_at` | Operational metadata (plaintext) | Owner / authorized staff | Expiry plus 1 day; single use |
| `password_resets.created_at` | Operational metadata (plaintext) | Owner / authorized staff | Expiry plus 1 day; single use |
| `permissions.role` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `permissions.permission` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `plans.id` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `plans.name` | User-supplied or operational text; may contain personal data | Owner / authorized staff (public only when explicitly shared) | Record lifetime; explicit project lifecycle action |
| `plans.policy` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `plans.enabled` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `plans.updated_at` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `quotas.id` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `quotas.user_id` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `quotas.role` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `quotas.policy` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `quotas.updated_at` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `roles.name` | User-supplied or operational text; may contain personal data | Owner / authorized staff (public only when explicitly shared) | Record lifetime; explicit project lifecycle action |
| `schema_migrations.name` | User-supplied or operational text; may contain personal data | Owner / authorized staff (public only when explicitly shared) | Record lifetime; explicit project lifecycle action |
| `schema_migrations.applied_at` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `security_events.id` | Operational metadata (plaintext) | Owner / authorized staff | Configured privacyRetentionDays |
| `security_events.kind` | Operational metadata (plaintext) | Owner / authorized staff | Configured privacyRetentionDays |
| `security_events.ip` | Daily rotating keyed pseudonym; stable purpose-separated HMAC only in ip_blocks | Restricted abuse correlation; no raw address | Configured privacyRetentionDays |
| `security_events.detail` | Redacted operational events / bounded status; no request bodies or credentials | Authorized staff | Configured privacyRetentionDays |
| `security_events.created_at` | Operational metadata (plaintext) | Owner / authorized staff | Configured privacyRetentionDays |
| `seo_settings.id` | Public editorial content / configuration; drafts private | Published snapshot public; revisions/admin configuration staff only | Record lifetime; explicit project lifecycle action |
| `seo_settings.value` | Public editorial content / configuration; drafts private | Published snapshot public; revisions/admin configuration staff only | Record lifetime; explicit project lifecycle action |
| `seo_settings.revision` | Public editorial content / configuration; drafts private | Published snapshot public; revisions/admin configuration staff only | Record lifetime; explicit project lifecycle action |
| `seo_settings.updated_at` | Public editorial content / configuration; drafts private | Published snapshot public; revisions/admin configuration staff only | Record lifetime; explicit project lifecycle action |
| `sessions.id` | Operational metadata (plaintext) | Owner / authorized staff | Until expiry/revocation; IP correlation cleared after configured privacyRetentionDays |
| `sessions.user_id` | Operational metadata (plaintext) | Owner / authorized staff | Until expiry/revocation; IP correlation cleared after configured privacyRetentionDays |
| `sessions.token_hash` | One-way credential digest (share/support HMAC, random session/API SHA-256) | Authentication only; no API disclosure | Until expiry/revocation; IP correlation cleared after configured privacyRetentionDays |
| `sessions.expires_at` | Operational metadata (plaintext) | Owner / authorized staff | Until expiry/revocation; IP correlation cleared after configured privacyRetentionDays |
| `sessions.ip` | Daily rotating keyed pseudonym; stable purpose-separated HMAC only in ip_blocks | Restricted abuse correlation; no raw address | Until expiry/revocation; IP correlation cleared after configured privacyRetentionDays |
| `sessions.user_agent` | Legacy nullable column; raw client agent is cleared and no longer written | Not disclosed | Until expiry/revocation; IP correlation cleared after configured privacyRetentionDays |
| `sessions.created_at` | Operational metadata (plaintext) | Owner / authorized staff | Until expiry/revocation; IP correlation cleared after configured privacyRetentionDays |
| `sessions.friendly_name_ciphertext` | Sensitive recoverable text; AES-256-GCM with record-bound AAD | Owner or authorized support; account names owner only | Until expiry/revocation; IP correlation cleared after configured privacyRetentionDays |
| `sessions.browser` | Coarse device category; no full user agent | Account owner | Until expiry/revocation; IP correlation cleared after configured privacyRetentionDays |
| `sessions.os` | Coarse device category; no full user agent | Account owner | Until expiry/revocation; IP correlation cleared after configured privacyRetentionDays |
| `sessions.last_seen_at` | Operational metadata (plaintext) | Owner / authorized staff | Until expiry/revocation; IP correlation cleared after configured privacyRetentionDays |
| `settings.id` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `settings.value` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `settings.updated_at` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `share_access.id` | Operational metadata (plaintext) | Owner / authorized staff | Until expiry (1 hour) or regeneration/revocation |
| `share_access.share_id` | Operational metadata (plaintext) | Owner / authorized staff | Until expiry (1 hour) or regeneration/revocation |
| `share_access.token_hash` | One-way credential digest (share/support HMAC, random session/API SHA-256) | Authentication only; no API disclosure | Until expiry (1 hour) or regeneration/revocation |
| `share_access.version` | Operational metadata (plaintext) | Owner / authorized staff | Until expiry (1 hour) or regeneration/revocation |
| `share_access.expires_at` | Operational metadata (plaintext) | Owner / authorized staff | Until expiry (1 hour) or regeneration/revocation |
| `share_access.password_verified` | Operational metadata (plaintext) | Owner / authorized staff | Until expiry (1 hour) or regeneration/revocation |
| `share_items.id` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `share_items.share_id` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `share_items.file_id` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `share_items.folder_id` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `shares.id` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `shares.owner_id` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `shares.name` | User-supplied or operational text; may contain personal data | Owner / authorized staff (public only when explicitly shared) | Record lifetime; explicit project lifecycle action |
| `shares.visibility` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `shares.password_hash` | Argon2id one-way password verifier | Authentication only; no API disclosure | Record lifetime; explicit project lifecycle action |
| `shares.enabled` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `shares.expires_at` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `shares.max_downloads` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `shares.download_count` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `shares.view_count` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `shares.version` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `shares.created_at` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `shares.capability_digest` | One-way credential digest (share/support HMAC, random session/API SHA-256) | Authentication only; no API disclosure | Record lifetime; explicit project lifecycle action |
| `storage_backends.id` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `storage_backends.type` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `storage_backends.bucket` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `storage_backends.enabled` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `storage_backends.created_at` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `storage_usage.id` | Operational metadata (plaintext) | Owner / authorized staff | 30 days |
| `storage_usage.used_bytes` | Operational metadata (plaintext) | Owner / authorized staff | 30 days |
| `storage_usage.free_bytes` | Operational metadata (plaintext) | Owner / authorized staff | 30 days |
| `storage_usage.total_bytes` | Operational metadata (plaintext) | Owner / authorized staff | 30 days |
| `storage_usage.active_uploads` | Operational metadata (plaintext) | Owner / authorized staff | 30 days |
| `storage_usage.created_at` | Operational metadata (plaintext) | Owner / authorized staff | 30 days |
| `support_access.token_hash` | One-way credential digest (share/support HMAC, random session/API SHA-256) | Authentication only; no API disclosure | Until expiry (1 hour) |
| `support_access.ticket_id` | Operational metadata (plaintext) | Owner / authorized staff | Until expiry (1 hour) |
| `support_access.expires_at` | Operational metadata (plaintext) | Owner / authorized staff | Until expiry (1 hour) |
| `support_messages.id` | Operational metadata (plaintext) | Owner / authorized staff | Parent ticket lifetime; cascade deletion |
| `support_messages.ticket_id` | Operational metadata (plaintext) | Owner / authorized staff | Parent ticket lifetime; cascade deletion |
| `support_messages.actor_id` | Operational metadata (plaintext) | Owner / authorized staff | Parent ticket lifetime; cascade deletion |
| `support_messages.staff` | Operational metadata (plaintext) | Owner / authorized staff | Parent ticket lifetime; cascade deletion |
| `support_messages.internal` | Operational metadata (plaintext) | Owner / authorized staff | Parent ticket lifetime; cascade deletion |
| `support_messages.body_ciphertext` | Sensitive recoverable text; AES-256-GCM with record-bound AAD | Owner or authorized support; account names owner only | Parent ticket lifetime; cascade deletion |
| `support_messages.created_at` | Operational metadata (plaintext) | Owner / authorized staff | Parent ticket lifetime; cascade deletion |
| `support_tickets.id` | Operational metadata (plaintext) | Owner / authorized staff | Open tickets retained; closed tickets removed after 90 days |
| `support_tickets.owner_id` | Operational metadata (plaintext) | Owner / authorized staff | Open tickets retained; closed tickets removed after 90 days |
| `support_tickets.capability_digest` | One-way credential digest (share/support HMAC, random session/API SHA-256) | Authentication only; no API disclosure | Open tickets retained; closed tickets removed after 90 days |
| `support_tickets.category` | Operational metadata (plaintext) | Owner / authorized staff | Open tickets retained; closed tickets removed after 90 days |
| `support_tickets.subject_ciphertext` | Sensitive recoverable text; AES-256-GCM with record-bound AAD | Owner or authorized support; account names owner only | Open tickets retained; closed tickets removed after 90 days |
| `support_tickets.status` | Operational metadata (plaintext) | Owner / authorized staff | Open tickets retained; closed tickets removed after 90 days |
| `support_tickets.assignee_id` | Operational metadata (plaintext) | Owner / authorized staff | Open tickets retained; closed tickets removed after 90 days |
| `support_tickets.created_at` | Operational metadata (plaintext) | Owner / authorized staff | Open tickets retained; closed tickets removed after 90 days |
| `support_tickets.updated_at` | Operational metadata (plaintext) | Owner / authorized staff | Open tickets retained; closed tickets removed after 90 days |
| `support_tickets.closed_at` | Operational metadata (plaintext) | Owner / authorized staff | Open tickets retained; closed tickets removed after 90 days |
| `upload_parts.upload_id` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `upload_parts.part_number` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `upload_parts.expected_bytes` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `upload_parts.checksum_sha256` | Content integrity/fingerprint metadata; not a capability | Owner / authorized services | Record lifetime; explicit project lifecycle action |
| `upload_parts.etag` | Content integrity/fingerprint metadata; not a capability | Owner / authorized services | Record lifetime; explicit project lifecycle action |
| `upload_parts.confirmed_at` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `uploads.id` | Operational metadata (plaintext) | Owner / authorized staff | Transfer/accounting history retained; IP correlation cleared after privacyRetentionDays |
| `uploads.owner_id` | Operational metadata (plaintext) | Owner / authorized staff | Transfer/accounting history retained; IP correlation cleared after privacyRetentionDays |
| `uploads.file_id` | Operational metadata (plaintext) | Owner / authorized staff | Transfer/accounting history retained; IP correlation cleared after privacyRetentionDays |
| `uploads.object_id` | Operational metadata (plaintext) | Owner / authorized staff | Transfer/accounting history retained; IP correlation cleared after privacyRetentionDays |
| `uploads.fingerprint` | Content integrity/fingerprint metadata; not a capability | Owner / authorized services | Transfer/accounting history retained; IP correlation cleared after privacyRetentionDays |
| `uploads.size` | Operational metadata (plaintext) | Owner / authorized staff | Transfer/accounting history retained; IP correlation cleared after privacyRetentionDays |
| `uploads.part_size` | Operational metadata (plaintext) | Owner / authorized staff | Transfer/accounting history retained; IP correlation cleared after privacyRetentionDays |
| `uploads.state` | Operational metadata (plaintext) | Owner / authorized staff | Transfer/accounting history retained; IP correlation cleared after privacyRetentionDays |
| `uploads.bytes_confirmed` | Operational metadata (plaintext) | Owner / authorized staff | Transfer/accounting history retained; IP correlation cleared after privacyRetentionDays |
| `uploads.failure_count` | Operational metadata (plaintext) | Owner / authorized staff | Transfer/accounting history retained; IP correlation cleared after privacyRetentionDays |
| `uploads.ip` | Daily rotating keyed pseudonym; stable purpose-separated HMAC only in ip_blocks | Restricted abuse correlation; no raw address | Transfer/accounting history retained; IP correlation cleared after privacyRetentionDays |
| `uploads.error_code` | Operational metadata (plaintext) | Owner / authorized staff | Transfer/accounting history retained; IP correlation cleared after privacyRetentionDays |
| `uploads.created_at` | Operational metadata (plaintext) | Owner / authorized staff | Transfer/accounting history retained; IP correlation cleared after privacyRetentionDays |
| `uploads.updated_at` | Operational metadata (plaintext) | Owner / authorized staff | Transfer/accounting history retained; IP correlation cleared after privacyRetentionDays |
| `uploads.expires_at` | Operational metadata (plaintext) | Owner / authorized staff | Transfer/accounting history retained; IP correlation cleared after privacyRetentionDays |
| `users.id` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `users.name` | User-supplied or operational text; may contain personal data | Owner / authorized staff (public only when explicitly shared) | Record lifetime; explicit project lifecycle action |
| `users.password_hash` | Argon2id one-way password verifier | Authentication only; no API disclosure | Record lifetime; explicit project lifecycle action |
| `users.role` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `users.anonymous` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `users.status` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `users.quota` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `users.created_at` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `users.account_id` | Immutable random public Account ID; no authentication power | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `users.email_lookup` | Versioned keyed HMAC blind email index | Authentication only; no API disclosure | Record lifetime; explicit project lifecycle action |
| `users.email_verified_at` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `users.email_status` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `users.name_ciphertext` | Sensitive recoverable text; AES-256-GCM with record-bound AAD | Owner or authorized support; account names owner only | Record lifetime; explicit project lifecycle action |
| `users.plan_id` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |
| `users.subscription_state` | Operational metadata (plaintext) | Owner / authorized staff | Record lifetime; explicit project lifecycle action |

## Keys and rotation

Five independent versioned key rings protect email lookup, share/support capabilities, field encryption, network correlation, and encrypted backups. Cookie signing, API/session random tokens, S3 credentials and database credentials remain separate. New writes use the active version; reads accept retained versions. Never delete an old field or backup key while ciphertext still uses it. Email digests rekey when the user next supplies their email; dormant accounts require retaining the prior lookup key. Existing capabilities need regeneration before retiring their old HMAC key. New network correlation changes daily; stable abuse blocks use a separate HMAC purpose.

All retained key bytes are checked for separation across purposes. Production rings are generated on the server and stored shell-quoted in `/opt/astrafile/secrets/app.env` (root:10001, 0640, parent directory restricted). Backups use authenticated bounded frames and reject truncation/tampering. Restore checks stream into a temporary AstraFile database and remove only that temporary database afterward. Older plaintext metadata backups are replaced only after encryption and exact decrypted SHA-256 verification.

Legacy short path share capabilities are retired by migration 005. Files and share metadata remain; owners regenerate a new 256-bit fragment link. Neither owner nor staff can recover a lost new link. Share fragment secrets are submitted in a POST body, stripped from browser history after resolution, omitted from IndexedDB, and replaced by a short-lived HttpOnly cookie.

Nginx omits IP, query strings, cookies and credentials from access logs and masks legacy share paths. API logging records route patterns and redacted event details; no request bodies. Docker rotates each service log at 10 MB with three files. The plaintext name/content of a user-uploaded file is not covered by log redaction or metadata encryption.

Download concurrency limits count active 15-minute signed grants atomically per owner. A signed grant supports repeated Range requests during its lifetime; this is not a count of open TCP connections. Bandwidth accounting measures authorized file bytes, not observed CDN/storage bytes. Optional analytics integration is disabled; IDs may be prepared for later domain/consent setup.
