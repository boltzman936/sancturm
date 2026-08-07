-- Ordering branches by name alphabetically (AIDS, AIML, Core) doesn't
-- match the order the app has always shown them in (AIML, Core, AIDS)
-- everywhere else. A dedicated sort_order column makes that ordering
-- explicit and controllable — including for whatever branch gets
-- added next — instead of accidentally tied to name spelling.
alter table branches add column if not exists sort_order integer not null default 0;

update branches set sort_order = 1 where slug = 'cse-aiml';
update branches set sort_order = 2 where slug = 'cse-core';
update branches set sort_order = 3 where slug = 'cse-aids';
