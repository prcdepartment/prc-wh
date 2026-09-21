-- Project Warehouse Audit: the three tables behind the Dashboard -> Audit tab.
--
-- Source: sample/Audit Report Data Source.xlsx, the workbook behind the Power BI report
-- "MCC. PRC. WM. Project Warehouse Audit Report. 2026.pbix". Loaded by
-- scripts/import-audit-report.mjs, which documents the reading rules.
--
-- These are REFERENCE tables — read by every signed-in user, written only by admins —
-- and the do-block at the foot of schema.sql now lists them, so re-running schema.sql
-- applies the same RLS policies every other seeded table gets. Run this migration
-- BEFORE re-pasting the seed files.
--
-- WHY THREE TABLES AND NOT ONE. They are three different grains and nothing joins them
-- row to row: a rating is one of five scores for one audit, a finding is one defect
-- raised by one audit, and a count line is one item counted during one audit. The only
-- thing they share is the audit itself — a date and a project — which is why that pair
-- is indexed on all three.

-- ---------- the scorecard: 5 weighted inspection criteria per audit ----------
-- weight is the criterion's share of the 100% score (0.40 / 0.10 / 0.15 / 0.20 / 0.15);
-- rating is the score EARNED against that weight, so an audit's overall rating is the
-- plain sum of its five ratings and can never exceed 1.0.
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

-- ---------- every finding raised, with its status ----------
-- project_type ('Vertical' / 'Horizontal') is nullable and genuinely absent on part of
-- the source: 11 of the 70 audits carry none. It is a property of the AUDIT, not of the
-- finding, and this is the only table that records it — src/data/audit.js rebuilds the
-- date+project -> type map from here and applies it to the ratings, which is exactly
-- what the Power BI model's relationship does.
--
-- classification 'Compliant' is not a defect: it records that a criterion was checked
-- and nothing was wrong (91 of 592 rows). It is kept, and excluded per-visual.
create table if not exists public.audit_findings (
  id             int primary key,
  audit_date     date,
  project_type   text,
  project        text,
  criteria       text,
  classification text,
  finding        text,
  root_cause     text,
  action_plan    text,
  timeline       date,
  close_date     date,
  status         text
);
create index if not exists audit_findings_audit_idx on public.audit_findings (audit_date, project);
create index if not exists audit_findings_status_idx on public.audit_findings (status);

-- ---------- inventory cycle count lines ----------
-- hit_miss is the auditor's own verdict per line and is what the accuracy percentage is
-- built from; it is stored rather than derived from variance so the app never disagrees
-- with the signed count sheet.
--
-- variance_value is the line's ABSOLUTE peso exposure — positive on all 3,244 source
-- rows, shorts included — which is why the "Financial Impact" bars are all positive.
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

-- ---------- RLS: reference-table policies, same as every other seeded table ----------
do $$
declare
  t text;
begin
  foreach t in array array['audit_ratings','audit_findings','audit_counts'] loop
    execute format('alter table public.%I enable row level security;', t);

    execute format('drop policy if exists "%1$s_read" on public.%1$s;', t);
    execute format(
      'create policy "%1$s_read" on public.%1$s for select using (auth.role() = ''authenticated'');', t);

    execute format('drop policy if exists "%1$s_write" on public.%1$s;', t);
    execute format(
      'create policy "%1$s_write" on public.%1$s for all using (public.is_admin()) with check (public.is_admin());', t);
  end loop;
end $$;
