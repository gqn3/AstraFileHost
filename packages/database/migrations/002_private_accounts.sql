-- The migration runner performs keyed legacy-data conversion in this same transaction.
ALTER TABLE users ADD COLUMN account_id text UNIQUE;
ALTER TABLE users ADD COLUMN email_lookup text UNIQUE;
ALTER TABLE users ADD COLUMN email_verified_at timestamptz;
ALTER TABLE users ADD COLUMN email_status text NOT NULL DEFAULT 'NONE' CHECK(email_status IN ('NONE','UNVERIFIED','VERIFIED'));
ALTER TABLE users ADD COLUMN name_ciphertext text;
ALTER TABLE users DROP CONSTRAINT users_status_check;
UPDATE users SET status='DISABLED' WHERE status='BANNED';
ALTER TABLE users ADD CONSTRAINT users_status_check CHECK(status IN ('PENDING','ACTIVE','SUSPENDED','DISABLED'));
CREATE TABLE plans(id text PRIMARY KEY CHECK(id ~ '^[A-Z][A-Z0-9_-]{1,30}$'),name text NOT NULL,policy jsonb NOT NULL,enabled boolean NOT NULL DEFAULT true,updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO plans(id,name,policy) VALUES
 ('FREE','Free','{"storageBytes":214748364800,"fileBytes":214748364800,"dailyBytes":536870912000,"monthlyBytes":2147483648000,"bandwidthBytes":5368709120000,"concurrentUploads":4,"concurrentDownloads":8,"shareCount":100,"maxShareHours":8760,"versionCount":5,"versionDays":30,"apiEnabled":false}'),
 ('PRO','Pro','{"storageBytes":2199023255552,"fileBytes":536870912000,"dailyBytes":2199023255552,"monthlyBytes":10995116277760,"bandwidthBytes":21990232555520,"concurrentUploads":8,"concurrentDownloads":16,"shareCount":1000,"maxShareHours":87600,"versionCount":20,"versionDays":90,"apiEnabled":true}');
ALTER TABLE users ADD COLUMN plan_id text NOT NULL DEFAULT 'FREE' REFERENCES plans(id);
UPDATE users SET plan_id='PRO' WHERE role IN ('OWNER','ADMIN','MODERATOR','SUPPORT');
ALTER TABLE users ADD COLUMN subscription_state text NOT NULL DEFAULT 'FREE' CHECK(subscription_state IN ('FREE','TRIAL','ACTIVE','PAST_DUE','CANCELED','MANUAL'));
ALTER TABLE sessions ADD COLUMN friendly_name_ciphertext text;
ALTER TABLE sessions ADD COLUMN browser text NOT NULL DEFAULT 'Unknown';
ALTER TABLE sessions ADD COLUMN os text NOT NULL DEFAULT 'Unknown';
ALTER TABLE sessions ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE email_verifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,email_lookup text NOT NULL,token_hash text NOT NULL UNIQUE,purpose text NOT NULL CHECK(purpose IN ('VERIFY','CHANGE')),expires_at timestamptz NOT NULL,consumed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX email_verifications_expiry ON email_verifications(expires_at);
ALTER TABLE shares ADD COLUMN capability_digest text UNIQUE;
ALTER TABLE share_access ADD COLUMN password_verified boolean NOT NULL DEFAULT false;
-- Operational balances are computed from authoritative state, avoiding drifting counters.
CREATE VIEW account_storage_usage AS
SELECT u.id owner_id,
 COALESCE((SELECT sum(o.expected_size) FROM files f JOIN file_objects o ON o.id=f.object_id WHERE f.owner_id=u.id AND f.state NOT IN ('PROCESSING','PURGED','EXPIRED')),0)::bigint used_bytes,
 COALESCE((SELECT sum(up.size) FROM uploads up WHERE up.owner_id=u.id AND up.state IN ('CREATED','UPLOADING','FINALIZING','FAILED') AND up.error_code IS DISTINCT FROM 'INIT_FAILED'),0)::bigint reserved_bytes,
 (SELECT count(*)::int FROM uploads up WHERE up.owner_id=u.id AND up.state IN ('CREATED','UPLOADING','FINALIZING','FAILED') AND up.error_code IS DISTINCT FROM 'INIT_FAILED') incomplete_uploads
FROM users u;
CREATE FUNCTION immutable_account_id() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.account_id IS NOT NULL AND NEW.account_id IS DISTINCT FROM OLD.account_id THEN RAISE EXCEPTION 'Account ID is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_account_id BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION immutable_account_id();
