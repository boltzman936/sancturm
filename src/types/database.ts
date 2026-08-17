/**
 * PLACEHOLDER — hand-written to match supabase/migrations/0001_init.sql.
 *
 * Once the real Supabase project exists (Connect Supabase milestone),
 * replace this entire file by running:
 *
 *   npx supabase gen types typescript --project-id <your-project-id> > src/types/database.ts
 *
 * That command reads your ACTUAL live schema and generates exact types —
 * do that instead of hand-editing this file once it's available, so
 * types can never silently drift from the real database.
 */

// Never surfaced anywhere in the UI (exactly one department exists:
// "Engineering") — exists so the schema is honest about the real
// hierarchy, not because any screen needs to ask about it.
export type Department = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  created_at: string;
};

// Also never surfaced in the UI (exactly one degree: "B.Tech") — was
// called `programs` before the branch-expansion migration, when it
// conflated degree+branch into one row ("B.Tech Computer Science
// Engineering"). Now Branch is its own dimension below this.
export type Degree = {
  id: string;
  department_id: string;
  name: string;
  slug: string;
  created_at: string;
};

// A real engineering branch (CSE, Civil, Mechanical, ...) — the
// Cockpit's 2nd onboarding step. has_specializations gates whether the
// Specialization step is shown at all (true for CSE, false for every
// branch without a specialization concept).
export type Branch = {
  id: string;
  degree_id: string;
  name: string;
  slug: string;
  has_specializations: boolean;
  sort_order: number;
  created_at: string;
};

// A sub-choice within a branch — today, exclusively CSE's four
// specializations (Core/AIML/AIDS/Cyber Security). Was literally the
// `branches` table before the branch-expansion migration; renamed
// once a real Branch layer was introduced above it, so every existing
// id/row is unchanged — only the table name and its new branch_id FK
// are new. Branches with has_specializations=false have zero rows
// here.
export type Specialization = {
  id: string;
  branch_id: string;
  name: string;
  slug: string;
  sort_order: number;
  cr_user_id: string | null;
  cr_contact_email: string | null;
  cr_contact_whatsapp: string | null;
  created_at: string;
};

// A branch doesn't carry year/semester itself — a term is the (year,
// sem) pair layered on top, and every branch's content is scoped to a
// specific (branch, term) pair once one exists. Currently 1st Year
// (Sem 1-2) and 2nd Year (Sem 3-4) exist as academic_terms rows
// (global — shared by every branch, not branch-specific), each gated
// by real calendar dates in batch_terms.
export type AcademicTerm = {
  id: string;
  year_number: number;
  semester_number: number;
  label: string;
  slug: string;
  sort_order: number;
  created_at: string;
};

// Cohort identity (e.g. "2025-26") — deliberately NOT tied to one
// year_number, since the same batch is in 1st Year today and 2nd Year
// a year from now as the cohort progresses. See batch_terms below for
// which (batch, term) combinations actually exist and their real dates.
export type Batch = {
  id: string;
  label: string;
  start_year: number;
  sort_order: number;
  created_at: string;
};

// Which (batch, curriculum-slot) combinations are valid/live, plus the
// real calendar dates for each — e.g. (batch "2025-26", term "1st Year
// Sem 1") ran 1 Aug 2025 - 30 Dec 2025. This is what lets a future
// batch/semester be added as pure data (one batches row + N of these),
// and what a dependent filter ("this batch only offers these
// semesters") is driven by instead of hardcoded logic.
export type BatchTerm = {
  id: string;
  batch_id: string;
  term_id: string;
  start_date: string; // yyyy-mm-dd
  end_date: string; // yyyy-mm-dd
};

export type Admin = {
  id: string;
  auth_user_id: string;
  display_name: string;
  created_at: string;
};

export type CrProfile = {
  id: string;
  auth_user_id: string;
  branch_id: string;
  // Nullable — a CR scoped to a branch with no specialization concept
  // (anything but CSE) has none. A CSE CR always has one.
  specialization_id: string | null;
  // A CR's permanent scope — deliberately NOT a term_id. Which
  // semester that resolves to right now is computed on every read via
  // the cr_current_term_id() Postgres function (see
  // supabase/cr_dynamic_semester.sql), never stored here, so it
  // advances on its own the moment a new semester starts.
  year_number: number;
  batch_id: string;
  display_name: string;
  created_at: string;
};

// The public, safe-subset shape team_directory() (a security-definer
// Postgres function — see cr_dynamic_semester.sql) returns. Deliberately
// NOT CrProfile — no id, no auth_user_id, no created_at; this is what's
// allowed to reach an unauthenticated visitor, which is a strictly
// smaller set of fields than the table itself has.
export type TeamDirectoryEntry = {
  display_name: string;
  branch_id: string;
  specialization_id: string | null;
  batch_id: string;
  year_number: number;
  current_term_id: string;
};

// Singleton config row (id is always `true` — the boolean-PK trick
// that makes a second row physically impossible) controlling whether
// 1st-Year Sem 2's subject structure is currently interchanged — see
// src/features/resources/subjectInterchange.ts for what that means.
export type SubjectStructureConfig = {
  id: true;
  interchange_active: boolean;
  updated_by: string | null;
  updated_at: string;
};

// Same singleton pattern — `until` is the sole source of truth for
// whether maintenance is active (null = not in maintenance).
export type MaintenanceConfig = {
  id: true;
  until: string | null;
  message: string | null;
  updated_by: string | null;
  updated_at: string;
};

export type Subject = {
  id: string;
  branch_id: string;
  // Nullable — CSE's subjects are per-specialization; every other
  // branch's are scoped by branch alone.
  specialization_id: string | null;
  term_id: string;
  name: string;
  slug: string;
  sort_order: number;
  created_at: string;
};

// The database's own CHECK constraint (supabase/migrations/0001_init.sql)
// still allows 'anurag_file' as a legacy value — deliberately narrower
// here since the Anurag Files feature was removed from the app.
export type ResourceSection = "notes_lab" | "pyq";
export type ResourceType =
  | "notes"
  | "lab_manual"
  | "code"
  | "assignment"
  | "viva"
  | "record_file"
  | "pdf"
  // The PYQ equivalent of notes/lab_manual — one section ("pyq"), two
  // kinds: the question paper itself, and a worked solution to it.
  | "pyq"
  | "pyq_solution";
export type ResourceStatus = "pending" | "approved" | "rejected";

export type Resource = {
  id: string;
  branch_id: string;
  specialization_id: string | null;
  term_id: string;
  batch_id: string;
  subject_id: string | null;
  section: ResourceSection;
  resource_type: ResourceType | null;
  title: string;
  description: string | null;
  file_url: string;
  status: ResourceStatus;
  is_pinned: boolean;
  rating_avg: number;
  rating_count: number;
  download_count: number;
  view_count: number;
  uploaded_by_device: string | null;
  uploaded_by_name: string | null;
  // One-time backfilled marker (see supabase/add_legacy_shared_flag.sql)
  // — true only for resources that existed before cross-context
  // resource sharing was introduced (see sharedResourceScopes.ts).
  // Every new upload defaults to false via the column default and
  // stays visible ONLY in its own exact upload context; this is never
  // set true by application code, only by that one migration.
  legacy_shared: boolean;
  created_at: string;
  updated_at: string;
};

export type ImportantDate = {
  label: string;
  date: string; // yyyy-mm-dd
};

export type Notice = {
  id: string;
  branch_id: string;
  specialization_id: string | null;
  term_id: string;
  batch_id: string;
  // Visible only to signed-in CR/admin when true — RLS-enforced (see
  // supabase/add_notice_cr_only.sql), not just hidden by the UI.
  // Admin-only to set (see notices/actions.ts).
  cr_only: boolean;
  title: string;
  // Exactly one of these is set — pdf_url for an uploaded PDF, body
  // for a notice typed directly in the custom composer.
  pdf_url: string | null;
  body: string | null;
  ai_summary: string | null;
  important_dates: ImportantDate[];
  is_pinned: boolean;
  created_at: string;
  // Server-set only (see notices/actions.ts) — null for every notice
  // created before this column existed. Used to stop a CR from
  // editing/deleting a notice an admin created (supabase/
  // protect_admin_uploads_from_cr.sql); never shown in the UI.
  uploaded_by_name: string | null;
};

// Platform-wide announcements about Sancturm itself — not scoped to
// any branch. Admin-only, both to write (RLS) and to see the small
// inline remove control (the app hides it from everyone else).
export type SancturmUpdate = {
  id: string;
  title: string;
  // Exactly one of these is set — same dual-mode shape as Notice.
  pdf_url: string | null;
  body: string | null;
  is_pinned: boolean;
  created_at: string;
};

// Singleton config row, same boolean-PK pattern as MaintenanceConfig.
// enabled=false (with upi_id/qr_url null) is the deployed default —
// see supabase/add_support_sancturm.sql for why that's the only state
// that ever reaches a real student while this feature is dormant.
export type SupportConfig = {
  id: true;
  enabled: boolean;
  upi_id: string | null;
  qr_url: string | null;
  suggested_amounts: number[];
  support_message: string;
  payment_instructions: string;
  updated_by: string | null;
  updated_at: string;
};

export type ContributionStatus = "pending" | "successful" | "failed" | "cancelled" | "refunded";

export type Contribution = {
  id: string;
  amount: number;
  currency: "INR";
  status: ContributionStatus;
  provider: string | null;
  provider_reference_id: string | null;
  utr: string | null;
  is_anonymous: boolean;
  display_name: string | null;
  created_at: string;
  verified_at: string | null;
  verified_by: string | null;
};
