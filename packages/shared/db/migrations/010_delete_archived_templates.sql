-- Archived templates should no longer appear in the app. Keep their rows and versions for historical jobs/audit,
-- but mark them as deleted so every normal template query excludes them.
update templates
set deleted_at = coalesce(deleted_at, now()),
    archived_at = coalesce(archived_at, now()),
    updated_at = now()
where archived_at is not null
  and deleted_at is null;
