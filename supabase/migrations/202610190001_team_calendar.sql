-- Isolated calendar. No changes to leads, payments, roles or existing permissions.
begin;
create table if not exists public.team_calendar_entries (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.team_members(id) on delete restrict,
  kind text not null check (kind in ('available', 'absent')),
  start_date date not null,
  end_date date not null,
  all_day boolean not null default false,
  start_time text,
  end_time text,
  repeats_weekly boolean not null default false,
  repeat_until date,
  note text not null default '' check (length(note) <= 1000),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date and end_date <= start_date + 366),
  check (
    (all_day and start_time is null and end_time is null) or
    (not all_day and start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      and end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      and start_time is not null and end_time is not null
      and (end_date > start_date or end_time > start_time))
  ),
  check (
    (not repeats_weekly and repeat_until is null) or
    (repeats_weekly and start_date = end_date and repeat_until is not null
      and repeat_until >= start_date and repeat_until <= start_date + 366)
  )
);
create index if not exists team_calendar_entries_member_idx on public.team_calendar_entries(member_id);
create index if not exists team_calendar_entries_dates_idx on public.team_calendar_entries(start_date, end_date);
alter table public.team_calendar_entries enable row level security;
revoke all on public.team_calendar_entries from public, anon, authenticated;
grant select, insert, update, delete on public.team_calendar_entries to service_role;
commit;
