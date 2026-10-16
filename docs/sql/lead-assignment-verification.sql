-- Read-only verification AFTER applying 202610160001_owner_request_assignments.sql.
select relrowsecurity as rls_enabled
from pg_class where oid = 'public.owner_request_assignments'::regclass;

select
  has_table_privilege('anon', 'public.owner_request_assignments', 'select') as anon_read_should_be_false,
  has_table_privilege('authenticated', 'public.owner_request_assignments', 'update') as browser_write_should_be_false,
  has_function_privilege('authenticated', 'public.set_owner_request_assignment(uuid,uuid,uuid,bigint)', 'execute') as browser_rpc_should_be_false,
  has_function_privilege('service_role', 'public.set_owner_request_assignment(uuid,uuid,uuid,bigint)', 'execute') as service_rpc_should_be_true;

select count(*) as assignment_records from public.owner_request_assignments;
