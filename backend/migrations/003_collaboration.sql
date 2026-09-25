-- Phase 3: collaboration and in-app notifications

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  type text not null check (type in (
    'task_assigned','task_completed','status_changed',
    'comment_added','priority_changed','due_date_changed'
  )),
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_task_comments_task_created
  on public.task_comments(task_id, created_at desc);

create index if not exists idx_notifications_user_created
  on public.notifications(user_id, created_at desc);

create index if not exists idx_notifications_unread
  on public.notifications(user_id) where read_at is null;

alter table public.task_comments enable row level security;
alter table public.notifications enable row level security;

-- Flask uses the Supabase service role and performs authorization in the API.
