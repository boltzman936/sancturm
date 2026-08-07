-- The project is "Sancturm", not "Sanctum" — this was the one
-- remaining internal identifier still using the old name. Renaming a
-- table carries its policies, indexes, and constraints along
-- automatically; nothing else needs to be recreated.
alter table sanctum_updates rename to sancturm_updates;
