create index if not exists audit_events_job_idx on audit_events (job_id, created_at);
create index if not exists audit_events_template_idx on audit_events (template_id, created_at);
