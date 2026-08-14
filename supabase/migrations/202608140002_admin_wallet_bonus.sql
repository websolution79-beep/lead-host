create or replace function grant_manual_wallet_bonus(
  p_target_profile_id uuid,
  p_actor_profile_id uuid,
  p_amount_cents integer,
  p_reason text,
  p_internal_note text,
  p_operation_id uuid
)
returns table (
  wallet_transaction_id uuid,
  target_profile_id uuid,
  amount_cents integer,
  balance_cents integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet wallets;
  v_transaction wallet_transactions;
  v_new_balance_cents integer;
  v_reason text := nullif(trim(p_reason), '');
  v_note text := nullif(trim(coalesce(p_internal_note, '')), '');
begin
  if p_target_profile_id is null or p_actor_profile_id is null then
    raise exception 'wallet_bonus_profile_required';
  end if;

  if not exists (
    select 1
    from user_roles
    where profile_id = p_actor_profile_id
      and role = 'super_admin'
  ) then
    raise exception 'wallet_bonus_super_admin_required';
  end if;

  if not exists (
    select 1
    from user_roles
    where profile_id = p_target_profile_id
      and role = 'property_manager'
  ) then
    raise exception 'wallet_bonus_property_manager_not_found';
  end if;

  if p_amount_cents is null or p_amount_cents < 100 or p_amount_cents > 100000 then
    raise exception 'wallet_bonus_invalid_amount';
  end if;

  if v_reason is null or char_length(v_reason) < 3 or char_length(v_reason) > 160 then
    raise exception 'wallet_bonus_invalid_reason';
  end if;

  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'wallet_bonus_invalid_note';
  end if;

  if p_operation_id is null then
    raise exception 'wallet_bonus_operation_required';
  end if;

  select *
  into v_transaction
  from wallet_transactions
  where provider = 'admin_bonus'
    and provider_reference = p_operation_id::text
  limit 1;

  if found then
    if v_transaction.profile_id <> p_target_profile_id
      or v_transaction.amount_cents <> p_amount_cents then
      raise exception 'wallet_bonus_operation_conflict';
    end if;

    wallet_transaction_id := v_transaction.id;
    target_profile_id := v_transaction.profile_id;
    amount_cents := v_transaction.amount_cents;
    balance_cents := coalesce(v_transaction.balance_after_cents, 0);
    return next;
    return;
  end if;

  insert into wallets (profile_id)
  values (p_target_profile_id)
  on conflict (profile_id) do nothing;

  select *
  into v_wallet
  from wallets
  where profile_id = p_target_profile_id
  for update;

  if not found then
    raise exception 'wallet_bonus_wallet_not_found';
  end if;

  if v_wallet.balance_cents > 2147483647 - p_amount_cents then
    raise exception 'wallet_bonus_balance_overflow';
  end if;

  v_new_balance_cents := v_wallet.balance_cents + p_amount_cents;

  update wallets
  set balance_cents = v_new_balance_cents
  where id = v_wallet.id;

  insert into wallet_transactions (
    wallet_id,
    profile_id,
    type,
    status,
    amount_cents,
    balance_after_cents,
    description,
    provider,
    provider_reference,
    metadata,
    completed_at
  ) values (
    v_wallet.id,
    p_target_profile_id,
    'adjustment',
    'completed',
    p_amount_cents,
    v_new_balance_cents,
    'Bonus omaggio - ' || v_reason,
    'admin_bonus',
    p_operation_id::text,
    jsonb_strip_nulls(jsonb_build_object(
      'kind', 'manual_wallet_bonus',
      'reason', v_reason,
      'internal_note', v_note,
      'granted_by', p_actor_profile_id,
      'operation_id', p_operation_id
    )),
    now()
  )
  returning * into v_transaction;

  insert into audit_logs (
    actor_profile_id,
    actor_role,
    entity_type,
    entity_id,
    action,
    before,
    after
  ) values (
    p_actor_profile_id,
    'super_admin',
    'wallet_bonus',
    v_transaction.id,
    'wallet.bonus_granted',
    jsonb_build_object(
      'target_profile_id', p_target_profile_id,
      'balance_cents', v_wallet.balance_cents
    ),
    jsonb_build_object(
      'target_profile_id', p_target_profile_id,
      'amount_cents', p_amount_cents,
      'balance_cents', v_new_balance_cents,
      'reason', v_reason,
      'internal_note', v_note,
      'wallet_transaction_id', v_transaction.id
    )
  );

  wallet_transaction_id := v_transaction.id;
  target_profile_id := p_target_profile_id;
  amount_cents := p_amount_cents;
  balance_cents := v_new_balance_cents;
  return next;
end;
$$;

revoke all on function grant_manual_wallet_bonus(uuid, uuid, integer, text, text, uuid)
  from public, anon, authenticated;
grant execute on function grant_manual_wallet_bonus(uuid, uuid, integer, text, text, uuid)
  to service_role;
