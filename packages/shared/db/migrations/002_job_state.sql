-- Job state needed by the UI. Only metadata: sheet names, headers, detected types, mapping by column
-- name and validation issues (row, column, code). Row values are never stored.
alter table transformation_jobs
  add column if not exists file_name text,
  add column if not exists file_size_bytes integer,
  add column if not exists mode text not null default 'LENIENT',
  add column if not exists stage text,
  add column if not exists workbook_analysis jsonb,
  add column if not exists selected_sheet text,
  add column if not exists mapping jsonb,
  add column if not exists confirmed_ids jsonb not null default '[]'::jsonb,
  add column if not exists validation_summary jsonb,
  add column if not exists error_code text,
  add column if not exists error_message text,
  add column if not exists downloaded_at timestamptz,
  add column if not exists purged_at timestamptz;

create index if not exists transformation_jobs_user_created_idx
  on transformation_jobs (user_id, created_at desc);

create index if not exists transformation_jobs_active_expiry_idx
  on transformation_jobs (expires_at)
  where status not in ('PURGED', 'EXPIRED', 'CANCELLED', 'FAILED');

alter table templates add column if not exists slug text unique;
