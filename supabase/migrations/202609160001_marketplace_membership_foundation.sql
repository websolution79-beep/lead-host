-- Preparatory rollout only: no access policy or existing subscription changes.
begin;
set local lock_timeout = '5s';

insert into settings (key, value)
values (
  'marketplace.membership',
  '{"paidAccessEnabled":false,"promoEnabled":false,"promoPriceCents":null}'::jsonb
)
on conflict (key) do nothing;

insert into addon_products (
  slug, name, short_description, status, is_menu_visible, checkout_enabled,
  trial_days, list_price_cents, sale_price_cents, currency,
  billing_interval, billing_interval_count, grace_period_days, cancellation_mode
) values (
  'marketplace', 'Marketplace Lead Host',
  'Accesso al Marketplace pubblico di Lead Host',
  'draft', false, false, 0, null, null, 'eur', 'month', 1, 0, 'period_end'
)
on conflict (slug) do nothing;

commit;
