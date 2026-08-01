-- Repair installations where the owner-request review state migration was skipped.
-- Existing to_verify requests stay in "Nuovi Lead"; only intentionally moved
-- requests will use the new pending state.

alter type public.owner_request_status
  add value if not exists 'pending' before 'to_verify';

alter table public.owner_requests
  add column if not exists status_reason text,
  add column if not exists status_changed_at timestamptz default now();

create or replace function public.set_owner_request_status_changed_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status is distinct from new.status then
    new.status_changed_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists owner_requests_status_changed_at on public.owner_requests;
create trigger owner_requests_status_changed_at
before update of status on public.owner_requests
for each row execute function public.set_owner_request_status_changed_at();

update public.owner_requests
set status_changed_at = coalesce(status_changed_at, updated_at, created_at)
where status_changed_at is null;

-- Recover approvals that published the marketplace lead before failing while
-- writing the missing review metadata columns.
update public.owner_requests as request
set
  status = 'published'::public.owner_request_status,
  status_reason = null
where request.status in ('to_verify', 'approved')
  and exists (
    select 1
    from public.leads as lead
    where lead.owner_request_id = request.id
      and lead.published_at is not null
      and lead.internal_status in (
        'available',
        'one_slot_sold',
        'sold_two_pm',
        'sold_exclusive'
      )
  );

create index if not exists owner_requests_status_changed_at_idx
  on public.owner_requests (status, status_changed_at desc);

