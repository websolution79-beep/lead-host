alter table public.owner_requests
  add column if not exists subletting_available boolean not null default false;

comment on column public.owner_requests.subletting_available is
  'Indicates that the owner declared availability to consider a subletting agreement during lead verification.';

create index if not exists owner_requests_subletting_status_idx
  on public.owner_requests (subletting_available, status, updated_at desc);
