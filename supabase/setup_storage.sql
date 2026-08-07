-- Storage bucket for uploaded Notes & Lab files. Run once in the SQL
-- Editor. Public read (so file_url links work directly) + open insert
-- (so the anonymous upload form can write) — same "public read,
-- anyone can submit" shape as the resources table's own RLS policies.

insert into storage.buckets (id, name, public)
values ('resources', 'resources', true)
on conflict (id) do nothing;

create policy "Public read" on storage.objects for select
  using (bucket_id = 'resources');

create policy "Anyone can upload" on storage.objects for insert
  with check (bucket_id = 'resources');
