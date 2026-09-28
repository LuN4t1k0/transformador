create table if not exists local_users (
  id uuid primary key,
  sso_subject text not null unique,
  email text not null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists templates (
  id uuid primary key,
  name text not null,
  description text,
  active_version_id uuid,
  created_by uuid not null references local_users(id),
  updated_by uuid references local_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists template_versions (
  id uuid primary key,
  template_id uuid not null references templates(id),
  version integer not null,
  configuration jsonb not null,
  created_by uuid not null references local_users(id),
  created_at timestamptz not null default now(),
  unique (template_id, version)
);

alter table templates
  add constraint templates_active_version_fk
  foreign key (active_version_id) references template_versions(id);

create table if not exists transformation_jobs (
  id uuid primary key,
  user_id uuid not null references local_users(id),
  template_id uuid references templates(id),
  template_version_id uuid references template_versions(id),
  status text not null,
  total_rows integer,
  processed_rows integer not null default 0,
  warning_count integer not null default 0,
  error_count integer not null default 0,
  input_storage_key text,
  output_storage_key text,
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_events (
  id uuid primary key,
  user_id uuid references local_users(id),
  job_id uuid references transformation_jobs(id),
  template_id uuid references templates(id),
  template_version_id uuid references template_versions(id),
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
