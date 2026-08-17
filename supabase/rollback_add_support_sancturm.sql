-- Exact reverse of add_support_sancturm.sql, in reverse dependency
-- order. Safe at any point after that migration (nothing in this
-- feature is referenced by any other table).

begin;

drop table if exists support_audit_log;
drop table if exists payment_webhook_events;
drop table if exists contributions;
drop table if exists support_config;

commit;
