update public.settings
set value = jsonb_set(
  value,
  '{messageTemplate}',
  to_jsonb(
    replace(
      value ->> 'messageTemplate',
      '{{subletting}}',
      '{{subletting}}' || E'\n' || '{{estimated_annual_gross}}'
    )
  ),
  true
)
where key = 'telegram.channel_settings'
  and value ->> 'messageTemplate' like '%{{subletting}}%'
  and value ->> 'messageTemplate' not like '%{{estimated_annual_gross}}%';
