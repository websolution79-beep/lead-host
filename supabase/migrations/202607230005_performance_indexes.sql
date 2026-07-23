-- Read-path indexes for growing admin and Property Manager datasets.
-- These indexes do not modify existing rows or application behavior.

create index if not exists lead_purchases_pm_created_idx
  on lead_purchases (property_manager_id, created_at desc);

create index if not exists lead_purchases_status_created_idx
  on lead_purchases (status, created_at desc);

create index if not exists reports_pm_status_created_idx
  on reports (property_manager_id, status, created_at desc);

create index if not exists reports_status_created_idx
  on reports (status, created_at desc);

create index if not exists payments_created_idx
  on payments (created_at desc);

create index if not exists payments_status_created_idx
  on payments (status, created_at desc);

create index if not exists leads_status_published_idx
  on leads (status, published_at desc);

create index if not exists leads_status_expires_idx
  on leads (status, expires_at)
  where expires_at is not null;

create index if not exists property_manager_profiles_verification_created_idx
  on property_manager_profiles (verification_status, created_at desc);
