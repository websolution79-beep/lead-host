alter table leads drop constraint if exists lead_prices_fixed;

insert into settings (key, value) values
  ('wallet.min_top_up_cents', '3000'::jsonb),
  ('wallet.quick_top_up_cents', '[3000,5000,10000]'::jsonb),
  ('lead.price_rules', '[]'::jsonb)
on conflict (key) do nothing;
