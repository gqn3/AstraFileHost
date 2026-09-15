ALTER TABLE files ADD COLUMN revision bigint NOT NULL DEFAULT 1;
ALTER TABLE folders ADD COLUMN revision bigint NOT NULL DEFAULT 1;
CREATE TABLE cloud_cursors(owner_id uuid PRIMARY KEY REFERENCES users(id),sequence bigint NOT NULL DEFAULT 0);
CREATE TABLE cloud_changes(owner_id uuid NOT NULL REFERENCES users(id),sequence bigint NOT NULL,entity text NOT NULL,entity_id uuid NOT NULL,operation text NOT NULL,revision bigint NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(owner_id,sequence));
CREATE TABLE file_versions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),file_id uuid NOT NULL REFERENCES files(id),object_id uuid NOT NULL REFERENCES file_objects(id),revision bigint NOT NULL,name text NOT NULL,declared_mime text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(file_id,revision));
CREATE INDEX file_versions_object ON file_versions(object_id);
CREATE INDEX file_versions_retention ON file_versions(file_id,created_at DESC);
CREATE FUNCTION cloud_emit(owner uuid,kind text,entity uuid,operation text,revision bigint) RETURNS void LANGUAGE plpgsql AS $$
DECLARE next_sequence bigint;
BEGIN
 INSERT INTO cloud_cursors(owner_id,sequence) VALUES(owner,1) ON CONFLICT(owner_id) DO UPDATE SET sequence=cloud_cursors.sequence+1 RETURNING sequence INTO next_sequence;
 INSERT INTO cloud_changes(owner_id,sequence,entity,entity_id,operation,revision) VALUES(owner,next_sequence,kind,entity,operation,revision);
END $$;
CREATE FUNCTION cloud_entity_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rev bigint;
BEGIN
 IF TG_OP='UPDATE' AND TG_TABLE_NAME IN ('files','folders') THEN NEW.revision=OLD.revision+1; END IF;
 IF TG_OP='DELETE' THEN
  rev=COALESCE((to_jsonb(OLD)->>'revision')::bigint,1);PERFORM cloud_emit(OLD.owner_id,TG_TABLE_NAME,OLD.id,'DELETE',rev);RETURN OLD;
 END IF;
 rev=COALESCE((to_jsonb(NEW)->>'revision')::bigint,1);
 IF TG_OP='UPDATE' AND OLD.owner_id<>NEW.owner_id THEN PERFORM cloud_emit(OLD.owner_id,TG_TABLE_NAME,OLD.id,'DELETE',rev); END IF;
 PERFORM cloud_emit(NEW.owner_id,TG_TABLE_NAME,NEW.id,TG_OP,rev);RETURN NEW;
END $$;
CREATE TRIGGER cloud_files BEFORE INSERT OR UPDATE OR DELETE ON files FOR EACH ROW EXECUTE FUNCTION cloud_entity_changed();
CREATE TRIGGER cloud_folders BEFORE INSERT OR UPDATE OR DELETE ON folders FOR EACH ROW EXECUTE FUNCTION cloud_entity_changed();
CREATE TRIGGER cloud_shares BEFORE INSERT OR UPDATE OR DELETE ON shares FOR EACH ROW EXECUTE FUNCTION cloud_entity_changed();
CREATE FUNCTION cloud_object_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE f record;
BEGIN
 FOR f IN SELECT id,owner_id,revision FROM files WHERE object_id=NEW.id ORDER BY owner_id,id LOOP
  PERFORM cloud_emit(f.owner_id,'files',f.id,'UPDATE',f.revision);
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER cloud_objects AFTER UPDATE OF state,sha256 ON file_objects FOR EACH ROW EXECUTE FUNCTION cloud_object_changed();
CREATE OR REPLACE VIEW account_storage_usage AS
SELECT u.id owner_id,
 (COALESCE((SELECT sum(o.expected_size) FROM files f JOIN file_objects o ON o.id=f.object_id WHERE f.owner_id=u.id AND f.state NOT IN ('PROCESSING','PURGED','EXPIRED')),0)+COALESCE((SELECT sum(o.expected_size) FROM file_versions v JOIN files f ON f.id=v.file_id JOIN file_objects o ON o.id=v.object_id WHERE f.owner_id=u.id),0))::bigint used_bytes,
 COALESCE((SELECT sum(up.size) FROM uploads up WHERE up.owner_id=u.id AND up.state IN ('CREATED','UPLOADING','FINALIZING','FAILED') AND up.error_code IS DISTINCT FROM 'INIT_FAILED'),0)::bigint reserved_bytes,
 (SELECT count(*)::int FROM uploads up WHERE up.owner_id=u.id AND up.state IN ('CREATED','UPLOADING','FINALIZING','FAILED') AND up.error_code IS DISTINCT FROM 'INIT_FAILED') incomplete_uploads
FROM users u;
