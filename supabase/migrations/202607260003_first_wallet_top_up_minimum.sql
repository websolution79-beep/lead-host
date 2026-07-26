insert into settings (key, value)
values ('wallet.first_top_up_min_cents', '3000'::jsonb)
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

insert into settings (key, value)
values ('wallet.min_top_up_cents', '1000'::jsonb)
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

create index if not exists wallet_transactions_completed_top_up_profile_idx
  on wallet_transactions (profile_id)
  where type = 'top_up' and status = 'completed';
