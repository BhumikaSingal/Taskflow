create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  google_sub text unique not null,
  email text unique not null,
  name text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 200),
  description text not null default '',
  created_by uuid not null references public.users(id) on delete cascade,
  assigned_to uuid references public.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'completed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists tasks_created_by_idx on public.tasks(created_by);
create index if not exists tasks_assigned_to_idx on public.tasks(assigned_to);

create table if not exists public.task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  event_type text not null check (event_type in ('created', 'completed')),
  actor_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;
alter table public.tasks enable row level security;
alter table public.task_events enable row level security;

-- The Flask API uses the Supabase service-role key and performs authorization itself.
-- Do not expose SUPABASE_SERVICE_ROLE_KEY to the browser.
