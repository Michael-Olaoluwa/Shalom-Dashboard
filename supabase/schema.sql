-- =============================================================================
-- Shalom Celebrations Dashboard — database schema
--
-- Run this in the Supabase Dashboard:  SQL Editor -> New query -> Run
--
-- Safe to re-run: every statement is idempotent, and the upgrade block below
-- adds any columns added after the table was first created. Run it again after
-- pulling changes to the member fields.
--
-- Security model in one sentence:
--   `members` and `settings` are unreachable from the browser (RLS on, zero
--   policies). Every read and write goes through an Edge Function using the
--   service role key. The only thing the frontend may query directly is the
--   `public_celebrations` view, which contains no phone numbers and only
--   consented members.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper: how many days a month can have, ignoring the year.
-- We deliberately never store a birth year, so Feb 29 has to be accepted.
-- Feb 31 and Apr 31 must not be.
-- -----------------------------------------------------------------------------
create or replace function max_days_in_month(p_month int)
returns int
language sql
immutable
as $$
  select case
           when p_month = 2 then 29
           when p_month in (4, 6, 9, 11) then 30
           else 31
         end;
$$;

-- -----------------------------------------------------------------------------
-- members — full, sensitive data. Service role only.
-- -----------------------------------------------------------------------------
create table if not exists members (
  id                  uuid primary key default gen_random_uuid(),
  full_name           text not null,
  gender              text,
  phone               text,  -- WhatsApp number; named `phone` since that predates this field
  email               text,
  residential_address text,
  membership_category text,
  marital_status      text,
  occupation          text,
  church_department   text,
  birth_day           int  not null,
  birth_month         int  not null,
  anniversary_day     int,
  anniversary_month   int,
  consent_to_display  boolean not null default false,
  created_at          timestamptz not null default now(),

  constraint members_full_name_not_blank check (length(trim(full_name)) > 0),
  constraint members_birth_day_range       check (birth_day between 1 and 31),
  constraint members_birth_month_range     check (birth_month between 1 and 12),
  constraint members_birth_date_real       check (birth_day <= max_days_in_month(birth_month)),
  constraint members_anniv_day_range       check (anniversary_day between 1 and 31),
  constraint members_anniv_month_range     check (anniversary_month between 1 and 12),
  constraint members_anniv_date_real       check (anniversary_day <= max_days_in_month(anniversary_month)),

  -- The lists below mirror the options on the signup form. Nulls are allowed so
  -- older rows (and imports) that predate a field still save.
  constraint members_gender_valid check (
    gender is null or gender in ('Male', 'Female')
  ),
  constraint members_category_valid check (
    membership_category is null or membership_category in ('Children', 'Teenager', 'Youth', 'Adult')
  ),
  constraint members_marital_valid check (
    marital_status is null or marital_status in ('Married', 'Single', 'Widowed', 'Divorced', 'Separated')
  ),

  -- An anniversary is either fully specified or not specified at all. This
  -- stops a half-filled row from being saved and then never displaying.
  constraint members_anniversary_paired check (
    (anniversary_day is null     and anniversary_month is null) or
    (anniversary_day is not null and anniversary_month is not null)
  )
);

-- -----------------------------------------------------------------------------
-- Upgrade path for databases created before the fields above existed. Safe to
-- paste into the SQL Editor on its own, and a no-op once applied.
-- -----------------------------------------------------------------------------
alter table members
  add column if not exists gender              text,
  add column if not exists email               text,
  add column if not exists residential_address text,
  add column if not exists membership_category text,
  add column if not exists marital_status      text,
  add column if not exists occupation          text,
  add column if not exists church_department   text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'members_gender_valid') then
    alter table members add constraint members_gender_valid
      check (gender is null or gender in ('Male', 'Female'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'members_category_valid') then
    alter table members add constraint members_category_valid
      check (membership_category is null or membership_category in ('Children', 'Teenager', 'Youth', 'Adult'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'members_marital_valid') then
    alter table members add constraint members_marital_valid
      check (marital_status is null or marital_status in ('Married', 'Single', 'Widowed', 'Divorced', 'Separated'));
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- settings — the single admin code. Service role only.
-- -----------------------------------------------------------------------------
create table if not exists settings (
  id         int primary key default 1,
  admin_code text not null,
  constraint settings_single_row check (id = 1),
  constraint settings_code_min_length check (length(admin_code) >= 8)
);

insert into settings (id, admin_code) values (1, 'changeme123')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- code_attempts — brute-force protection for the shared admin code.
--
-- There are no user accounts and no 2FA, so the admin code is the only thing
-- standing between a stranger and the full member list. This table lets the
-- Edge Functions throttle repeated wrong guesses. It is written and read
-- only by the service role.
-- -----------------------------------------------------------------------------
create table if not exists code_attempts (
  id         bigint generated always as identity primary key,
  ip         text not null,
  ok         boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists code_attempts_ip_created_idx on code_attempts (ip, created_at desc);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- `members` is locked down completely. Enabling RLS with no policies at all
-- means the anon/authenticated roles match zero rows on every operation:
-- no select, no insert, no update, no delete. Only the service role key
-- (used exclusively inside Edge Functions) can touch it.
alter table members enable row level security;

-- Same for the admin code.
alter table settings enable row level security;

-- Same for the brute-force log.
alter table code_attempts enable row level security;

-- Belt and braces: revoke the defaults explicitly so this holds even if a
-- future Supabase default changes.
revoke all on members      from anon, authenticated;
revoke all on settings     from anon, authenticated;
revoke all on code_attempts from anon, authenticated;

-- -----------------------------------------------------------------------------
-- The one thing the public page is allowed to read.
--
-- Runs with the privileges of the view owner (postgres), which is what lets
-- it see `members` rows that RLS is hiding from anon. It selects no columns
-- beyond name + dates, and filters to consented members only.
-- -----------------------------------------------------------------------------
create or replace view public_celebrations as
  select
    id,
    full_name,
    birth_day,
    birth_month,
    anniversary_day,
    anniversary_month
  from members
  where consent_to_display = true;

-- security_invoker = false is the default for views, but stating it makes the
-- intent explicit to anyone reading this file later. The option only exists on
-- PostgreSQL 15+, so a failure here is not worth aborting the whole schema
-- over — the default is already what we want.
do $$
begin
  execute 'alter view public_celebrations set (security_invoker = false)';
exception
  when undefined_object then
    raise notice 'security_invoker is not available on this PostgreSQL version; the default (false) already applies.';
end
$$;

grant select on public_celebrations to anon, authenticated;

-- The view is a security boundary: nobody should be able to chain a
-- data-modifying statement through it.
revoke insert, update, delete, truncate on public_celebrations from anon, authenticated;
