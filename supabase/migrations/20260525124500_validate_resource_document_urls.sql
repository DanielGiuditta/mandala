alter table public.resource_documents
drop constraint if exists resource_documents_file_url_https_check;

alter table public.resource_documents
add constraint resource_documents_file_url_https_check
check (
  lower(file_url) like 'https://%'
  and file_url !~ '[[:space:]]'
  and file_url !~* '^https://[^/?#[:space:]]*@'
)
not valid;
