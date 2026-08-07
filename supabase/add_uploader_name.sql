-- Tracks who (which CR or admin) published a resource directly.
-- Denormalized as plain text rather than a foreign key to admins/
-- cr_profiles, because a resource could have been uploaded by either
-- one — there's no single table to point a foreign key at. Storing
-- the name at upload time also means it stays accurate even if that
-- CR is later renamed or removed.
--
-- Students stay anonymous (uploaded_by_device only) — that's by
-- design, not a gap: there's no student login to attach a real name to.
alter table resources add column uploaded_by_name text;
