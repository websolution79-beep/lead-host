-- Separate newly received owner requests from leads intentionally placed on hold.
-- Technical mapping:
--   to_verify = "Nuovi Lead"
--   pending   = "Pending" (follow-up required)

alter table public.owner_requests
  add column if not exists status_reason text,
  add column if not exists status_changed_at timestamptz default now();

create or replace function public.set_owner_request_status_changed_at()
returns trigger
language plpgsql
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
set
  status = 'to_verify'::owner_request_status,
  status_changed_at = coalesce(status_changed_at, updated_at, created_at)
where status = 'pending'::owner_request_status;

update public.owner_requests
set status_changed_at = coalesce(status_changed_at, updated_at, created_at)
where status_changed_at is null;

create index if not exists owner_requests_status_changed_at_idx
  on public.owner_requests (status, status_changed_at desc);

update public.settings
set
  value = (
    select jsonb_agg(
      case
        when template ->> 'id' = 'admin.owner_request_pending' then
          jsonb_set(
            jsonb_set(
              template,
              '{description}',
              to_jsonb('Invio ai Super Admin quando arriva una nuova richiesta proprietario da verificare.'::text)
            ),
            '{title}',
            to_jsonb('Nuovo lead proprietario da verificare.'::text)
          )
        else template
      end
      order by template_index
    )
    from jsonb_array_elements(value) with ordinality as templates(template, template_index)
  ),
  updated_at = now()
where key = 'email.transactional_templates'
  and jsonb_typeof(value) = 'array';
