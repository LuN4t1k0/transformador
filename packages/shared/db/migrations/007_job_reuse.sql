-- A new upload can start from an earlier conversion's configuration ("repeat", "reprocess rejects")
-- or from a saved template (batch uploads). Applied by the worker after analysis.
alter table transformation_jobs
  add column if not exists reuse_from_job_id uuid references transformation_jobs(id) on delete set null,
  add column if not exists requested_template_id uuid references templates(id) on delete set null;
