insert into storage.buckets (id, name, public)
values ('desktop-agent-releases', 'desktop-agent-releases', false)
on conflict (id) do update set public = false;
