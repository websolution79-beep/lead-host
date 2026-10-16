-- Minimal entitlement fixture for the isolated import tests only.
do $$
begin
  if current_setting('leadhost.isolated_schema_test', true) is distinct from 'true' then
    raise exception 'This fixture requires an isolated test database';
  end if;
end;
$$;

alter table public.profiles add column status text not null default 'active';
create table public.user_roles (profile_id uuid not null, role text not null);
create table public.addon_products (id uuid primary key, slug text not null unique);
create table public.addon_subscriptions (
  id uuid primary key default gen_random_uuid(),
  addon_product_id uuid not null,
  profile_id uuid not null,
  source text not null,
  status text not null,
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  access_expires_at timestamptz
);
