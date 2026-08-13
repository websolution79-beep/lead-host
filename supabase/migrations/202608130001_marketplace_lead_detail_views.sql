alter table public.leads
  add column if not exists detail_view_count bigint not null default 0
  check (detail_view_count >= 0);

comment on column public.leads.detail_view_count is
  'Numero complessivo di aperture effettive del dettaglio marketplace.';

create or replace function public.record_marketplace_lead_view(p_lead_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count bigint;
begin
  update public.leads
  set detail_view_count = detail_view_count + 1
  where id = p_lead_id
    and published_at is not null
  returning detail_view_count into v_count;

  if v_count is null then
    raise exception 'marketplace_lead_not_found';
  end if;

  return v_count;
end;
$$;

revoke all on function public.record_marketplace_lead_view(uuid) from public, anon, authenticated;
grant execute on function public.record_marketplace_lead_view(uuid) to service_role;
