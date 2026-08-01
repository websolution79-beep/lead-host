-- Additional property information for private Marketing CRM contacts.
-- These fields are intentionally separate from marketplace leads.

alter table marketing_crm_contacts
  add column if not exists property_type text,
  add column if not exists region text,
  add column if not exists province text,
  add column if not exists city text,
  add column if not exists bedrooms integer,
  add column if not exists bathrooms integer,
  add column if not exists area_sqm integer,
  add column if not exists current_status text,
  add column if not exists requested_services text[] not null default '{}'::text[],
  add column if not exists timing text,
  add column if not exists property_description text;

alter table marketing_crm_contacts
  drop constraint if exists marketing_crm_contacts_property_type_length,
  add constraint marketing_crm_contacts_property_type_length
    check (property_type is null or char_length(property_type) <= 80),
  drop constraint if exists marketing_crm_contacts_region_length,
  add constraint marketing_crm_contacts_region_length
    check (region is null or char_length(region) <= 100),
  drop constraint if exists marketing_crm_contacts_province_length,
  add constraint marketing_crm_contacts_province_length
    check (province is null or char_length(province) <= 100),
  drop constraint if exists marketing_crm_contacts_city_length,
  add constraint marketing_crm_contacts_city_length
    check (city is null or char_length(city) <= 120),
  drop constraint if exists marketing_crm_contacts_bedrooms_range,
  add constraint marketing_crm_contacts_bedrooms_range
    check (bedrooms is null or bedrooms between 0 and 99),
  drop constraint if exists marketing_crm_contacts_bathrooms_range,
  add constraint marketing_crm_contacts_bathrooms_range
    check (bathrooms is null or bathrooms between 0 and 99),
  drop constraint if exists marketing_crm_contacts_area_sqm_range,
  add constraint marketing_crm_contacts_area_sqm_range
    check (area_sqm is null or area_sqm between 1 and 100000),
  drop constraint if exists marketing_crm_contacts_current_status_length,
  add constraint marketing_crm_contacts_current_status_length
    check (current_status is null or char_length(current_status) <= 120),
  drop constraint if exists marketing_crm_contacts_services_count,
  add constraint marketing_crm_contacts_services_count
    check (cardinality(requested_services) <= 20),
  drop constraint if exists marketing_crm_contacts_timing_length,
  add constraint marketing_crm_contacts_timing_length
    check (timing is null or char_length(timing) <= 120),
  drop constraint if exists marketing_crm_contacts_description_length,
  add constraint marketing_crm_contacts_description_length
    check (property_description is null or char_length(property_description) <= 5000);
