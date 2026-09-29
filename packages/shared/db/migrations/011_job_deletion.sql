-- Deleted jobs disappear from history/home but remain for audit references.
alter table transformation_jobs
  add column if not exists deleted_at timestamptz;

create index if not exists transformation_jobs_user_visible_created_idx
  on transformation_jobs (user_id, created_at desc)
  where deleted_at is null;
