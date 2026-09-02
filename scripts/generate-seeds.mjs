// Generates the seed SQL in supabase/seed/ from the master data in /private-data/.
//
// The old supabase/seed_inventory.sql was hand-maintained and drifted out of
// sync with src/data/inventory.js (wrong snapshot, missing columns). Deriving
// the seed from the JS modules makes that impossible: regenerate with
//
//   npm run seed
//
// Run it whenever a /private-data/*.js source module changes.
import { writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// Reads from /private-data/, NOT src/data/. This repository is public: src/data/ ships
// empty shells and the real dataset never leaves the maintainer's machine except by
// being pasted into Supabase. trades.js is the exception — a generic construction
// taxonomy with nothing confidential in it — so it still lives in src/data/.
const dataUrl = (f) => new URL(`file://${join(root, 'private-data', f).replace(/\\/g, '/')}`).href
const srcUrl = (f) => new URL(`file://${join(root, 'src', 'data', f).replace(/\\/g, '/')}`).href

const { inventory } = await import(dataUrl('inventory.js'))
const { LEDGER } = await import(dataUrl('ledger.js'))
const { SOH_ROWS, INCOMING_ROWS, OUTGOING_ROWS } = await import(dataUrl('safekeepingSheets.js'))
const { DELIVERY_TRACKER_ROWS } = await import(dataUrl('deliveryTrackerSheet.js'))
const { PROJECTS } = await import(dataUrl('projects.js'))
const { ITEM_MASTER } = await import(dataUrl('itemMaster.js'))
const { TRADES } = await import(srcUrl('trades.js'))

// ---- SQL literal helpers -------------------------------------------------
const q = (v) => {
  if (v === undefined || v === null || v === '') return 'null'
  return `'${String(v).replace(/'/g, "''")}'`
}
const n = (v) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? '0' : String(Number(v)))
// Dates arrive as 'YYYY-MM-DD' strings or empty.
const d = (v) => (v ? `'${v}'::date` : 'null')

/**
 * Emit a batched INSERT ... ON CONFLICT DO UPDATE for one table.
 * Chunked because Postgres/PostgREST choke on single statements with
 * thousands of rows.
 */
function insert(table, columns, rows, toValues, conflict = columns[0]) {
  if (!rows.length) return [`-- ${table}: no rows`]
  // conflict === null → plain insert (table has no natural key; caller truncates).
  const keys = conflict ? conflict.split(',').map((c) => c.trim()) : []
  const updates = columns.filter((c) => !keys.includes(c)).map((c) => `${c} = excluded.${c}`).join(', ')
  const tail = conflict ? `\non conflict (${conflict}) do update set ${updates};` : ';'
  const out = [`-- ${table}: ${rows.length} rows`]

  // Upserting alone is not enough to make a re-seed correct. These tables are keyed on
  // a row number that is assigned in sheet order, so a snapshot with FEWER lines than
  // the one before would upsert over the first N and silently leave the tail of the
  // previous snapshot behind — stock that no longer exists, still on the dashboard.
  // Deleting past the new high-water mark first is what makes a re-seed a replacement
  // rather than a merge. (Sept grew on every table, so nothing is dropped this run;
  // it is here for the month one of them shrinks.)
  if (keys.length === 1 && ['id', 'no'].includes(keys[0])) {
    const max = rows.reduce((m, r) => Math.max(m, Number(r[keys[0]] ?? r.id ?? r.no) || 0), 0)
    out.push(`delete from public.${table} where ${keys[0]} > ${max};`)
  }
  const CHUNK = 200
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    out.push(
      `insert into public.${table} (${columns.join(',')}) values\n` +
        chunk.map((r) => `  (${toValues(r).join(',')})`).join(',\n') +
        tail
    )
  }
  return out
}

const statements = []
const add = (x) => statements.push(...(Array.isArray(x) ? x : [x]))

// ---- trades --------------------------------------------------------------
const tradeRows = []
Object.entries(TRADES).forEach(([l1, l2s]) => {
  l2s.forEach((l2, i) => tradeRows.push({ l1, l2, sort_order: i }))
})
add(
  insert('trades', ['l1', 'l2', 'sort_order'], tradeRows, (r) => [q(r.l1), q(r.l2), n(r.sort_order)], 'l1, l2')
)

// ---- projects ------------------------------------------------------------
add(insert('projects', ['code', 'name'], PROJECTS, (r) => [q(r.code), q(r.name)], 'code'))

// ---- item master ---------------------------------------------------------
add(
  insert(
    'item_master',
    ['code', 'description', 'trade_l1', 'item_group', 'material_type', 'uom'],
    ITEM_MASTER,
    (r) => [q(r.c), q(r.d), q(r.t), q(r.g), q(r.m), q(r.u)],
    'code'
  )
)

// ---- inventory -----------------------------------------------------------
add(
  insert(
    'inventory',
    ['id', 'item_code', 'description', 'detailed_description', 'trade_l1', 'trade_l2', 'material_type', 'uom',
      'total_qty', 'beginning_qty', 'period_in', 'period_out', 'available_qty', 'reserved_qty', 'incoming_qty',
      'outgoing_qty', 'damaged_qty', 'min_level', 'issue_frequency', 'last_movement_offset', 'unit_price',
      'discounted_price', 'inventory_value', 'condition_class', 'brand', 'model', 'location', 'bin_count',
      'zone', 'rack', 'shelf', 'bin'],
    inventory,
    (r) => [n(r.id), q(r.itemCode), q(r.description), q(r.detailedDescription), q(r.tradeL1), q(r.tradeL2),
      q(r.materialType), q(r.uom), n(r.totalQty), n(r.beginningQty), n(r.periodIn), n(r.periodOut),
      n(r.availableQty), n(r.reservedQty), n(r.incomingQty), n(r.outgoingQty), n(r.damagedQty), n(r.minLevel),
      n(r.issueFrequency), n(r.lastMovementOffset), n(r.unitPrice), n(r.discountedPrice), n(r.inventoryValue),
      q(r.conditionClass), q(r.brand), q(r.model), q(r.location), n(r.binCount),
      q(r.zone), q(r.rack), q(r.shelf), q(r.bin)]
  )
)

// ---- ledger --------------------------------------------------------------
// The ledger has no natural key, so it is replaced wholesale on each seed run.
add('-- ledger is append-only source data with no natural key: replace wholesale.\ntruncate public.ledger;')
add(
  insert(
    'ledger',
    ['direction', 'day_offset', 'item_code', 'description', 'qty', 'uom', 'project', 'doc_ref', 'class', 'condition'],
    LEDGER,
    (r) => [q(r.dir), n(r.off), q(r.c), q(r.d), n(r.q), q(r.u), q(r.p), q(r.r), q(r.cls), q(r.cond)],
    null
  )
)

// ---- safekeeping SOH -----------------------------------------------------
add(
  insert(
    'safekeeping_soh',
    ['id', 'ref_code', 'project', 'project_code', 'trade', 'trade_l1', 'item_group', 'item_code', 'description',
      'detailed_description', 'uom', 'boh', 'qty_in', 'qty_out', 'soh', 'unit_price', 'class', 'remarks'],
    SOH_ROWS,
    (r) => [n(r.id), q(r.refCode), q(r.project), q(r.projectCode), q(r.trade), q(r.tradeL1), q(r.itemGroup),
      q(r.itemCode), q(r.description), q(r.detailedDescription), q(r.uom), n(r.boh), n(r.in), n(r.out), n(r.soh),
      n(r.unitPrice), q(r.class), q(r.remarks)]
  )
)

// ---- safekeeping incoming / outgoing ------------------------------------
const skCols = ['id', 'project', 'project_code', 'doc_date', 'doc_ref', 'category', 'item_code', 'description',
  'detailed_description', 'uom', 'qty', 'class', 'condition', 'remarks']
const skValues = (r) => [n(r.id), q(r.project), q(r.projectCode), d(r.date), q(r.docRef), q(r.category),
  q(r.itemCode), q(r.description), q(r.detailedDescription), q(r.uom), n(r.qty), q(r.class), q(r.condition), q(r.remarks)]
add(insert('safekeeping_incoming', skCols, INCOMING_ROWS, skValues))
add(insert('safekeeping_outgoing', skCols, OUTGOING_ROWS, skValues))

// ---- delivery tracker ----------------------------------------------------
add(
  insert(
    'delivery_tracker',
    ['no', 'category', 'item', 'project', 'batch', 'qty', 'uom', 'target_date', 'target_text', 'location',
      'warehouse', 'status', 'ops_remarks', 'dp_payment', 'prc_remarks'],
    DELIVERY_TRACKER_ROWS,
    (r) => [n(r.no), q(r.category), q(r.item), q(r.project), q(r.batch), q(r.qty), q(r.uom), d(r.targetDate),
      q(r.targetText), q(r.location), q(r.warehouse), q(r.status), q(r.opsRemarks), q(r.dpPayment), q(r.prcRemarks)],
    'no'
  )
)

// ---- write out, split into editor-sized files -----------------------------
// Supabase's browser SQL Editor rejects a submission over roughly 1 MB, and the
// whole dataset is ~1.1 MB. So the statements are packed into numbered files that
// each stay comfortably under that, to be pasted in order. Splitting happens only
// between complete statements, never inside one.
const MAX_BYTES = 400_000
const bytes = (s) => Buffer.byteLength(s, 'utf8')

const files = [[]]
let current = 0
for (const stmt of statements) {
  const size = files[current].reduce((a, s) => a + bytes(s) + 2, 0)
  if (size > 0 && size + bytes(stmt) > MAX_BYTES) {
    files.push([])
    current += 1
  }
  files[current].push(stmt)
}

const outDir = join(root, 'supabase', 'seed')
mkdirSync(outDir, { recursive: true })
// Clear any parts left over from a previous, longer run.
for (const f of readdirSync(outDir)) if (f.endsWith('.sql')) rmSync(join(outDir, f))

const header = (i, total) => `-- ============================================================
-- AUTO-GENERATED by scripts/generate-seeds.mjs — DO NOT EDIT BY HAND.
-- Regenerate with:  npm run seed
--
-- PART ${i} OF ${total}. Run AFTER schema.sql, and run the parts IN ORDER.
-- Split only because Supabase's SQL Editor rejects submissions over ~1 MB.
-- Every part is idempotent — safe to re-run.
--
-- The transactional tables (movements, reservations, purchase_requests,
-- material_requests, approvals, safekeeping_requests, audit_log) are
-- deliberately NOT seeded: they start empty so every row is a real record.
-- ============================================================

`

const written = files.map((stmts, i) => {
  const name = `${String(i + 1).padStart(2, '0')}_seed.sql`
  const body = header(i + 1, files.length) + stmts.join('\n\n') + '\n'
  writeFileSync(join(outDir, name), body, 'utf8')
  return { name, kb: Math.round(bytes(body) / 1024) }
})

const counts = {
  trades: tradeRows.length, projects: PROJECTS.length, item_master: ITEM_MASTER.length,
  inventory: inventory.length, ledger: LEDGER.length,
  safekeeping_soh: SOH_ROWS.length, safekeeping_incoming: INCOMING_ROWS.length,
  safekeeping_outgoing: OUTGOING_ROWS.length, delivery_tracker: DELIVERY_TRACKER_ROWS.length,
}
console.log(`Wrote ${written.length} file(s) to supabase/seed/ — paste them in order:`)
for (const f of written) console.log(`  ${f.name}  ${String(f.kb).padStart(4)} KB`)
console.log('\nRows seeded:')
for (const [t, c] of Object.entries(counts)) console.log(`  ${t.padEnd(22)} ${c}`)
