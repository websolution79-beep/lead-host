insert into public.team_permissions (
  key,
  section,
  label,
  description,
  supports_write,
  sort_order
)
values (
  'marketplace',
  'Operativita',
  'Marketplace',
  'Consultare le opportunita pubblicate senza effettuare acquisti.',
  false,
  5
)
on conflict (key) do update
set
  section = excluded.section,
  label = excluded.label,
  description = excluded.description,
  supports_write = excluded.supports_write,
  sort_order = excluded.sort_order;
