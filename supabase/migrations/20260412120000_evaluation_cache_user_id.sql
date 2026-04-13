-- Per-user evaluation cache: invalidate legacy cross-tenant rows and enforce uniqueness.
-- Apply in Supabase SQL editor or via supabase db push.

TRUNCATE TABLE evaluation_cache;

ALTER TABLE evaluation_cache
  ADD COLUMN IF NOT EXISTS user_id uuid;

ALTER TABLE evaluation_cache
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE evaluation_cache
  DROP CONSTRAINT IF EXISTS evaluation_cache_payload_hash_university_name_key;

DROP INDEX IF EXISTS evaluation_cache_payload_hash_university_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS evaluation_cache_user_payload_university_uidx
  ON evaluation_cache (user_id, payload_hash, university_name);
