alter table public.tasks
  drop constraint if exists tasks_status_check;

update public.tasks set status = 'todo' where status = 'pending';

alter table public.tasks
  add constraint tasks_status_check check (status in ('backlog', 'todo', 'in_progress', 'in_review', 'completed'));

alter table public.tasks
  add column if not exists priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent'));

alter table public.tasks
  add column if not exists due_date date;

alter table public.tasks
  add column if not exists updated_at timestamptz not null default now();

update public.tasks set priority = 'medium' where priority is null;
update public.tasks set status = 'todo' where status = 'pending';

alter table public.task_events
  drop constraint if exists task_events_event_type_check;

alter table public.task_events
  add constraint task_events_event_type_check check (event_type in ('created', 'completed', 'reopened', 'status_changed', 'priority_changed', 'due_date_changed', 'assigned', 'unassigned', 'updated'));

create index if not exists tasks_status_idx on public.tasks(status);
create index if not exists tasks_due_date_idx on public.tasks(due_date);
create index if not exists tasks_priority_idx on public.tasks(priority);
