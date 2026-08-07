-- Lets a notice be either an uploaded PDF (pdf_url) or a typed-in-app
-- text notice (body) — the "custom creation tool". Exactly one of the
-- two is expected to be set per row; the check constraint enforces at
-- least one (never neither), the app enforces "not both".
alter table notices alter column pdf_url drop not null;
alter table notices add column body text;
alter table notices add constraint notices_content_check check (pdf_url is not null or body is not null);
