-- ============================================================
-- 2026-10-06 — In-app snapshot import (admin → Import Data)
--
-- WHY. Refreshing the live site from a new Central Warehouse workbook used to need
-- a developer: run `npm run import`, run `npm run seed`, then paste four generated
-- SQL files into the Supabase SQL editor in the right order. The procurement team
-- cannot do that, so the live data went stale between developer sessions. This
-- migration is the database half of letting an administrator do it from the browser.
--
-- WHAT IT ADDS.
--   dataset_meta    one key/value row saying which snapshot the live data IS. The
--                   app's whole date model is relative to that date, so it has to
--                   move with the data rather than living in a source file.
--   import_batches  one row per upload attempt — the import history, kept after the
--                   fact so "when did this number change, and who changed it" has an
--                   answer.
--   import_rows     the staged payload, in chunks, before anything is committed.
--   import_commit() the only thing that touches live data, and it does the whole
--                   swap inside one transaction.
--
-- WHY STAGE AT ALL, rather than having the browser delete and re-insert directly.
-- Two reasons, and the second is the important one.
--   1. SIZE. A snapshot is ~2,000 rows across five tables. Sent as one request that
--      is megabytes of JSON; sent as chunks it is a progress bar.
--   2. ATOMICITY. A browser doing "delete from inventory" then "insert 764 rows"
--      has no transaction around the pair. A dropped connection between the two
--      leaves the warehouse with an EMPTY inventory table and a dashboard full of
--      zeroes that looks like a catastrophic stock-out rather than like a failure.
--      Staging first means the destructive part is one function call: a plpgsql
--      function runs in a single implicit transaction, so it either replaces every
--      table or changes nothing at all.
--
-- Everything here is also replayed in supabase/schema.sql, which is the file to
-- re-run whenever anything schema-shaped goes wrong. This file is the record of WHY.
-- ============================================================

-- ---------- dataset_meta ----------
-- Which snapshot the live data is, and where it came from. Read by every signed-in
-- user (src/lib/hydrate.js sets the app's TODAY from it at sign-in); written only by
-- an admin, in practice only by import_commit() below.
create table if not exists public.dataset_meta (
  key        text primary key,
  value      text,
  updated_at timestamptz default now()
);

-- ---------- import history ----------
create table if not exists public.import_batches (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null default 'snapshot',
  source_file      text,
  snapshot_date    date,
  status           text not null default 'staged',  -- staged | applied | failed
  note             text,
  -- The parsed figures as the browser reported them, so the history row can be read
  -- back later without the workbook: row counts, valuation, and the warnings the
  -- reader raised about the source file.
  summary          jsonb not null default '{}'::jsonb,
  created_by       uuid references auth.users(id) default auth.uid(),
  created_by_email text default (auth.jwt() ->> 'email'),
  created_at       timestamptz default now(),
  applied_at       timestamptz
);
create index if not exists import_batches_created_idx on public.import_batches (created_at desc);

-- One row per chunk. `part` names the destination table, `seq` keeps the chunks in
-- order, `payload` is a JSON ARRAY of row objects whose keys are that table's own
-- column names — so import_commit can hand them straight to jsonb_populate_recordset
-- without a column mapping that could drift from the schema.
create table if not exists public.import_rows (
  id       bigint generated always as identity primary key,
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  part     text not null check (part in
             ('inventory','ledger','safekeeping_soh','safekeeping_incoming','safekeeping_outgoing')),
  seq      int not null,
  payload  jsonb not null
);
create index if not exists import_rows_batch_idx on public.import_rows (batch_id, part, seq);

-- ---------- import_commit ----------
-- Applies a staged batch. Admin-only, atomic, and loud about anything that looks
-- like it would empty the warehouse rather than refill it.
--
-- security definer because it deletes from RLS-protected tables; the is_admin()
-- check at the top is what replaces the policy it bypasses.
create or replace function public.import_commit(p_batch uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch   public.import_batches;
  v_inv     jsonb;
  v_led     jsonb;
  v_soh     jsonb;
  v_in      jsonb;
  v_out     jsonb;
  v_counts  jsonb;
  v_prev    int;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator may apply an import.';
  end if;

  select * into v_batch from public.import_batches where id = p_batch;
  if not found then
    raise exception 'No such import batch: %', p_batch;
  end if;
  if v_batch.status = 'applied' then
    raise exception 'That import was already applied, at %. Upload the workbook again to re-import it.', v_batch.applied_at;
  end if;

  -- Flatten each part's chunks back into one array, in the order they were staged.
  select coalesce(jsonb_agg(o.elem order by r.seq, o.ord), '[]'::jsonb) into v_inv
    from public.import_rows r,
         lateral jsonb_array_elements(r.payload) with ordinality as o(elem, ord)
   where r.batch_id = p_batch and r.part = 'inventory';

  select coalesce(jsonb_agg(o.elem order by r.seq, o.ord), '[]'::jsonb) into v_led
    from public.import_rows r,
         lateral jsonb_array_elements(r.payload) with ordinality as o(elem, ord)
   where r.batch_id = p_batch and r.part = 'ledger';

  select coalesce(jsonb_agg(o.elem order by r.seq, o.ord), '[]'::jsonb) into v_soh
    from public.import_rows r,
         lateral jsonb_array_elements(r.payload) with ordinality as o(elem, ord)
   where r.batch_id = p_batch and r.part = 'safekeeping_soh';

  select coalesce(jsonb_agg(o.elem order by r.seq, o.ord), '[]'::jsonb) into v_in
    from public.import_rows r,
         lateral jsonb_array_elements(r.payload) with ordinality as o(elem, ord)
   where r.batch_id = p_batch and r.part = 'safekeeping_incoming';

  select coalesce(jsonb_agg(o.elem order by r.seq, o.ord), '[]'::jsonb) into v_out
    from public.import_rows r,
         lateral jsonb_array_elements(r.payload) with ordinality as o(elem, ord)
   where r.batch_id = p_batch and r.part = 'safekeeping_outgoing';

  -- A snapshot with no warehouse stock is a broken read of the workbook, not an empty
  -- warehouse. The browser already refuses to stage one; this is the backstop, because
  -- the destructive statements are below this line and nothing else can undo them.
  if jsonb_array_length(v_inv) = 0 then
    raise exception 'The staged import has no inventory rows. Nothing was changed.';
  end if;

  -- Transactional rows point at inventory ids by foreign key, and the ids are
  -- regenerated on every import (they are the workbook's row order, not a stable
  -- identity). Drop the links, swap the stock, then re-make them by item code —
  -- which is the identity that actually survives a re-import. `approvals` carries no
  -- item code of its own, so its link cannot be re-made and is simply cleared.
  update public.movements         set item_id = null where item_id is not null;
  update public.reservations      set item_id = null where item_id is not null;
  update public.purchase_requests set item_id = null where item_id is not null;
  update public.material_requests set item_id = null where item_id is not null;
  update public.approvals         set item_id = null where item_id is not null;

  -- ---- the swap ----
  delete from public.inventory;
  insert into public.inventory (
    id, item_code, description, detailed_description, trade_l1, trade_l2, material_type, uom,
    total_qty, beginning_qty, period_in, period_out, available_qty, reserved_qty,
    incoming_qty, outgoing_qty, damaged_qty, min_level, issue_frequency, last_movement_offset,
    unit_price, discounted_price, inventory_value, condition_class, brand, model,
    location, bin_count, zone, rack, shelf, bin, updated_at)
  select
    id, item_code, description, detailed_description, trade_l1, trade_l2, material_type, uom,
    total_qty, beginning_qty, period_in, period_out, available_qty, reserved_qty,
    incoming_qty, outgoing_qty, damaged_qty, min_level, issue_frequency, last_movement_offset,
    unit_price, discounted_price, inventory_value, condition_class, brand, model,
    location, bin_count, zone, rack, shelf, bin, now()
  from jsonb_populate_recordset(null::public.inventory, v_inv);

  delete from public.ledger;
  insert into public.ledger (direction, day_offset, item_code, description, qty, uom, project, doc_ref, class, condition)
  select direction, day_offset, item_code, description, qty, uom, project, doc_ref, class, condition
  from jsonb_populate_recordset(null::public.ledger, v_led);

  delete from public.safekeeping_soh;
  insert into public.safekeeping_soh (
    id, ref_code, project, project_code, trade, trade_l1, item_group, item_code,
    description, detailed_description, uom, boh, qty_in, qty_out, soh, unit_price, class, remarks)
  select
    id, ref_code, project, project_code, trade, trade_l1, item_group, item_code,
    description, detailed_description, uom, boh, qty_in, qty_out, soh, unit_price, class, remarks
  from jsonb_populate_recordset(null::public.safekeeping_soh, v_soh);

  delete from public.safekeeping_incoming;
  insert into public.safekeeping_incoming (
    id, project, project_code, doc_date, doc_ref, category, item_code,
    description, detailed_description, uom, qty, class, condition, remarks)
  select
    id, project, project_code, doc_date, doc_ref, category, item_code,
    description, detailed_description, uom, qty, class, condition, remarks
  from jsonb_populate_recordset(null::public.safekeeping_incoming, v_in);

  delete from public.safekeeping_outgoing;
  insert into public.safekeeping_outgoing (
    id, project, project_code, doc_date, doc_ref, category, item_code,
    description, detailed_description, uom, qty, class, condition, remarks)
  select
    id, project, project_code, doc_date, doc_ref, category, item_code,
    description, detailed_description, uom, qty, class, condition, remarks
  from jsonb_populate_recordset(null::public.safekeeping_outgoing, v_out);

  -- Re-link the transactional rows to the new stock lines by item code. An item code
  -- can appear on several lines (different 2nd descriptions), so the lowest id wins —
  -- the same line the app shows first for that code.
  update public.movements m set item_id = i.id
    from (select distinct on (item_code) item_code, id from public.inventory order by item_code, id) i
   where m.item_id is null and m.item_code = i.item_code;
  update public.reservations x set item_id = i.id
    from (select distinct on (item_code) item_code, id from public.inventory order by item_code, id) i
   where x.item_id is null and x.item_code = i.item_code;
  update public.purchase_requests x set item_id = i.id
    from (select distinct on (item_code) item_code, id from public.inventory order by item_code, id) i
   where x.item_id is null and x.item_code = i.item_code;
  update public.material_requests x set item_id = i.id
    from (select distinct on (item_code) item_code, id from public.inventory order by item_code, id) i
   where x.item_id is null and x.item_code = i.item_code;

  -- ---- the date the whole app measures from ----
  insert into public.dataset_meta (key, value, updated_at)
       values ('snapshot_date', to_char(v_batch.snapshot_date, 'YYYY-MM-DD'), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  insert into public.dataset_meta (key, value, updated_at)
       values ('snapshot_source', coalesce(v_batch.source_file, ''), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();

  v_counts := jsonb_build_object(
    'inventory', jsonb_array_length(v_inv),
    'ledger', jsonb_array_length(v_led),
    'safekeeping_soh', jsonb_array_length(v_soh),
    'safekeeping_incoming', jsonb_array_length(v_in),
    'safekeeping_outgoing', jsonb_array_length(v_out));

  update public.import_batches
     set status = 'applied', applied_at = now(),
         summary = summary || jsonb_build_object('applied', v_counts)
   where id = p_batch;

  -- The staged copy has served its purpose; the batch row stays as the history.
  delete from public.import_rows where batch_id = p_batch;

  insert into public.audit_log (user_email, action, detail)
  values (auth.jwt() ->> 'email', 'Imported warehouse snapshot',
          format('%s — %s inventory, %s ledger, %s safekeeping rows from %s',
                 to_char(v_batch.snapshot_date, 'YYYY-MM-DD'),
                 jsonb_array_length(v_inv), jsonb_array_length(v_led),
                 jsonb_array_length(v_soh) + jsonb_array_length(v_in) + jsonb_array_length(v_out),
                 coalesce(v_batch.source_file, 'an uploaded workbook')));

  return jsonb_build_object('ok', true, 'snapshot_date', v_batch.snapshot_date, 'counts', v_counts);
end $$;

revoke all on function public.import_commit(uuid) from public;
grant execute on function public.import_commit(uuid) to authenticated;

-- Table-level grants, stated rather than inherited from Supabase's defaults. RLS is
-- still what decides who may do what; a grant only gets the request as far as the policy.
grant select, insert, update, delete on public.dataset_meta   to authenticated;
grant select, insert, update, delete on public.import_batches to authenticated;
grant select, insert, update, delete on public.import_rows    to authenticated;
grant usage, select on sequence public.import_rows_id_seq to authenticated;

-- ---------- RLS ----------
-- dataset_meta: everyone signed in reads it (the app's date model depends on it),
-- only admins write. import_batches / import_rows: admins only, end to end — they
-- are the administrator's own workbench, and import_rows holds unvetted data.
alter table public.dataset_meta   enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_rows    enable row level security;

drop policy if exists "dataset_meta_read" on public.dataset_meta;
create policy "dataset_meta_read" on public.dataset_meta
  for select using (auth.role() = 'authenticated');
drop policy if exists "dataset_meta_write" on public.dataset_meta;
create policy "dataset_meta_write" on public.dataset_meta
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "import_batches_admin" on public.import_batches;
create policy "import_batches_admin" on public.import_batches
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "import_rows_admin" on public.import_rows;
create policy "import_rows_admin" on public.import_rows
  for all using (public.is_admin()) with check (public.is_admin());

-- Seed the snapshot date with whatever the data currently is, so an existing database
-- answers the question from the first moment this table exists rather than after the
-- first in-app import. 2026-09-28 is the snapshot the seeds were generated from.
insert into public.dataset_meta (key, value)
     values ('snapshot_date', '2026-09-28')
on conflict (key) do nothing;
