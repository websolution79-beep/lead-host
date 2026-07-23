create table if not exists support_messages (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  sender_type text not null check (sender_type in ('pm', 'admin')),
  sender_profile_id uuid not null references profiles(id) on delete restrict,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists support_messages_report_created_idx
  on support_messages (report_id, created_at asc);

insert into support_messages (report_id, sender_type, sender_profile_id, body, created_at)
select
  reports.id,
  'admin',
  coalesce(reports.replied_by, (
    select profiles.id
    from profiles
    join user_roles on user_roles.profile_id = profiles.id
    where user_roles.role = 'super_admin'
      and profiles.status = 'active'
    order by profiles.created_at asc
    limit 1
  )),
  reports.admin_reply,
  coalesce(reports.replied_at, now())
from reports
where reports.admin_reply is not null
  and not exists (
    select 1
    from support_messages
    where support_messages.report_id = reports.id
  );

alter table support_messages enable row level security;

create policy "support_messages_select_own_or_admin"
on support_messages for select
to authenticated
using (
  sender_profile_id = current_profile_id()
  or is_super_admin()
  or exists (
    select 1
    from reports
    where reports.id = support_messages.report_id
      and reports.property_manager_id in (
        select property_manager_profiles.id
        from property_manager_profiles
        where property_manager_profiles.profile_id = current_profile_id()
      )
  )
);

create policy "support_messages_insert_own_or_admin"
on support_messages for insert
to authenticated
with check (sender_profile_id = current_profile_id() or is_super_admin());
