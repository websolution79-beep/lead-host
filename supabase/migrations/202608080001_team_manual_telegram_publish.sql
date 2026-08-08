-- Separate permission: handling leads must not automatically allow publishing
-- messages in the public Telegram channel.
insert into team_permissions (
  key,
  section,
  label,
  description,
  supports_write,
  sort_order
)
values (
  'telegram_manual_publish',
  'Comunicazioni',
  'Pubblicazione manuale Telegram',
  'Inviare manualmente nel canale Telegram un lead pubblicato e ancora disponibile.',
  true,
  125
)
on conflict (key) do update
set
  section = excluded.section,
  label = excluded.label,
  description = excluded.description,
  supports_write = excluded.supports_write,
  sort_order = excluded.sort_order;
