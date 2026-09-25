-- Phase 4-6: audit metadata, notification coverage, and analytics support

alter table public.task_events
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.task_events
  drop constraint if exists task_events_event_type_check;

alter table public.task_events
  add constraint task_events_event_type_check check (
    event_type in (
      'created','completed','reopened','status_changed',
      'priority_changed','due_date_changed','assigned',
      'unassigned','updated','comment_added'
    )
  );

create index if not exists idx_task_events_task_created
  on public.task_events(task_id, created_at desc);

create index if not exists idx_notifications_user_unread_created
  on public.notifications(user_id, read_at, created_at desc);
