-- Rows excluded by validation are delivered in a separate temporary file, purged with the job.
alter table transformation_jobs
  add column if not exists rejects_storage_key text,
  add column if not exists rejected_rows integer not null default 0;

-- Active-job lookups per user (concurrency limit).
create index if not exists transformation_jobs_user_status_idx
  on transformation_jobs (user_id, status);
