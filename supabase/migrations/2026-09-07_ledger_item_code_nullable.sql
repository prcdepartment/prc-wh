-- ============================================================
-- Migration — 2026-09-07: public.ledger.item_code becomes nullable
--
-- Run this ONCE in the Supabase SQL Editor BEFORE re-running
-- supabase/seed/03_seed.sql. Safe to run more than once.
--
-- WHY
-- The 2026-09-07 seed fails on this row:
--
--   null value in column "item_code" of relation "ledger" violates not-null
--   (986, in, 40, null, TURNBUCKLE SHOE, 9, PC, Avesta Residence, AVR101.WSE.GP.379, C, Old)
--
-- That is real data, not a defect in the import. Until this snapshot the ledger was
-- built only from rows whose Project Origin was the warehouse, and those always
-- carried an item code, so `not null` held by accident. The 2026-09-07 workbook files
-- warehouse movement on its own sheets, which correctly brings in 53 receipts of
-- material transferred INTO warehouse ownership by a project — and 13 of those are
-- identified by description alone, exactly as 60 safekeeping_incoming and 26
-- safekeeping_outgoing rows already are.
--
-- Those 13 rows are 2,995 of the 25,101 units received. Dropping them would understate
-- receipts; inventing a placeholder code would fabricate data and mis-join to
-- item_master. Recording the movement without a code is the honest option, and it is
-- what every other movement table in this schema already permits — safekeeping_soh,
-- safekeeping_incoming, safekeeping_outgoing, movements, reservations,
-- purchase_requests and material_requests all declare `item_code text`. Only
-- `inventory` keeps `not null`, correctly: a stock line with no code is unidentifiable.
--
-- CONSEQUENCE, worth knowing: per-item analytics join the ledger to stock on item
-- code, so a codeless row contributes to no per-item series. It is the same treatment
-- the 36 rows whose code no longer holds stock already receive.
-- ============================================================

alter table public.ledger alter column item_code drop not null;

comment on column public.ledger.item_code is
  'Item code where the source records one. Null for movement identified only by description — the warehouse books some project-to-warehouse transfers that way.';
