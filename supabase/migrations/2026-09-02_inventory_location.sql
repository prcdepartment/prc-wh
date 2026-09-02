-- ============================================================
-- Migration — 2026-09-02 snapshot: recorded storage locations
--
-- Run this ONCE in the Supabase SQL Editor, BEFORE pasting the regenerated
-- supabase/seed/NN_seed.sql parts. It is safe to run more than once.
--
-- WHY
-- Until this snapshot, no source sheet said where a material physically sat, so the
-- floor plan placed every line by rule (item group, then value, then trade) and said
-- so on screen. The September workbook carries a hidden "Item per location bin" sheet
-- that addresses 754 of the 827 warehouse lines to an actual bay — area, rack, beam
-- level, bay number — in the same vocabulary the floor plan was drawn from.
--
-- `location` holds that address as written, e.g. 'MEPF-R1-03-007'. zone/rack/shelf/bin
-- (which already existed, carrying synthesized values) now hold its parts. A line can
-- occupy several bays; bin_count says how many and `location` names the first.
-- ============================================================

alter table public.inventory add column if not exists location text;
alter table public.inventory add column if not exists bin_count int not null default 0;

comment on column public.inventory.location is
  'Recorded storage address, AREA-Rn-LL-BBB. Empty where the warehouse has not placed the line.';
comment on column public.inventory.bin_count is
  'How many bays this line occupies; location names the first of them.';
