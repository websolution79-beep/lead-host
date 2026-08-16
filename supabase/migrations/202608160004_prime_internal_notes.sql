-- Internal PRIME portfolio notes. These notes are intentionally separated
-- from prime_accounts so Property Managers cannot read them through owner RLS.

create table if not exists public.prime_internal_notes (
  id uuid primary key default gen_random_uuid(),
  prime_account_id uuid not null unique references public.prime_accounts(id) on delete cascade,
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  notes text not null default '',
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prime_internal_notes_length check (char_length(notes) <= 5000)
);

create index if not exists prime_internal_notes_updated_idx
  on public.prime_internal_notes (updated_at desc);

drop trigger if exists prime_internal_notes_updated_at on public.prime_internal_notes;
create trigger prime_internal_notes_updated_at
before update on public.prime_internal_notes
for each row execute function public.set_updated_at();

alter table public.prime_internal_notes enable row level security;

drop policy if exists "prime_internal_notes_super_admin_manage"
  on public.prime_internal_notes;
create policy "prime_internal_notes_super_admin_manage"
on public.prime_internal_notes for all
to authenticated
using (is_super_admin())
with check (is_super_admin());

comment on table public.prime_internal_notes is
  'Private portfolio notes visible only to authorized team members and Super Admin through server-side PRIME APIs.';
