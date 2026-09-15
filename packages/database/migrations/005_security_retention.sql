-- Retire legacy short path capabilities while retaining their files and share metadata.
UPDATE shares SET enabled=false,version=version+1,
 capability_digest='retired:'||replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','')
WHERE created_at < (SELECT applied_at FROM schema_migrations WHERE name='002_private_accounts.sql');
DELETE FROM share_access WHERE share_id IN (SELECT id FROM shares WHERE capability_digest LIKE 'retired:%');
CREATE INDEX IF NOT EXISTS downloads_active_grants ON downloads(owner_id,created_at DESC);
