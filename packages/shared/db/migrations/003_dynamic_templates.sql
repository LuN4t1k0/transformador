-- User-authored templates: classification, archiving and the job's working configuration.
alter table templates
  add column if not exists destination text,
  add column if not exists process text,
  add column if not exists archived_at timestamptz;

create unique index if not exists templates_active_name_idx
  on templates (lower(name))
  where archived_at is null;

-- The configuration a job is being edited/run with. It may differ from the base template version until saved.
alter table transformation_jobs
  add column if not exists working_template jsonb;
