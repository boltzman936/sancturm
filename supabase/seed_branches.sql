-- Seed data matching the 3 branch slugs the app already uses
-- (Sidebar, BranchSwitcher, BranchSelectCard, useBranch hook).
-- Run this once, right after 0001_init.sql, in the Supabase SQL Editor.

insert into programs (name, slug)
values ('B.Tech Computer Science Engineering', 'btech-cse');

insert into branches (program_id, name, slug)
select id, 'CSE Core', 'cse-core' from programs where slug = 'btech-cse'
union all
select id, 'CSE AIML', 'cse-aiml' from programs where slug = 'btech-cse'
union all
select id, 'CSE AIDS', 'cse-aids' from programs where slug = 'btech-cse';

-- A couple of sample class updates so the feed isn't empty on first load.
insert into class_updates (branch_id, message)
select id, 'Welcome to Sancturm! This is where class-wide updates will show up.'
from branches where slug = 'cse-core'
union all
select id, 'Mid-sem seating arrangement has been posted on the notice board.'
from branches where slug = 'cse-core';
