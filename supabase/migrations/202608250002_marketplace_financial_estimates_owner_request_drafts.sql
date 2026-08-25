-- A marketplace financial estimate can be prepared before a lead is created.
-- It is first attached to the owner request and then linked to the final lead
-- during publication, preserving the exact snapshot entered by the operator.
alter table marketplace_financial_estimates
  add column if not exists owner_request_id uuid references owner_requests(id) on delete cascade;

alter table marketplace_financial_estimates
  alter column lead_id drop not null;

update marketplace_financial_estimates estimate
set owner_request_id = lead.owner_request_id
from leads lead
where estimate.lead_id = lead.id
  and estimate.owner_request_id is null;

create unique index if not exists marketplace_financial_estimates_owner_request_unique_idx
  on marketplace_financial_estimates (owner_request_id)
  where owner_request_id is not null;

create index if not exists marketplace_financial_estimates_owner_request_idx
  on marketplace_financial_estimates (owner_request_id);
