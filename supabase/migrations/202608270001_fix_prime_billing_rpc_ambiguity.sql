-- Fix ambiguous output-column references in the atomic PRIME billing RPC.
-- The function body is patched in place so existing permissions and callers stay unchanged.

do $migration$
declare
  v_signature regprocedure := 'public.complete_prime_billing_period(uuid,uuid,uuid,text,text,text,text,text,integer,integer,integer,text,timestamptz,timestamptz,jsonb)'::regprocedure;
  v_definition text;
begin
  select pg_get_functiondef(v_signature::oid)
  into v_definition;

  v_definition := regexp_replace(
    v_definition,
    'from public\.wallets[[:space:]]+where profile_id = p_profile_id',
    'from public.wallets as w where w.profile_id = p_profile_id',
    'gi'
  );
  v_definition := regexp_replace(
    v_definition,
    'on conflict \(profile_id\) do nothing',
    'on conflict on constraint wallets_profile_id_key do nothing',
    'gi'
  );
  v_definition := regexp_replace(
    v_definition,
    'update public\.wallets[[:space:]]+set balance_cents = balance_cents \+ p_wallet_recharge_amount_cents[[:space:]]+where id = v_wallet\.id',
    'update public.wallets as w set balance_cents = w.balance_cents + p_wallet_recharge_amount_cents where w.id = v_wallet.id',
    'gi'
  );

  if v_definition !~* 'from public\.wallets as w where w\.profile_id = p_profile_id'
    or v_definition !~* 'on conflict on constraint wallets_profile_id_key do nothing'
    or v_definition !~* 'update public\.wallets as w set balance_cents = w\.balance_cents' then
    raise exception 'complete_prime_billing_period patch did not match the installed function';
  end if;

  execute v_definition;
end;
$migration$;

