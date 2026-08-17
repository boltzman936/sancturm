-- Security hardening: specializations.cr_user_id / cr_contact_email /
-- cr_contact_whatsapp are dead columns from the original (pre-rename)
-- branches table (see migrations/0001_init.sql) — never written by any
-- app code path (grep confirms zero references outside the type
-- declaration and this table's own definition), currently NULL on
-- every row, and readable by ANYONE via the table's "Public read using
-- (true)" policy plus the app's own `select("*")` calls
-- (src/features/branches/queries.ts). CR contact info is already
-- correctly surfaced, publicly, through the narrow team_directory()
-- RPC instead (see src/features/team/queries.ts) — these raw columns
-- were never that mechanism, just leftover PII-shaped surface area
-- with no code ever populating or reading them. Dropping them removes
-- the exposure permanently, rather than relying on every future
-- `select()` call to remember to exclude them.

begin;

alter table specializations
  drop column if exists cr_user_id,
  drop column if exists cr_contact_email,
  drop column if exists cr_contact_whatsapp;

commit;
