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

export type Program = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
};

export type Branch = {
  id: string;
  program_id: string;
  name: string;
  slug: string;
  sort_order: number;
  cr_user_id: string | null;
  cr_contact_email: string | null;
  cr_contact_whatsapp: string | null;
  created_at: string;
};

// A branch (AIML/Core/AIDS) doesn't carry year/semester itself — a
// term is the (year, sem) pair layered on top, and every branch's
// content is scoped to a specific (branch, term) pair once one
// exists. Right now each year maps to exactly one semester (1st Year
// -> Sem 1, 2nd Year -> Sem 3), so the UI only ever needs to ask
// "which year", never a separate semester question — but the schema
// supports adding a second term for the same year later without
// restructuring anything.
export type AcademicTerm = {
  id: string;
  year_number: number;
  semester_number: number;
  label: string;
  slug: string;
  sort_order: number;
  created_at: string;
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
  term_id: string;
  display_name: string;
  created_at: string;
};

export type Subject = {
  id: string;
  branch_id: string;
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
  term_id: string;
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
  term_id: string;
  title: string;
  // Exactly one of these is set — pdf_url for an uploaded PDF, body
  // for a notice typed directly in the custom composer.
  pdf_url: string | null;
  body: string | null;
  ai_summary: string | null;
  important_dates: ImportantDate[];
  is_pinned: boolean;
  created_at: string;
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
