-- Correct parenthesization of the nullable occupancy condition.

alter table marketing_revenue_estimates
  drop constraint if exists marketing_revenue_estimates_rates,
  add constraint marketing_revenue_estimates_rates check (
    (occupancy_rate is null or occupancy_rate between 0 and 1)
    and pm_fee_rate between 0 and 1 and airbnb_mix_rate between 0 and 1 and booking_mix_rate between 0 and 1 and direct_mix_rate between 0 and 1
    and airbnb_commission_rate between 0 and 1 and booking_commission_rate between 0 and 1 and direct_commission_rate between 0 and 1
    and ota_vat_rate between 0 and 1 and pm_vat_rate between 0 and 1 and tax_rate between 0 and 1
  );
