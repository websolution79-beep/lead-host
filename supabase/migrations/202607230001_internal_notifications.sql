revoke update on table notifications from anon, authenticated;
grant update(read_at) on table notifications to authenticated;

drop policy if exists "notifications_update_own_read_at" on notifications;
create policy "notifications_update_own_read_at"
on notifications for update
to authenticated
using (profile_id = current_profile_id() or is_super_admin())
with check (profile_id = current_profile_id() or is_super_admin());

create index if not exists notifications_profile_created_idx
  on notifications (profile_id, created_at desc);

create index if not exists notifications_profile_read_idx
  on notifications (profile_id, read_at, created_at desc);
