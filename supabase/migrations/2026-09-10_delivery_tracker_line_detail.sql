-- Delivery tracker: two columns for the line-item detail the new source carries.
--
-- The 2026-09-10 workbook ("MCC. PRC. OSM Delivery Tracker - Presentation 2.xlsx") is
-- hierarchical where the previous one was flat, and it gives what the previous one did
-- not: each delivery batch's individual line items, with a DESIGNATION (the model or
-- handing — PHD-002, W-02A, "Left", "Right Swing") and a 2ND DESCRIPTION qualifying it.
--
-- The changelog recorded the absence of exactly these two fields as the reason the
-- tracker's Material Description cell had no second line to show. They exist now, so
-- the table gets them.
--
-- Nullable, deliberately: 158 of the 355 line items carry a designation and 218 carry a
-- second description, so a blank is normal and a NOT NULL with a '' default would only
-- turn "the source says nothing" into "the source says empty string".
--
-- Run this BEFORE re-pasting the seed files.

alter table public.delivery_tracker
  add column if not exists designation text,
  add column if not exists description2 text;

comment on column public.delivery_tracker.designation is
  'Line item model or handing as written in the source (PHD-002, W-02A, Left, Right Swing). Null where the batch is scheduled without itemised lines.';
comment on column public.delivery_tracker.description2 is
  'Source 2ND DESCRIPTION — qualifies the designation (swing direction, dimensions, finish). Null where the source gives none.';
