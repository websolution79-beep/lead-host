create table if not exists public.pm_telegram_prompt_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists pm_telegram_prompt_preferences_updated_at
  on public.pm_telegram_prompt_preferences;
create trigger pm_telegram_prompt_preferences_updated_at
before update on public.pm_telegram_prompt_preferences
for each row execute function public.set_updated_at();

alter table public.pm_telegram_prompt_preferences enable row level security;

revoke all on table public.pm_telegram_prompt_preferences from anon, authenticated;
grant all on table public.pm_telegram_prompt_preferences to service_role;

comment on table public.pm_telegram_prompt_preferences is
  'Per-user preference for suppressing the Telegram opportunity prompt across devices.';
