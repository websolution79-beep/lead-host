-- Private commercial targeting notes for PRIME portfolios.
-- The values are deliberately free-form tags: a PM may target cities, regions
-- or broader areas such as "Centro Italia".

alter table public.prime_internal_notes
  add column if not exists interest_locations text[] not null default '{}'::text[];

alter table public.prime_internal_notes
  drop constraint if exists prime_internal_notes_interest_locations_limit;

alter table public.prime_internal_notes
  add constraint prime_internal_notes_interest_locations_limit
  check (
    cardinality(interest_locations) <= 20
    and array_position(interest_locations, null) is null
    and coalesce(array_length(array_remove(interest_locations, ''), 1), 0) = cardinality(interest_locations)
  );

comment on column public.prime_internal_notes.interest_locations is
  'Private free-form location tags used by Super Admin and assigned Account Manager to manage the PRIME portfolio.';
