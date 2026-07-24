alter table public.resource_documents
  alter column file_url drop not null;

alter table public.resource_documents
  add column if not exists server_path text;

alter table public.resource_documents
  drop constraint if exists resource_documents_file_url_https_check;

alter table public.resource_documents
  add constraint resource_documents_location_check
  check (
    (
      file_url is not null
      and lower(file_url) like 'https://%'
      and file_url !~ '[[:space:]]'
      and file_url !~* '^https://[^/?#[:space:]]*@'
      and server_path is null
    )
    or (
      server_path is not null
      and file_url is null
      and server_path ~ E'^\\\\\\\\[^\\\\]+\\\\[^\\\\]+'
      and server_path !~ E'[\\r\\n\\t]'
    )
  )
  not valid;

alter function public.get_project_detail_context(uuid)
  rename to get_project_detail_context_legacy;

create or replace function public.get_project_detail_context(target_project_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with context as (
    select public.get_project_detail_context_legacy(target_project_id) as payload
  ),
  documents as (
    select coalesce(
      jsonb_agg(
        document || jsonb_build_object('server_path', resource.server_path)
        order by (document->>'created_at') desc, (document->>'id') asc
      ),
      '[]'::jsonb
    ) as value
    from context
    cross join lateral jsonb_array_elements(
      coalesce(context.payload->'documents', '[]'::jsonb)
    ) as item(document)
    left join public.resource_documents resource
      on resource.id = (item.document->>'id')::uuid
  )
  select case
    when context.payload->>'found' = 'true' then
      jsonb_set(context.payload, '{documents}', documents.value, true)
    else context.payload
  end
  from context
  cross join documents;
$$;

revoke all on function public.get_project_detail_context(uuid) from public;
grant execute on function public.get_project_detail_context(uuid) to authenticated;
