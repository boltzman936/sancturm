-- CR profile "card" — an image an admin uploads per CR, shown on
-- Sancturm Team once someone clicks "View". One current card per CR
-- (no versioning), stored as three columns directly on cr_profiles
-- rather than a join table, since the relationship is genuinely 1:1.
--
-- cr_profiles has RLS enabled with only a SELECT policy (own row, or
-- any row if admin — see the original cr_profiles setup) and no
-- UPDATE policy at all, so even an admin's own session can't write to
-- it yet. This adds one, mirroring support_config/maintenance_config's
-- own "Admin only updates" policy exactly — the service-role client
-- (src/lib/supabase/admin.ts) is deliberately NOT used here: that key
-- isn't even configured in this deployment, and every other admin
-- mutation in this app already goes through RLS via the normal
-- session client, not a service-role bypass.
alter table cr_profiles add column if not exists card_file_url text;
alter table cr_profiles add column if not exists card_content_hash text;
alter table cr_profiles add column if not exists card_uploaded_at timestamptz;

create policy "Admin only updates" on cr_profiles for update
  using (exists (select 1 from admins where auth_user_id = auth.uid()))
  with check (exists (select 1 from admins where auth_user_id = auth.uid()));

-- team_directory() is the one sanctioned public read of CR data (see
-- its own comment) — extended to also return card_file_url so
-- Sancturm Team's "View" button has something to show. Still
-- deliberately omits id/auth_user_id/card_content_hash/
-- card_uploaded_at — a public visitor has no legitimate use for any
-- of those, same reasoning as before this migration.
--
-- The return row shape is changing (one new column), which Postgres
-- won't let `create or replace function` do in place — drop first.
drop function if exists public.team_directory();

create function public.team_directory()
returns table (
  display_name text,
  branch_id uuid,
  specialization_id uuid,
  batch_id uuid,
  year_number integer,
  current_term_id uuid,
  card_file_url text
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
    cr_current_term_id(cp.batch_id, cp.year_number, cp.specialization_id) as current_term_id,
    cp.card_file_url
  from cr_profiles cp
  order by cp.created_at asc;
$$;
revoke all on function public.team_directory() from public;
grant execute on function public.team_directory() to anon, authenticated;
