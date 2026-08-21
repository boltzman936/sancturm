drop function if exists public.team_directory();

create function public.team_directory()
returns table (
  display_name text,
  branch_id uuid,
  specialization_id uuid,
  batch_id uuid,
  year_number integer,
  current_term_id uuid
)
language sql
security definer
set search_path = public
stable
as $$
  select
    cp.display_name,
    cp.branch_id,
    cp.specialization_id,
    cp.batch_id,
    cp.year_number,
    cr_current_term_id(cp.batch_id, cp.year_number, cp.specialization_id) as current_term_id
  from cr_profiles cp
  order by cp.created_at asc;
$$;
revoke all on function public.team_directory() from public;
grant execute on function public.team_directory() to anon, authenticated;

drop policy if exists "Admin only updates" on cr_profiles;

alter table cr_profiles drop column if exists card_file_url;
alter table cr_profiles drop column if exists card_content_hash;
alter table cr_profiles drop column if exists card_uploaded_at;
