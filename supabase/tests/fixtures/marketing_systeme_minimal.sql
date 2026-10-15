-- Use only in an empty, isolated PostgreSQL database.
do $$
begin
  if current_setting('leadhost.isolated_schema_test', true) is distinct from 'true'
    or to_regclass('public.profiles') is not null
  then
    raise exception 'This fixture requires an empty isolated test database';
  end if;
end;
$$;

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create table public.profiles (id uuid primary key);

create function public.current_profile_id() returns uuid
language sql stable
as $$ select nullif(current_setting('leadhost.test_profile_id', true), '')::uuid $$;

create function public.is_super_admin() returns boolean
language sql stable
as $$ select coalesce(current_setting('leadhost.test_super_admin', true), 'false') = 'true' $$;

create function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;

insert into public.profiles (id) values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002');
