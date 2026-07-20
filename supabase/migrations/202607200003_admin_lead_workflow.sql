alter type owner_request_status add value if not exists 'pending' before 'to_verify';

update owner_requests
set status = 'pending'::owner_request_status
where status = 'to_verify';
