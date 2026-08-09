ALTER TABLE "role_templates" ADD COLUMN IF NOT EXISTS "normalized_name" text DEFAULT '' NOT NULL;
ALTER TABLE "role_templates" ADD COLUMN IF NOT EXISTS "revision" integer DEFAULT 1 NOT NULL;
ALTER TABLE "role_templates" ADD COLUMN IF NOT EXISTS "merged_into_id" text;

UPDATE "role_templates"
SET "normalized_name" = lower(regexp_replace("name", '[^a-zA-Z0-9]+', '', 'g'))
WHERE "normalized_name" = '';

CREATE OR REPLACE FUNCTION prevent_duplicate_active_role_template()
RETURNS trigger AS $$
BEGIN
  IF NEW.merged_into_id IS NULL AND EXISTS (
    SELECT 1 FROM role_templates existing
    WHERE existing.id <> NEW.id
      AND existing.merged_into_id IS NULL
      AND existing.normalized_name = NEW.normalized_name
  ) THEN
    RAISE EXCEPTION 'An equivalent active role template already exists.' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS role_templates_prevent_duplicate_active ON role_templates;
CREATE TRIGGER role_templates_prevent_duplicate_active
BEFORE INSERT OR UPDATE OF normalized_name, merged_into_id ON role_templates
FOR EACH ROW EXECUTE FUNCTION prevent_duplicate_active_role_template();
