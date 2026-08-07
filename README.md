# Sancturm

> One place. Every resource.

A Next.js 15 + TypeScript + Tailwind v4 + Supabase resource hub for a
college's CSE branches (CSE Core, CSE AIML, CSE AIDS) — notes, lab
manuals, previous year questions, notices, and platform-wide updates,
gated by a Row-Level-Security permission model (student / CR / admin).

## Where things stand

Live and connected to a real Supabase project. What's built:

- **Onboarding** — cinematic video intro, branch selection remembered via `localStorage`
- **Notes & Lab** — upload/browse/search/filter/pin, per-branch, student-submitted or CR/admin-direct-published
- **PYQs** — same as Notes & Lab but shared across every branch (not branch-locked)
- **Notices** — per-branch announcements, either an uploaded PDF or typed directly in-app, pinnable
- **Sancturm updates** — platform-wide announcements (admin-only), same dual upload/custom-text model
- **CR dashboard** ("Controller's dashboard" for admin) — pending approvals, direct upload, unified Manage view with bulk delete
- **Auth & roles** — Supabase Auth (email+password) for CR/admin; students never log in
- **Ownership page** — static profile/contact info, edited directly in `src/config/ownership.ts`

Permission model, in short: a CR can upload/manage only their own branch's Notes & Lab and Notices, plus PYQs in any branch (PYQ content is shared). Admin can do anything, anywhere, including Sancturm updates (CR has zero access there). All of this is enforced by Postgres Row Level Security, not application code — see `supabase/migrations/` and the numbered `.sql` files alongside it for the policy history.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project URL + anon key
npm run dev
```

Open http://localhost:3000

## Database

`supabase/migrations/0001_init.sql` has the base schema. Everything after
that — `add_admins.sql`, `restrict_cr_scope.sql`, `pyq_cross_branch.sql`,
`sanctum_updates_v2.sql`, `pinning.sql`, `notices_custom.sql`, etc. — is a
sequential migration applied by hand through the Supabase dashboard's SQL
Editor, in the order they were added. There's no migration runner; each
file is idempotent-ish (uses `drop policy if exists` etc.) but still
expects to run once, in order.

## Folder structure

See `src/features/README.md` for how the `features/` folder works —
that's the one worth understanding first, since it's the pattern
everything else follows.

## A few things worth knowing before you touch this

**`npm audit` may show a few high-severity warnings.** They're in
transitive `postcss`/`sharp` dependencies affecting the Next 15.x line,
not something a site visitor can exploit — build-time/image-optimization
issues. Worth revisiting before a production launch, not urgent day to day.

**No `Button` component / no shadcn primitives.** Every button in this
app is a plain `<button>` with hand-written Tailwind classes — that's the
established pattern, not an oversight. `src/components/ui/` only holds
the handful of Radix-based primitives actually in use (`dialog`, `command`).
