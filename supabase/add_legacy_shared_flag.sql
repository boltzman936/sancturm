-- Fixes the resource-sharing bug: the read-time cross-context sharing
-- (Civil/Mechanical/Automation & Robotics's mirrored 1st Year content,
-- and CSE Core/AIML/AIDS's own Sem 2 self-swap — both draw from CSE's
-- 1st-Year Sem 1 Core/AIML/AIDS scope, see sharedResourceScopes.ts)
-- was a LIVE query with no distinction between pre-existing content
-- and brand-new uploads — every new upload into that scope
-- automatically fanned out to every mapped context, which is wrong:
-- only content that existed before this sharing system was introduced
-- should be shared; anything uploaded from now on belongs only to its
-- exact upload context.
--
-- This adds an explicit, permanent marker (not a live query
-- assumption) distinguishing the two, and does a ONE-TIME backfill —
-- not an ongoing rule — over exactly the resources that already
-- existed in that scope before this fix.

begin;

alter table resources add column legacy_shared boolean not null default false;

-- Backfill cutoff: a fixed, explicit timestamp (2026-08-17T00:00:00Z),
-- not now(). Verified directly against the live data: every resource
-- in this scope was inserted on or before 2026-08-16 EXCEPT two rows
-- ("civil 3rd sem", "mechanical 3rd sem") inserted on 2026-08-17,
-- created solely to probe this exact bug — those two must NOT be
-- grandfathered in, or the fix could never be demonstrated as working.
-- Uses `updated_at`, not `created_at` — created_at is overridable by
-- the uploader's own custom-date field (see uploadResourceDirect's
-- customCreatedAt), so it cannot be trusted as "when this row was
-- really inserted"; updated_at is never touched by any app code path
-- (confirmed: no trigger, and updateResourceFields never sets it), so
-- it reflects the true, unspoofable insertion time.
update resources
set legacy_shared = true
where branch_id = (select id from branches where slug = 'cse')
  and specialization_id in (
    select id from specializations
    where branch_id = (select id from branches where slug = 'cse')
      and name in ('CSE Core', 'CSE AIML', 'CSE AIDS')
  )
  and term_id = (select id from academic_terms where slug = 'y1-s1')
  and updated_at < '2026-08-17T00:00:00Z';

commit;
