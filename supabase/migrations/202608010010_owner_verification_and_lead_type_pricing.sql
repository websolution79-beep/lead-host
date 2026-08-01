alter table public.owner_requests
  add column if not exists owner_verified boolean not null default false;

-- Preserve the badge for leads published under the previous workflow, where
-- every owner was verified by phone before publication.
update public.owner_requests as request
set owner_verified = true
where exists (
  select 1
  from public.leads
  where leads.owner_request_id = request.id
    and leads.published_at is not null
);

insert into public.settings (key, value)
values
  (
    'lead.in_target_shared_price_cents',
    coalesce(
      (select value from public.settings where key = 'lead.shared_price_cents'),
      '2900'::jsonb
    )
  ),
  (
    'lead.in_target_exclusive_price_cents',
    coalesce(
      (select value from public.settings where key = 'lead.exclusive_price_cents'),
      '5000'::jsonb
    )
  ),
  (
    'lead.verified_shared_price_cents',
    coalesce(
      (select value from public.settings where key = 'lead.shared_price_cents'),
      '2900'::jsonb
    )
  ),
  (
    'lead.verified_exclusive_price_cents',
    coalesce(
      (select value from public.settings where key = 'lead.exclusive_price_cents'),
      '5000'::jsonb
    )
  )
on conflict (key) do nothing;

create index if not exists owner_requests_verification_status_idx
  on public.owner_requests (owner_verified, status, updated_at desc);
