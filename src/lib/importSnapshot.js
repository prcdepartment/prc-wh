// The in-app snapshot import: workbook in the browser → Postgres.
//
// This is the short path for the monthly refresh. The long one still exists and is
// still the right tool for re-seeding a database from scratch (npm run import, then
// npm run seed, then paste the SQL) — but it needs node, a checkout and a developer,
// which is why the live site used to go stale between sessions. An administrator can
// now do the same thing from Import Data in the sidebar.
//
// It reads the workbook with the SAME rules the command line uses — src/lib/
// snapshotRules.js, shared by both — so neither path can quietly disagree with the
// other about what a file says.
//
// THREE STEPS, AND THE PREVIEW BETWEEN THEM IS THE POINT.
//
//   1. readSnapshotFile()  parses the workbook and returns rows + warnings. Touches
//                          nothing. Everything that can go wrong with a workbook goes
//                          wrong here, in front of the person who can judge it.
//   2. stageSnapshot()     writes the parsed rows into import_rows, in chunks, under
//                          a new import_batches row. Still touches no live data.
//   3. commitSnapshot()    one RPC. The database replaces all five tables inside one
//                          transaction, or changes nothing.
//
// The split exists because step 3 is destructive and irreversible, and the warehouse's
// figures are the thing being replaced. Nobody should discover a misread column by
// watching the dashboard change.
import { supabase, isConfigured } from './supabase'
import { readWorkbookFromBytes } from './xlsx'
import { buildSnapshot } from './snapshotRules'
import { fetchAll, hydrate, hydrationStatus } from './hydrate'
import { inventory } from '../data/inventory'
import { LEDGER } from '../data/ledger'
import { SOH_ROWS, INCOMING_ROWS, OUTGOING_ROWS } from '../data/safekeepingSheets'
import { PROJECTS } from '../data/projects'

// Rows per staged chunk. Small enough that each request is tens of kilobytes (so a
// slow warehouse connection makes progress rather than timing out on one giant body),
// large enough that a 2,000-row snapshot is ten-ish requests rather than two thousand.
const CHUNK = 200

// ---------------------------------------------------------------------------
// Column mapping — camelCase view model → the table's own column names.
//
// These must agree with scripts/generate-seeds.mjs, because a database seeded from
// the SQL and a database filled by this importer have to end up identical. In
// particular the three value conventions are copied from it exactly:
//   text    '' becomes NULL  (an empty cell is an absent value, not a blank string)
//   number  '' / null / NaN becomes 0
//   date    '' becomes NULL  (never 1970, never today)
// ---------------------------------------------------------------------------
const t = (v) => (v === undefined || v === null || v === '' ? null : String(v))
const n = (v) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? 0 : Number(v))
const d = (v) => (v ? String(v) : null)

const toInventoryRow = (r) => ({
  id: r.id,
  item_code: r.itemCode,
  description: t(r.description),
  detailed_description: t(r.detailedDescription),
  trade_l1: t(r.tradeL1),
  trade_l2: t(r.tradeL2),
  material_type: t(r.materialType),
  uom: t(r.uom),
  total_qty: n(r.totalQty),
  beginning_qty: n(r.beginningQty),
  period_in: n(r.periodIn),
  period_out: n(r.periodOut),
  available_qty: n(r.availableQty),
  reserved_qty: n(r.reservedQty),
  incoming_qty: n(r.incomingQty),
  outgoing_qty: n(r.outgoingQty),
  damaged_qty: n(r.damagedQty),
  min_level: n(r.minLevel),
  issue_frequency: n(r.issueFrequency),
  last_movement_offset: n(r.lastMovementOffset),
  unit_price: n(r.unitPrice),
  discounted_price: n(r.discountedPrice),
  inventory_value: n(r.inventoryValue),
  condition_class: t(r.conditionClass),
  brand: t(r.brand),
  model: t(r.model),
  location: t(r.location),
  bin_count: n(r.binCount),
  zone: t(r.zone),
  rack: t(r.rack),
  shelf: t(r.shelf),
  bin: t(r.bin),
})

const toLedgerRow = (r) => ({
  direction: r.dir,
  day_offset: n(r.off),
  item_code: t(r.c),
  description: t(r.d),
  qty: n(r.q),
  uom: t(r.u),
  project: t(r.p),
  doc_ref: t(r.r),
  class: t(r.cls),
  condition: t(r.cond),
})

const toSohRow = (r) => ({
  id: r.id,
  ref_code: t(r.refCode),
  project: t(r.project),
  project_code: t(r.projectCode),
  trade: t(r.trade),
  trade_l1: t(r.tradeL1),
  item_group: t(r.itemGroup),
  item_code: t(r.itemCode),
  description: t(r.description),
  detailed_description: t(r.detailedDescription),
  uom: t(r.uom),
  boh: n(r.boh),
  qty_in: n(r.in),
  qty_out: n(r.out),
  soh: n(r.soh),
  unit_price: n(r.unitPrice),
  class: t(r.class),
  remarks: t(r.remarks),
})

const toSkLogRow = (r) => ({
  id: r.id,
  project: t(r.project),
  project_code: t(r.projectCode),
  doc_date: d(r.date),
  doc_ref: t(r.docRef),
  category: t(r.category),
  item_code: t(r.itemCode),
  description: t(r.description),
  detailed_description: t(r.detailedDescription),
  uom: t(r.uom),
  qty: n(r.qty),
  class: t(r.class),
  condition: t(r.condition),
  remarks: t(r.remarks),
})

// ---------------------------------------------------------------------------
// Step 1 — read the workbook
// ---------------------------------------------------------------------------
/**
 * Parse an uploaded workbook into the five row sets, without touching the database.
 *
 * The reference data the workbook does not carry comes from what is already loaded:
 * the item master is fetched (it is the one table the app does not hydrate at
 * sign-in, because only the lookup modals need it), and the previous snapshot is
 * simply the data currently on screen — which is exactly what the command-line
 * importer carries forward from /private-data/.
 *
 * @param {File|Blob} file the uploaded .xlsx
 * @param {(stage: string) => void} [onStage] progress callback
 */
export async function readSnapshotFile(file, onStage = () => {}) {
  onStage('Reading the file')
  const bytes = new Uint8Array(await file.arrayBuffer())

  onStage('Opening the workbook')
  const wb = await readWorkbookFromBytes(bytes)

  onStage('Loading the item master')
  // Trade, item group and material type for every code. ~7,400 rows; the one table
  // worth fetching on demand rather than at every sign-in.
  const masterRows = isConfigured ? await fetchAll('item_master', 'code') : []
  const itemMaster = masterRows.map((r) => ({
    c: r.code, d: r.description, t: r.trade_l1, g: r.item_group, m: r.material_type, u: r.uom,
  }))

  onStage('Reading the sheets')
  // Snapshots of the live arrays, not the arrays themselves: hydrate() refills them in
  // place, and the carry-forward has to keep looking at the PREVIOUS snapshot even
  // after this import has replaced it.
  const snap = buildSnapshot(wb, {
    itemMaster,
    projects: PROJECTS.map((p) => ({ ...p })),
    prevInventory: inventory.map((r) => ({ ...r })),
    prevSafekeepingSoh: SOH_ROWS.map((r) => ({ ...r })),
  })

  return {
    ...snap,
    fileName: file.name || 'workbook.xlsx',
    fileSize: file.size || bytes.length,
    // What the live data looks like right now, so the preview can show the change
    // rather than just the new figures. A count that moves by one line is routine;
    // one that halves is a conversation with the warehouse.
    previous: {
      counts: {
        inventory: inventory.length,
        ledger: LEDGER.length,
        safekeeping_soh: SOH_ROWS.length,
        safekeeping_incoming: INCOMING_ROWS.length,
        safekeeping_outgoing: OUTGOING_ROWS.length,
      },
      inventory: inventory.length,
      value: inventory.reduce((a, r) => a + (r.inventoryValue || 0), 0),
      units: inventory.reduce((a, r) => a + (r.totalQty || 0), 0),
    },
    itemMasterRows: itemMaster.length,
  }
}

// ---------------------------------------------------------------------------
// Step 2 — stage
// ---------------------------------------------------------------------------
/**
 * Write the parsed rows into the staging tables under a fresh batch.
 * Touches no live data; returns the batch id that commitSnapshot() then applies.
 *
 * @param {object} snap the result of readSnapshotFile
 * @param {(done: number, total: number) => void} [onProgress] chunks uploaded
 */
export async function stageSnapshot(snap, onProgress = () => {}) {
  if (!isConfigured) throw new Error('Supabase is not configured, so there is nowhere to import to.')

  const parts = [
    ['inventory', snap.inventory.map(toInventoryRow)],
    ['ledger', snap.ledger.map(toLedgerRow)],
    ['safekeeping_soh', snap.soh.map(toSohRow)],
    ['safekeeping_incoming', snap.incoming.map(toSkLogRow)],
    ['safekeeping_outgoing', snap.outgoing.map(toSkLogRow)],
  ]

  if (!parts[0][1].length) {
    throw new Error('This workbook produced no warehouse stock lines, so there is nothing to import.')
  }
  // The same two conditions the page blocks on, enforced here as well — the page's
  // disabled button is a courtesy, this is the rule. Several columns the app depends
  // on are not in the workbook at all: without the live data and the item master to
  // combine it with, a perfectly readable file produces unpriced, untraded stock.
  if (hydrationStatus.source !== 'postgres') {
    throw new Error(
      'The live data is not loaded in this session, so unit prices, condition classes and bin ' +
      'addresses cannot be carried forward. Sign out and back in, then import again.')
  }
  if (!snap.itemMasterRows) {
    throw new Error(
      'The item master could not be read, so no line would carry a trade or item group. ' +
      'Nothing was changed.')
  }

  const { data: batch, error: batchErr } = await supabase
    .from('import_batches')
    .insert({
      kind: 'snapshot',
      source_file: snap.fileName,
      snapshot_date: snap.snapshotDate,
      status: 'staged',
      summary: {
        counts: snap.stats.counts,
        value: snap.stats.value,
        units: snap.stats.units,
        partition: snap.partition,
        layout: snap.split ? 'split' : 'merged',
        locationCarried: snap.locationCarried,
        warnings: snap.warnings,
        previous: snap.previous,
      },
    })
    .select('id')
    .single()

  if (batchErr) throw new Error(describe(batchErr, 'start an import'))

  // Chunk every part up front so the progress bar counts real requests.
  const chunks = []
  for (const [part, rows] of parts) {
    for (let i = 0; i < rows.length; i += CHUNK) {
      chunks.push({ batch_id: batch.id, part, seq: i, payload: rows.slice(i, i + CHUNK) })
    }
  }

  let done = 0
  onProgress(0, chunks.length)
  // Two chunks per request: fewer round trips than one at a time, small enough bodies
  // that a dropped request costs 400 rows rather than the whole upload.
  for (let i = 0; i < chunks.length; i += 2) {
    const slice = chunks.slice(i, i + 2)
    const { error } = await supabase.from('import_rows').insert(slice)
    if (error) {
      // Nothing live has changed at this point — staging is deliberately inert — so the
      // half-uploaded rows are just litter. The batch row stays, marked failed, because
      // "an import was attempted and did not finish" is worth being able to see later.
      await supabase.from('import_rows').delete().eq('batch_id', batch.id)
      await supabase.from('import_batches').update({ status: 'failed', note: error.message }).eq('id', batch.id)
      throw new Error(describe(error, 'upload the parsed rows'))
    }
    done += slice.length
    onProgress(done, chunks.length)
  }

  return batch.id
}

// ---------------------------------------------------------------------------
// Step 3 — commit
// ---------------------------------------------------------------------------
/**
 * Apply a staged batch: the database swaps all five tables in one transaction, then
 * the app reloads from it so the screen agrees with what was just written.
 */
export async function commitSnapshot(batchId) {
  const { data, error } = await supabase.rpc('import_commit', { p_batch: batchId })
  if (error) throw new Error(describe(error, 'apply the import'))

  // Re-read everything, including the new snapshot date, so every page recomputes
  // against the data that is now in the database rather than the data it was holding.
  const result = await hydrate()
  return { ...data, hydration: result }
}

/** Abandon a staged batch without applying it. */
export async function discardSnapshot(batchId) {
  // import_rows cascades on the batch row, so one delete is enough.
  await supabase.from('import_batches').delete().eq('id', batchId)
}

/** The import history, newest first. */
export async function listImports(limit = 12) {
  const { data, error } = await supabase
    .from('import_batches')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(describe(error, 'read the import history'))
  return data
}

// ---------------------------------------------------------------------------
// A Postgres error, said in a way that points at the fix.
//
// The two that will actually happen are both environmental rather than anything the
// person did wrong, and both have a one-line answer — so they get one here instead of
// a 42P01 in a red box.
// ---------------------------------------------------------------------------
function describe(error, what) {
  const msg = error.message || String(error)
  if (/relation .* does not exist|schema cache|Could not find the table|function public\.import_commit/i.test(msg)) {
    return `The database has not been brought up to date for imports (${msg}). ` +
      'Re-run supabase/schema.sql in the Supabase SQL editor, then try again.'
  }
  if (/row-level security|permission denied|violates row-level/i.test(msg)) {
    return `Your account is not allowed to ${what}. Importing is restricted to administrators.`
  }
  return `Could not ${what}: ${msg}`
}
