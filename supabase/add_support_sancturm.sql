-- Support Sancturm — full infrastructure, deployed DORMANT.
--
-- support_config.enabled starts false and upi_id/qr_url start null —
-- until an admin explicitly turns this on with real payment details,
-- nothing here is reachable by a student in any way that matters: the
-- UI only ever renders "Support isn't needed yet" while enabled is
-- false (see SupportSancturmModal.tsx), and every write path below is
-- independently gated by RLS regardless of what the UI shows.
--
-- Architecture note (read before touching payment status anywhere):
-- this project has NO Supabase service-role key in use anywhere else
-- in the codebase — every Server Action runs as the same `anon` /
-- `authenticated` Postgres role a browser would, with RLS as the only
-- real boundary (see src/lib/supabase/server.ts's own comment). A
-- genuine payment-provider webhook is a server-to-server call with no
-- user session and no admin cookie at all, so it structurally CANNOT
-- satisfy any RLS policy built on auth.uid() — there is no uid(). The
-- only correct way to let a verified webhook update a contribution's
-- status is a dedicated service-role client used ONLY by the webhook
-- route handler (src/app/api/support/webhook/route.ts), which bypasses
-- RLS entirely because Supabase's service role is designed to. That
-- key (SUPABASE_SERVICE_ROLE_KEY) is NOT set in this environment yet —
-- the webhook route will fail closed (throw, never silently accept)
-- until it is. See src/lib/supabase/admin.ts.

begin;

-- ============================================================
-- support_config — admin-controlled singleton, same boolean-PK
-- pattern as maintenance_config/subject_structure_config.
-- ============================================================
create table support_config (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  -- Public once shown (that's the entire point of a UPI ID/QR) — this
  -- is NOT where a payment provider's secret API key would ever live;
  -- those stay in server-only env vars, never this table. Kept null
  -- until an admin sets them.
  upi_id text,
  qr_url text,
  -- Whole rupees, smallest-first, admin-edited as a short list — a
  -- crafted 500-entry array is rejected by updateSupportConfig's own
  -- validation (src/features/support/actions.ts), not by the schema.
  suggested_amounts integer[] not null default '{49,99,199,499}',
  support_message text not null default 'Sancturm is currently running without needing contributions. When additional storage or operating costs become necessary, support will be activated here.',
  payment_instructions text not null default '',
  updated_by text,
  updated_at timestamptz not null default now()
);
insert into support_config (id) values (true);

alter table support_config enable row level security;

-- Public read — matches maintenance_config's own reasoning exactly:
-- every visitor's browser needs to know `enabled` (and, once it's
-- true, the public payment fields) with no auth required.
create policy "Public read" on support_config for select using (true);

create policy "Admin only updates" on support_config for update
  using (exists (select 1 from admins where auth_user_id = auth.uid()))
  with check (exists (select 1 from admins where auth_user_id = auth.uid()));

-- ============================================================
-- contributions — one row per attempted/completed contribution.
-- Students have no auth account anywhere in this app (see
-- src/lib/supabase/server.ts's own comment on this), so every
-- contribution is created by the anonymous `anon` role — the INSERT
-- policy below is the ONLY thing standing between "student reports
-- they paid" and "student marks their own payment successful", since
-- app-level checks in a Server Action can always be bypassed by
-- calling PostgREST directly with the same public anon key.
-- ============================================================
create table contributions (
  id uuid primary key default gen_random_uuid(),
  -- Whole rupees. Upper bound is deliberately generous-but-finite —
  -- rejects a crafted absurd amount, not a real generous contributor.
  amount integer not null check (amount > 0 and amount <= 100000),
  currency text not null default 'INR' check (currency = 'INR'),
  status text not null default 'pending'
    check (status in ('pending', 'successful', 'failed', 'cancelled', 'refunded')),
  -- Null until a real payment provider is wired up (or, for a manual
  -- UPI flow, until an admin verifies against their own bank/UPI
  -- statement) — see verifyContribution in actions.ts.
  provider text,
  provider_reference_id text,
  -- Self-reported UPI transaction reference, optional, set only at
  -- creation time (see the INSERT policy's `is null` requirements
  -- below for why there's no separate "attach it later" update path).
  utr text,
  is_anonymous boolean not null default true,
  display_name text,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  verified_by text
);

-- Prevents the exact "duplicate webhook/duplicate submission creates
-- two successful rows for the same real-world payment" failure mode —
-- a provider's payment/order id is unique by definition on their side,
-- so it must be unique here too. Partial (where clause) because most
-- rows never have one (manual/unverified contributions).
create unique index contributions_provider_reference_unique
  on contributions (provider, provider_reference_id)
  where provider_reference_id is not null;

alter table contributions enable row level security;

-- Anyone (anonymous students included) may create a contribution
-- report — but ONLY a fresh, unverified, pending one. Every field a
-- trusted verification step would ever set (status other than
-- pending, provider, provider_reference_id, verified_at, verified_by)
-- must be null/default at insert time — this is what makes "a student
-- marks their own payment successful" a schema-level impossibility,
-- not just something the UI doesn't offer.
create policy "Anyone reports a pending contribution" on contributions for insert
  with check (
    status = 'pending'
    and provider is null
    and provider_reference_id is null
    and verified_at is null
    and verified_by is null
  );

-- No public SELECT at all — deliberately. There's no student auth to
-- scope "their own" contribution to, and a `using (true)` policy would
-- let anyone enumerate/read every contributor's amount and status
-- (explicitly prohibited: "never expose private payment information
-- publicly", "no public donor leaderboard"). The tradeoff: an
-- anonymous donor can't self-poll their own contribution's status
-- after submitting — createContribution's caller keeps the returned
-- id in local state for the one thank-you screen, nothing more.
create policy "Admin reads all contributions" on contributions for select
  using (exists (select 1 from admins where auth_user_id = auth.uid()));

-- The only path that can ever move a contribution off `pending` — an
-- authenticated admin acting through verifyContribution, or the
-- webhook route's service-role client (which bypasses RLS entirely,
-- so this policy doesn't need to and structurally can't cover it).
create policy "Admin verifies contributions" on contributions for update
  using (exists (select 1 from admins where auth_user_id = auth.uid()))
  with check (exists (select 1 from admins where auth_user_id = auth.uid()));

-- ============================================================
-- payment_webhook_events — idempotency ledger for a future payment
-- provider's webhook calls. RLS enabled with ZERO policies (default
-- deny for anon/authenticated) is intentional and sufficient: the
-- webhook route is the only writer, and it uses the service-role
-- client, which bypasses RLS by design rather than needing a policy
-- to satisfy.
-- ============================================================
create table payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  received_at timestamptz not null default now(),
  processed boolean not null default false,
  contribution_id uuid references contributions(id)
);
create unique index payment_webhook_events_unique on payment_webhook_events (provider, event_id);

alter table payment_webhook_events enable row level security;

-- ============================================================
-- support_audit_log — who changed what, when. Admin-only to read;
-- written either by an admin action (INSERT policy below) or by the
-- webhook route's service-role client (bypasses RLS, same as above).
-- ============================================================
create table support_audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  actor text,
  detail jsonb,
  created_at timestamptz not null default now()
);

alter table support_audit_log enable row level security;

create policy "Admin reads audit log" on support_audit_log for select
  using (exists (select 1 from admins where auth_user_id = auth.uid()));

create policy "Admin writes audit log" on support_audit_log for insert
  with check (exists (select 1 from admins where auth_user_id = auth.uid()));

do $$
begin
  if (select count(*) from support_config) != 1 then
    raise exception 'expected exactly 1 support_config row, got %', (select count(*) from support_config);
  end if;
  if (select enabled from support_config) != false then
    raise exception 'support_config.enabled must start false';
  end if;
  if (select upi_id from support_config) is not null then
    raise exception 'support_config.upi_id must start null';
  end if;
end $$;

commit;
