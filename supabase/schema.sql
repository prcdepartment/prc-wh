-- ============================================================
-- Megawide WMS — Supabase schema (auth, profiles, warehouse data)
-- Run this in Supabase Studio → SQL Editor, then run seed_data.sql.
-- Idempotent: safe to re-run.
-- ============================================================

-- Roles enum
do $$ begin
  create type wms_role as enum ('admin','warehouse','procurement','site','management');
exception when duplicate_object then null; end $$;

-- ---------- profiles ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text unique,
  full_name    text,
  role         wms_role not null default 'warehouse',
  department   text,
  access_level text default 'Standard',
  status       text default 'Active',
  created_at   timestamptz default now()
);

alter table public.profiles enable row level security;

-- Everyone signed in can read profiles (needed for role display / user list).
drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read" on public.profiles
  for select using (auth.role() = 'authenticated');

-- A user can update their own profile; admins can update anyone.
-- NOTE: this policy deliberately does NOT let a user change their own `role`
-- — that is blocked by the trigger below, because a USING clause cannot see
-- which columns changed.
drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles
  for update using (
    auth.uid() = id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ---------- role-escalation guard ----------
-- Without this, "update your own profile" is enough to make yourself an admin.
create or replace function public.guard_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null for server-side work: the SQL Editor, migrations, seed
  -- scripts and anything using the service_role key. That work is already trusted,
  -- and it is the ONLY way to create the first admin — without this exemption the
  -- guard below is unbootstrappable. Anonymous browser clients never reach here:
  -- the profiles_self_update policy blocks them before the trigger runs.
  if auth.uid() is null then
    return new;
  end if;

  if new.role is distinct from old.role
     and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  then
    raise exception 'only an administrator may change a role';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_role_change();

-- ---------- helper: is the caller an admin? ----------
-- security definer so the policy can read profiles without recursing into its
-- own RLS check.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
$$;

-- ---------- auto-provision profile on signup ----------
-- Maps the seeded demo emails to their intended role automatically.
-- Any other email prefix defaults to 'warehouse' — promote real staff manually.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare mapped_role wms_role;
begin
  mapped_role := case split_part(new.email,'@',1)
    when 'admin' then 'admin'::wms_role
    when 'warehouse' then 'warehouse'::wms_role
    when 'procurement' then 'procurement'::wms_role
    when 'site' then 'site'::wms_role
    when 'management' then 'management'::wms_role
    else 'warehouse'::wms_role end;

  insert into public.profiles (id, email, full_name, role, department, access_level)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', initcap(split_part(new.email,'@',1))),
    mapped_role,
    coalesce(new.raw_user_meta_data->>'department','—'),
    coalesce(new.raw_user_meta_data->>'access_level','Standard')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================
-- REFERENCE DATA — seeded from the source workbooks by seed_data.sql
-- ============================================================

-- Trade taxonomy: L1 (trade) → L2 (item group).
create table if not exists public.trades (
  l1 text not null,
  l2 text not null,
  sort_order int default 0,
  primary key (l1, l2)
);

create table if not exists public.projects (
  code text primary key,
  name text not null
);

-- ---------- item master ----------
-- The company-wide SAP item catalogue (7,378 codes), used by the Add Material and
-- Safekeeping Request lookups. Fetched on demand by src/components/ItemLookup.jsx
-- rather than at startup — it is only needed once a form that uses it opens.
create table if not exists public.item_master (
  code          text primary key,
  description   text,
  trade_l1      text,
  item_group    text,
  material_type text,
  uom           text
);

-- ---------- inventory (Central Warehouse stock on hand) ----------
-- One row per line item from the CW SOH sheet. item_code is NOT unique: the
-- same SAP code appears on several lines with different 2nd descriptions.
create table if not exists public.inventory (
  id                   int primary key,
  item_code            text not null,
  description          text,
  detailed_description text,
  trade_l1             text,
  trade_l2             text,
  material_type        text,
  uom                  text,
  total_qty            numeric not null default 0,
  beginning_qty        numeric not null default 0,
  period_in            numeric not null default 0,
  period_out           numeric not null default 0,
  available_qty        numeric not null default 0,
  reserved_qty         numeric not null default 0,
  incoming_qty         numeric not null default 0,
  outgoing_qty         numeric not null default 0,
  damaged_qty          numeric not null default 0,
  min_level            numeric not null default 0,
  issue_frequency      numeric not null default 0,
  last_movement_offset int not null default 0,
  unit_price           numeric not null default 0,
  discounted_price     numeric not null default 0,
  inventory_value      numeric not null default 0,
  condition_class      text,
  brand                text,
  model                text,
  -- Storage location as RECORDED by the warehouse, from the snapshot workbook's
  -- "Item per location bin" sheet: 'AREA-Rn-LL-BBB' (area, rack, beam level, bay).
  -- Empty where the warehouse has not placed the line. zone/rack/shelf/bin are the
  -- same address split into its parts. bin_count is how many bays the line occupies;
  -- `location` names the first of them.
  location text,
  bin_count int not null default 0,
  zone text, rack text, shelf text, bin text,
  updated_at           timestamptz default now()
);
create index if not exists inventory_item_code_idx on public.inventory (item_code);
create index if not exists inventory_trade_idx on public.inventory (trade_l1, trade_l2);

-- ---------- movement ledger (real CW Incoming / CW Outgoing sheets) ----------
-- `day_offset` is days before the dataset's TODAY, matching the app's date model.
create table if not exists public.ledger (
  id         bigint generated always as identity primary key,
  direction  text not null check (direction in ('in','out')),
  day_offset int not null,
  -- Nullable, like every other movement table here. The warehouse books some
  -- project-to-warehouse transfers against a description with no item code at all
  -- (13 of 295 rows in the 2026-09-07 snapshot). Recording the movement without a
  -- code is honest; dropping the row would understate receipts and inventing a code
  -- would mis-join to item_master. Only `inventory` keeps `not null` on this column,
  -- correctly — a stock line with no code cannot be identified.
  item_code  text,
  description text,
  qty        numeric not null default 0,
  uom        text,
  project    text,
  doc_ref    text,
  class      text,
  condition  text
);
create index if not exists ledger_item_code_idx on public.ledger (item_code);

-- ---------- safekeeping sheets ----------
create table if not exists public.safekeeping_soh (
  id                   int primary key,
  ref_code             text,
  project              text,
  project_code         text,
  trade                text,
  trade_l1             text,
  item_group           text,
  item_code            text,
  description          text,
  detailed_description text,
  uom                  text,
  boh numeric default 0, qty_in numeric default 0, qty_out numeric default 0, soh numeric default 0,
  unit_price numeric default 0,
  class text,
  remarks text
);

create table if not exists public.safekeeping_incoming (
  id                   int primary key,
  project              text,
  project_code         text,
  doc_date             date,
  doc_ref              text,
  category             text,
  item_code            text,
  description          text,
  detailed_description text,
  uom                  text,
  qty                  numeric default 0,
  class                text,
  condition            text,
  remarks              text
);

create table if not exists public.safekeeping_outgoing (
  id                   int primary key,
  project              text,
  project_code         text,
  doc_date             date,
  doc_ref              text,
  category             text,
  item_code            text,
  description          text,
  detailed_description text,
  uom                  text,
  qty                  numeric default 0,
  class                text,
  condition            text,
  remarks              text
);

-- ---------- delivery tracker sheet ----------
create table if not exists public.delivery_tracker (
  no           int primary key,
  category     text,
  item         text,
  project      text,
  batch        text,
  designation  text,   -- line item model / handing: PHD-002, W-02A, "Left", "Right Swing"
  description2 text,   -- source 2ND DESCRIPTION, qualifying the designation
  qty          text,   -- free text on the sheet: "TBC", "120 + 40", …
  uom          text,
  target_date  date,
  target_text  text,
  location     text,
  warehouse    text,
  status       text,
  ops_remarks  text,
  dp_payment   text,
  prc_remarks  text
);

-- ---------- project warehouse audit (Audit Report Data Source workbook) ----------
-- Three tables because they are three different grains, joined only by the audit they
-- belong to (a date + a project), which is why that pair is indexed on all three:
--   audit_ratings   one of five weighted inspection criteria scored on one audit
--   audit_findings  one defect raised by one audit, with its status and action plan
--   audit_counts    one item counted during one audit's inventory cycle count
-- See supabase/migrations/2026-09-21_audit_report.sql for the column-level reasoning
-- and scripts/import-audit-report.mjs for how the workbook is read.

-- weight is the criterion's share of the 100% score (0.40 / 0.10 / 0.15 / 0.20 / 0.15);
-- rating is the score EARNED against it, so an audit's overall rating is the plain sum
-- of its five ratings and can never exceed 1.0.
create table if not exists public.audit_ratings (
  id           int primary key,
  audit_date   date,
  project      text,
  criteria_num int,
  criteria     text,
  weight       numeric default 0,
  rating       numeric default 0
);
create index if not exists audit_ratings_audit_idx on public.audit_ratings (audit_date, project);

-- project_type is nullable and genuinely absent on part of the source (11 of 70
-- audits). It is a property of the AUDIT and this is the only table carrying it;
-- src/data/audit.js rebuilds the date+project -> type map from here and applies it to
-- the ratings, which is what the Power BI model's relationship does.
create table if not exists public.audit_findings (
  id             int primary key,
  audit_date     date,
  project_type   text,
  project        text,
  criteria       text,
  classification text,   -- 'Compliant' means "checked, nothing wrong" — kept, excluded per-visual
  finding        text,
  root_cause     text,
  action_plan    text,
  timeline       date,
  close_date     date,
  status         text
);
create index if not exists audit_findings_audit_idx on public.audit_findings (audit_date, project);
create index if not exists audit_findings_status_idx on public.audit_findings (status);

-- hit_miss is the auditor's own per-line verdict, stored rather than derived from
-- variance so the app never disagrees with the signed count sheet. variance_value is
-- the line's ABSOLUTE peso exposure (positive on all 3,244 source rows).
create table if not exists public.audit_counts (
  id             int primary key,
  audit_date     date,
  project        text,
  asset_type     text,
  item_code      text,
  description    text,
  uom            text,
  unit_cost      numeric default 0,
  system_qty     numeric default 0,
  actual_qty     numeric default 0,
  system_value   numeric default 0,
  actual_value   numeric default 0,
  variance_value numeric default 0,
  variance       numeric default 0,
  accuracy       numeric default 0,
  hit_miss       text,
  variance_type  text
);
create index if not exists audit_counts_audit_idx on public.audit_counts (audit_date, project);


-- ============================================================
-- TRANSACTIONAL TABLES — created EMPTY. Every row from here on is a real
-- record created by a real user through the app.
-- ============================================================

create table if not exists public.movements (
  id          bigint generated always as identity primary key,
  item_id     int references public.inventory(id),
  item_code   text,
  description text,
  type        text check (type in ('Incoming','Outgoing','Return','Adjustment')),
  qty         numeric not null default 0,
  uom         text,
  project     text,
  doc_ref     text,
  status      text not null default 'Pending Approval',
  moved_at    timestamptz default now(),
  created_by  uuid references auth.users(id) default auth.uid(),
  created_by_email text default (auth.jwt() ->> 'email'),
  created_at  timestamptz default now()
);

create table if not exists public.reservations (
  id            bigint generated always as identity primary key,
  item_id       int references public.inventory(id),
  item_code     text,
  description   text,
  qty           numeric not null default 0,
  uom           text,
  project       text,
  required_date date,
  status        text not null default 'Reserved',
  created_by    uuid references auth.users(id) default auth.uid(),
  created_by_email text default (auth.jwt() ->> 'email'),
  created_at    timestamptz default now()
);

create table if not exists public.purchase_requests (
  id          bigint generated always as identity primary key,
  item_id     int references public.inventory(id),
  item_code   text,
  description text,
  qty_needed  numeric not null default 0,
  uom         text,
  reason      text,
  est_cost    numeric default 0,
  status      text not null default 'Draft',
  created_by  uuid references auth.users(id) default auth.uid(),
  created_by_email text default (auth.jwt() ->> 'email'),
  created_at  timestamptz default now()
);

create table if not exists public.material_requests (
  id            bigint generated always as identity primary key,
  item_id       int references public.inventory(id),
  item_code     text,
  description   text,
  qty           numeric not null default 0,
  uom           text,
  project       text,
  purpose       text,
  required_date date,
  status        text not null default 'Submitted',
  created_by    uuid references auth.users(id) default auth.uid(),
  created_by_email text default (auth.jwt() ->> 'email'),
  created_at    timestamptz default now()
);

create table if not exists public.approvals (
  id           bigint generated always as identity primary key,
  type         text,
  category     text,
  subject      text,
  item_id      int references public.inventory(id),
  project      text,
  requested_by text,
  status       text not null default 'Pending',
  decided_by   uuid references auth.users(id),
  decided_at   timestamptz,
  created_at   timestamptz default now()
);

-- Safekeeping requests submitted through "+ New Transaction". Previously held
-- in React state (src/context/SafekeepingContext.jsx) and lost on refresh.
create table if not exists public.safekeeping_requests (
  id            bigint generated always as identity primary key,
  srn           text unique not null,
  project       text,
  project_code  text,
  requested_by  text,
  request_date  date,
  status        text not null default 'Submitted',
  payload       jsonb not null default '{}'::jsonb,  -- packing lists / line items
  created_by    uuid references auth.users(id) default auth.uid(),
  created_by_email text default (auth.jwt() ->> 'email'),
  created_at    timestamptz default now()
);

create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  user_email text,
  action     text not null,
  detail     text,
  created_at timestamptz default now()
);


-- ============================================================
-- ROW LEVEL SECURITY
-- Reference/source data: every signed-in user reads; ONLY ADMINS write.
-- Transactional data:    every signed-in user reads and creates their own rows;
--                        only admins may update or delete.
-- ============================================================

do $$
declare
  t text;
  reference_tables text[] := array[
    'trades','projects','item_master','inventory','ledger',
    'safekeeping_soh','safekeeping_incoming','safekeeping_outgoing','delivery_tracker',
    'audit_ratings','audit_findings','audit_counts'
  ];
  transactional_tables text[] := array[
    'movements','reservations','purchase_requests','material_requests',
    'approvals','safekeeping_requests','audit_log'
  ];
begin
  foreach t in array reference_tables loop
    execute format('alter table public.%I enable row level security;', t);

    execute format('drop policy if exists "%1$s_read" on public.%1$s;', t);
    execute format(
      'create policy "%1$s_read" on public.%1$s for select using (auth.role() = ''authenticated'');', t);

    -- Admin-only writes (chosen 2026-08-16). To let warehouse staff write
    -- inventory too, change is_admin() below to a role in (...) check.
    execute format('drop policy if exists "%1$s_write" on public.%1$s;', t);
    execute format(
      'create policy "%1$s_write" on public.%1$s for all using (public.is_admin()) with check (public.is_admin());', t);
  end loop;

  foreach t in array transactional_tables loop
    execute format('alter table public.%I enable row level security;', t);

    execute format('drop policy if exists "%1$s_read" on public.%1$s;', t);
    execute format(
      'create policy "%1$s_read" on public.%1$s for select using (auth.role() = ''authenticated'');', t);

    execute format('drop policy if exists "%1$s_insert" on public.%1$s;', t);
    execute format(
      'create policy "%1$s_insert" on public.%1$s for insert with check (auth.role() = ''authenticated'');', t);

    execute format('drop policy if exists "%1$s_admin" on public.%1$s;', t);
    execute format(
      'create policy "%1$s_admin" on public.%1$s for all using (public.is_admin()) with check (public.is_admin());', t);
  end loop;
end $$;

-- The audit log must not be rewritable, even by an admin — an audit trail you
-- can edit is not an audit trail. Insert + read only.
drop policy if exists "audit_log_admin" on public.audit_log;


-- ============================================================
-- CATCH-UP: every column change a migration has ever made.
--
-- WHY THIS BLOCK EXISTS. Everything above is `create table if not exists`, which is
-- idempotent in the sense that re-running it cannot destroy anything — but NOT in the
-- sense that it brings an older database up to date. A table that already exists is
-- skipped entirely, columns and all, so a database created before a migration added a
-- column silently stays without it. Re-running schema.sql looked like it had worked.
--
-- That cost a seed run on 2026-09-21: the delivery_tracker columns added on 2026-09-10
-- had never been applied to the live project, and part 04 of the seed died on
-- `column "designation" of relation "delivery_tracker" does not exist` — taking the
-- audit_ratings insert in the same file down with it.
--
-- So every migration's column change is replayed here, idempotently, in the order it
-- was made. The rule this buys: **whatever the schema error, re-run schema.sql**. It is
-- now genuinely the whole schema, not just the parts that happened to be created first.
-- The files in supabase/migrations/ stay as the dated record of WHY each change was
-- made; this block is only the WHAT, so a fresh paste of schema.sql always lands on the
-- current shape.
--
-- Adding a column from here on means TWO edits: the create-table above (for a brand new
-- database) and one line here (for every database that already exists).
-- ============================================================

-- 2026-09-02 — inventory: warehouse location and bin count from the floor plan.
alter table public.inventory add column if not exists location text;
alter table public.inventory add column if not exists bin_count int not null default 0;

-- 2026-09-07 — ledger: item_code nullable. The warehouse books some project-to-warehouse
-- transfers against a description with no item code at all (13 of 295 rows in the
-- 2026-09-07 snapshot); recording the movement without a code is honest, dropping the
-- row would understate receipts. `drop not null` on an already-nullable column is a
-- no-op, so this is safe to re-run.
alter table public.ledger alter column item_code drop not null;

-- 2026-09-10 — delivery_tracker: the line-item detail the hierarchical workbook carries.
alter table public.delivery_tracker add column if not exists designation text;
alter table public.delivery_tracker add column if not exists description2 text;
