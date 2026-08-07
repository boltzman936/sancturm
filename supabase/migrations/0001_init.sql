-- Sancturm — initial schema
-- NOT YET APPLIED. This file is a plan, not a live change. It gets run
-- against your actual Supabase project during the "Connect Supabase"
-- milestone (either by pasting it into the SQL Editor in the Supabase
-- dashboard, or via `supabase db push` if you install the Supabase CLI).

create extension if not exists "pgcrypto"; -- gives us gen_random_uuid()


-- ============================================================
-- 1. THE HIERARCHY: programs -> branches -> academic_terms -> subjects
-- This is the part that lets Sancturm expand to new departments and
-- semesters later without any code changes — just new rows.
-- ============================================================

create table programs (
  id uuid primary key default gen_random_uuid(),
  name text not null,          -- e.g. "B.Tech Computer Science Engineering"
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table branches (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete cascade,
  name text not null,          -- e.g. "CSE AIML"
  slug text not null unique,   -- e.g. "cse-aiml" — matches the useBranch() hook's stored value
  cr_user_id uuid references auth.users(id) on delete set null,
  cr_contact_email text,
  cr_contact_whatsapp text,
  created_at timestamptz not null default now()
);

create table academic_terms (
  id uuid primary key default gen_random_uuid(),
  year_number int not null,       -- e.g. 2
  semester_number int not null,   -- e.g. 1
  label text not null,            -- e.g. "2nd Year - Semester 1"
  created_at timestamptz not null default now(),
  unique (year_number, semester_number)
);

create table subjects (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  term_id uuid not null references academic_terms(id) on delete cascade,
  name text not null,          -- e.g. "Data Structures & Algorithms"
  slug text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (branch_id, term_id, slug)
);


-- ============================================================
-- 2. CONTENT: one table covers Notes & Lab, PYQs, and Anurag Files
-- ============================================================

create table resources (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  subject_id uuid references subjects(id) on delete set null, -- nullable: Anurag Files aren't always subject-specific
  section text not null check (section in ('notes_lab', 'pyq', 'anurag_file')),
  resource_type text check (resource_type in ('notes', 'lab_manual', 'code', 'assignment', 'viva', 'record_file', 'pdf')),
  title text not null,
  description text,
  file_url text not null,      -- path in Supabase Storage
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  is_pinned boolean not null default false,  -- CR's official "pinned" flag (distinct from a student's local "bookmark")
  rating_avg numeric(3, 2) not null default 0,
  rating_count int not null default 0,
  download_count int not null default 0,
  view_count int not null default 0,
  uploaded_by_device text,     -- anonymous device id if a student submitted this; null if CR-uploaded
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table resource_ratings (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references resources(id) on delete cascade,
  device_id text not null,     -- anonymous id generated client-side, stored in localStorage
  rating int not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  unique (resource_id, device_id) -- one rating per device per resource
);

create table resource_reports (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references resources(id) on delete cascade,
  reason text not null,
  message text,
  status text not null default 'open' check (status in ('open', 'reviewed')),
  created_at timestamptz not null default now()
);


-- ============================================================
-- 3. BRANCH FEEDS: Class Updates, Notices, Sancturm Updates
-- ============================================================

create table class_updates (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  message text not null,
  posted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table notices (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  title text not null,
  pdf_url text not null,
  ai_summary text,                             -- filled in later, once that feature is built
  important_dates jsonb not null default '[]'::jsonb, -- [{ "label": "Mid-sem exam", "date": "2026-09-10" }]
  created_at timestamptz not null default now()
);

create table sanctum_updates (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);


-- ============================================================
-- 4. ADMIN: the entire role system is this one table
-- ============================================================

create table cr_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  branch_id uuid not null unique references branches(id) on delete cascade, -- one CR per branch
  display_name text not null,
  created_at timestamptz not null default now()
);


-- ============================================================
-- 5. COUNTER INCREMENTS
-- Downloads/views update this way (not read-modify-write from the
-- client) so two students clicking "download" at the same instant
-- don't overwrite each other's increment.
-- ============================================================

create or replace function increment_resource_counter(
  target_id uuid,
  column_name text,
  amount int default 1
)
returns void as $$
begin
  -- Only allow the two counters this function is meant for — stops
  -- this from being (mis)used to overwrite an arbitrary column.
  if column_name not in ('download_count', 'view_count') then
    raise exception 'invalid column_name: %', column_name;
  end if;

  execute format('update resources set %I = %I + $1 where id = $2', column_name, column_name)
  using amount, target_id;
end;
$$ language plpgsql security definer;


-- ============================================================
-- 6. ROW LEVEL SECURITY
-- One rule, repeated: everyone can READ; only the authenticated CR
-- of the matching branch_id can WRITE. This is the whole security
-- model — see the architecture milestone for why it's necessary.
-- ============================================================

alter table programs enable row level security;
alter table branches enable row level security;
alter table academic_terms enable row level security;
alter table subjects enable row level security;
alter table resources enable row level security;
alter table resource_ratings enable row level security;
alter table resource_reports enable row level security;
alter table class_updates enable row level security;
alter table notices enable row level security;
alter table sanctum_updates enable row level security;
alter table cr_profiles enable row level security;

-- Reference data — public read, no public write (seeded via the
-- Supabase dashboard directly; there's only ever a handful of rows).
create policy "Public read" on programs for select using (true);
create policy "Public read" on branches for select using (true);
create policy "Public read" on academic_terms for select using (true);
create policy "Public read" on cr_profiles for select using (true);

-- Subjects — public read, CR writes only within their own branch.
create policy "Public read" on subjects for select using (true);
create policy "CR manages own branch" on subjects for all
  using (branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid()))
  with check (branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid()));

-- Resources — public reads approved resources; a CR also sees their
-- own branch's pending/rejected items (to review them). Anyone can
-- submit an upload request (insert as 'pending'). Only the matching
-- CR can update (approve/reject/edit) or delete.
create policy "Public read approved" on resources for select
  using (
    status = 'approved'
    or branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid())
  );
create policy "Anyone can submit for review" on resources for insert
  with check (status = 'pending');
create policy "CR updates own branch" on resources for update
  using (branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid()))
  with check (branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid()));
create policy "CR deletes own branch" on resources for delete
  using (branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid()));

-- Ratings — public read/insert/update. NOTE: since there's no login,
-- device_id is self-reported by the browser, not cryptographically
-- verified. This is an accepted MVP tradeoff (matches "no complex
-- authentication") — worth revisiting only if rating manipulation
-- becomes an actual problem in practice.
create policy "Public read" on resource_ratings for select using (true);
create policy "Public insert" on resource_ratings for insert with check (true);
create policy "Public update own rating" on resource_ratings for update using (true) with check (true);

-- Reports — anyone can file one, only the relevant branch's CR can read/review them.
create policy "Anyone can report" on resource_reports for insert with check (true);
create policy "CR reads own branch reports" on resource_reports for select
  using (
    resource_id in (
      select id from resources
      where branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid())
    )
  );
create policy "CR reviews own branch reports" on resource_reports for update
  using (
    resource_id in (
      select id from resources
      where branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid())
    )
  );

-- Branch feeds — public read, CR writes only within their own branch.
create policy "Public read" on class_updates for select using (true);
create policy "CR manages own branch" on class_updates for all
  using (branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid()))
  with check (branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid()));

create policy "Public read" on notices for select using (true);
create policy "CR manages own branch" on notices for all
  using (branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid()))
  with check (branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid()));

create policy "Public read" on sanctum_updates for select using (true);
create policy "CR manages own branch" on sanctum_updates for all
  using (branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid()))
  with check (branch_id in (select branch_id from cr_profiles where auth_user_id = auth.uid()));
