-- Reverses drop_dead_specialization_contact_columns.sql. Every row's
-- values were NULL before the drop (confirmed live), so recreating the
-- columns as nullable with no backfill needed is a full, safe reversal.

begin;

alter table specializations
  add column if not exists cr_user_id uuid references auth.users(id) on delete set null,
  add column if not exists cr_contact_email text,
  add column if not exists cr_contact_whatsapp text;

commit;
