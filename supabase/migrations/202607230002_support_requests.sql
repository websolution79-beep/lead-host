-- Allow the PM assistance area to receive general requests, not only lead reports.
alter table reports
  alter column lead_purchase_id drop not null,
  alter column reason drop not null;

alter table reports
  add column if not exists subject text;

update reports
set subject = 'purchased_lead_assistance'
where subject is null;

alter table reports
  alter column subject set default 'purchased_lead_assistance',
  alter column subject set not null;

alter table reports
  drop constraint if exists reports_subject_check;

alter table reports
  add constraint reports_subject_check check (
    subject in (
      'platform_assistance',
      'general_information',
      'purchased_lead_assistance'
    )
  );

create index if not exists reports_subject_created_idx
  on reports (subject, created_at desc);
