-- Deleted templates disappear from the app but stay in the database: past conversions and the audit log still
-- reference their versions, and a deleted seed template must not be seeded again.
alter table templates
  add column if not exists deleted_at timestamptz;
