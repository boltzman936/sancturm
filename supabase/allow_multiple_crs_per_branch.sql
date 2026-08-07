-- cr_profiles.branch_id was unique, meaning only one CR could ever
-- exist per branch. Each branch needs two (a boys' CR and a girls'
-- CR), so that constraint has to go — auth_user_id stays unique
-- (one person can't be a CR for two branches), but a branch can now
-- have more than one CR.
alter table cr_profiles drop constraint cr_profiles_branch_id_key;
