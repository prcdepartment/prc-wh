// Rebuilds the master data in /private-data/ from a Central Warehouse inventory
// workbook.
//
//   npm run import -- "sample/MCC. PRC. WM. CW Taytay Inventory. 2026 09 02.xlsx"
//
// Then `npm run seed` turns those modules into the SQL that goes into Supabase.
// Committing this script (it holds no data, only the reading rules) means the next
// snapshot is one command instead of a hand-built one-off — the July generator was
// ad-hoc and was not kept, which is why the September file had to be re-decoded from
// scratch. It has since earned that: the workbook has arrived in two different
// shapes and with two different sets of sheets across three consecutive snapshots.
//
// ---------------------------------------------------------------------------
// WHAT THIS SCRIPT ASSUMES, AND WHAT IT REFUSES TO ASSUME
//
// STABLE across every snapshot so far: the COLUMN order of the stock sheets
// (Concatenate, Project Origin, Item Code, Item Description, Specific Description,
// Uom, BOH, In, Out, SOH, …) and of the movement sheets (…, Date, Document
// Reference, Category, Item Code, Item Description, 2nd Description, Uom, Qty, Class,
// Condition, Remarks). Everything here is keyed off those positions.
//
// NOT STABLE, and therefore detected per file rather than assumed:
//   * whether warehouse and safekeeping are on SEPARATE sheets or merged into one
//     and split by Project Origin — see the layout note below;
//   * whether a location sheet is present at all. 2026-09-02 had one; the July and
//     2026-09-07 files do not.
//
// NEVER IN THE WORKBOOK, so sourced elsewhere every time:
//   * trade and item group — from the item master, which resolves every code the
//     sheets carry and is a better taxonomy than the sheet's own charge codes;
//   * unit price and condition class — carried forward from the previous snapshot.
//     A price column has appeared once, on the 2026-09-02 location sheet, and it was
//     unusable — see PRICE below.
// ---------------------------------------------------------------------------
import { writeFileSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, basename } from 'node:path'
import { readWorkbook, cell } from './lib/xlsx.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const priv = (f) => join(root, 'private-data', f)
const load = (f) => import(pathToFileURL(priv(f)).href)

const WAREHOUSE = 'Central Warehouse Taytay'
const src = process.argv[2] || 'sample/MCC. PRC. WM. CW Taytay Inventory. 2026 09 02.xlsx'
const srcPath = join(root, src)

// ---------------------------------------------------------------------------
// Deterministic pseudo-randomness.
//
// Several columns the app needs have no source in any warehouse sheet — how much of
// a line is reserved against a request, how much is damaged, the reorder level. They
// are synthesized, but they must be STABLE: a re-run that reshuffled them would show
// the warehouse a different dashboard for the same snapshot and destroy trust in the
// numbers that ARE real. So every synthesized value is a pure function of the line's
// own identity via this hash, not of Math.random() or of row order.
// ---------------------------------------------------------------------------
function hash(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h
}
/** A stable 0..1 stream for one key; call rnd() repeatedly for independent draws. */
function seeded(key) {
  let s = hash(key) || 1
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 0x100000000 }
}

const clean = (v) => {
  const c = cell(v)
  if (c === null || c === undefined) return ''
  return String(c).replace(/\s+/g, ' ').trim()
}
const num = (v) => { const c = cell(v); const n = Number(c); return Number.isFinite(n) ? n : 0 }
const round2 = (n) => Math.round(n * 100) / 100

// ---------------------------------------------------------------------------
// Read the workbook
// ---------------------------------------------------------------------------
const wb = readWorkbook(srcPath)
const has = (name) => wb.sheetNames.includes(name)
const sheet = (name) => wb.rows(name)

// ---------------------------------------------------------------------------
// TWO LAYOUTS, AND WHY BOTH HAVE TO BE READ
//
// The warehouse has now sent this workbook in two shapes in as many months, so the
// layout is detected rather than assumed:
//
//   SPLIT  (July, and again 2026-09-07) — "CW SOH" / "CW Incoming" / "CW Outgoing"
//          beside "Safekeeping SOH" / "Safekeeping Incoming" / "Safekeeping Outgoing".
//   MERGED (2026-09-02) — one "SOH" / "Incoming" / "Outgoing", warehouse and
//          safekeeping distinguished only by the Project Origin column.
//
// The COLUMNS are identical in both; only the division differs. Both are reduced to
// the same six row sets here, and everything downstream is layout-blind.
//
// WHICH SIGNAL DIVIDES THEM MATTERS, and the answer is not the same in each shape.
// In the merged workbook Project Origin is the only signal there is. In the split
// workbook the SHEET is authoritative and Project Origin is merely provenance —
// "CW Incoming" holds 53 rows whose origin is a project, and they are real warehouse
// receipts (a site transferring a concrete rack or rockwool INTO warehouse ownership),
// while "Safekeeping Outgoing" holds 7 rows whose origin is the warehouse and every
// one is a safekeeping pull-out. Partitioning the split workbook by Project Origin
// would therefore misfile all 60 of them. The warehouse's own filing is the fact;
// the origin column is where the material came from, not who owns it now.
// ---------------------------------------------------------------------------
const SPLIT = has('CW SOH')

// SOH sheets: row 1 is "As of: <date>", row 2 the header, data from row 3.
const sohRows = (name) =>
  sheet(name).slice(2)
    .filter((r) => clean(r[2]))
    .map((r) => ({
      origin: clean(r[1]), code: clean(r[2]), desc: clean(r[3]), desc2: clean(r[4]), uom: clean(r[5]),
      boh: num(r[6]), qin: num(r[7]), qout: num(r[8]), soh: num(r[9]),
      // The moving class sits in one of two trailing columns depending on the export;
      // the later one is better populated, so prefer it and fall back.
      remarks: clean(r[14]), moving: clean(r[21]) || clean(r[20]),
    }))

const movementRows = (name) =>
  sheet(name).slice(1)
    .filter((r) => clean(r[1]))
    .map((r) => ({
      origin: clean(r[1]), dest: clean(r[2]), date: clean(r[3]), docRef: clean(r[4]),
      category: clean(r[5]), code: clean(r[6]), desc: clean(r[7]), desc2: clean(r[8]),
      uom: clean(r[9]), qty: num(r[10]), cls: clean(r[11]), cond: clean(r[12]), remarks: clean(r[13]),
    }))

const SNAPSHOT_DATE = (() => {
  const v = cell(sheet(SPLIT ? 'CW SOH' : 'SOH')[0]?.[2])
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  throw new Error('the SOH sheet\'s C1 cell does not hold the snapshot date')
})()

let warehouseRows, skStock, CW_IN, CW_OUT, SK_IN, SK_OUT
if (SPLIT) {
  warehouseRows = sohRows('CW SOH')
  skStock = sohRows('Safekeeping SOH')
  CW_IN = movementRows('CW Incoming')
  CW_OUT = movementRows('CW Outgoing')
  SK_IN = movementRows('Safekeeping Incoming')
  SK_OUT = movementRows('Safekeeping Outgoing')
} else {
  const SOH = sohRows('SOH')
  warehouseRows = SOH.filter((r) => r.origin === WAREHOUSE)
  skStock = SOH.filter((r) => r.origin !== WAREHOUSE)
  const INCOMING = movementRows('Incoming')
  const OUTGOING = movementRows('Outgoing')
  CW_IN = INCOMING.filter((r) => r.origin === WAREHOUSE)
  CW_OUT = OUTGOING.filter((r) => r.origin === WAREHOUSE)
  SK_IN = INCOMING.filter((r) => r.origin !== WAREHOUSE)
  SK_OUT = OUTGOING.filter((r) => r.origin !== WAREHOUSE)
}

// ---------------------------------------------------------------------------
// LOCATIONS — the genuinely new thing in this workbook.
//
// The hidden "Item per location bin" sheet addresses each line as AREA-Rn-LL-BBB:
// warehouse area, rack within that area, beam level, bay. Those areas and rack
// counts are the same ones the floor plan was already drawn from, which is what
// makes the two line up (MEPF has racks R1-R3, STRUC and ARCHI one each, and the
// bay numbers stop at 13 on MEPF R1 — exactly the long run against the west wall).
//
// The column is not clean: ~10% of its cells hold a movement class ("non moving")
// or "No data" where a location was never recorded, so anything that does not begin
// with a known area name is discarded rather than stored as a location.
// ---------------------------------------------------------------------------
const AREA_CODES = ['MEPF', 'STRUC', 'ARCHI', 'HIGH VALUE', 'TILES AREA', 'CAGE', 'YARD']
const LOCATION_RE = new RegExp(`^(${AREA_CODES.join('|')})(?:-R(\\d+)-(\\d+)-(\\d+))?$`, 'i')

const parseLocation = (raw) => {
  const m = LOCATION_RE.exec(raw.replace(/\s+/g, ' ').trim())
  if (!m) return null
  const area = m[1].toUpperCase()
  return {
    raw: m[2] ? `${area}-R${m[2]}-${m[3]}-${m[4]}` : area,
    area,
    rack: m[2] ? `R${m[2]}` : '',
    level: m[3] ? Number(m[3]) : 0,
    bay: m[4] ? Number(m[4]) : 0,
  }
}

// The location sheet is NOT in every export — the 2026-09-07 workbook dropped it
// again. Where it is absent the addresses are carried forward from the previous
// snapshot rather than discarded (see LOCATION_CARRIED below): a pallet does not
// move because a spreadsheet tab was left out of this week's file, and throwing 787
// real bin addresses away would silently return the floor plan to guessing.
const HAS_LOCATION_SHEET = has('Item per location bin')
const LOCATION_CARRIED = !HAS_LOCATION_SHEET

const locBins = new Map() // project|code|desc2 -> [parsed location, ...]
if (HAS_LOCATION_SHEET) {
  for (const r of sheet('Item per location bin').slice(1)) {
    const loc = parseLocation(clean(r[9]))
    if (!loc) continue
    const key = `${clean(r[1])}|${clean(r[2])}|${clean(r[4]).toUpperCase()}`
    if (!locBins.has(key)) locBins.set(key, [])
    const list = locBins.get(key)
    if (!list.some((l) => l.raw === loc.raw)) list.push(loc)
  }
}
// A line spread over several bays is stored in reading order, so the "primary" bin
// is the lowest-numbered one rather than whichever row the sheet happened to list first.
for (const list of locBins.values()) {
  list.sort((a, b) => a.area.localeCompare(b.area) || a.rack.localeCompare(b.rack) || a.level - b.level || a.bay - b.bay)
}

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------
const { ITEM_MASTER } = await load('itemMaster.js')
const { PROJECTS } = await load('projects.js')
const master = new Map(ITEM_MASTER.map((r) => [r.c, r]))

// The item master speaks a slightly wider vocabulary than the app's own taxonomy in
// src/data/trades.js, and the app's filters and charts are built from that taxonomy —
// a value outside it silently becomes an unfilterable category. These two mappings are
// the conventions the previous snapshot already used, kept so the same item does not
// change category between one month and the next:
//   "Asset"     — the master's word for equipment the warehouse issues and gets back.
//                 The app calls that Reusable, opposite Consumable.
//   "Drywalls"  — partition and ceiling framing (metal studs, hangers). The app's
//                 Architectural groups have no drywall entry; these are the framing
//                 that carries a ceiling, which is where the July snapshot put them.
const MATERIAL_TYPE = { Asset: 'Reusable' }
const ITEM_GROUP = { Drywalls: 'Ceiling' }
const materialTypeOf = (m) => MATERIAL_TYPE[m?.m] ?? m?.m ?? 'Consumable'
const itemGroupOf = (m) => ITEM_GROUP[m?.g] ?? m?.g ?? ''

// PRICE and CONDITION CLASS: carried forward from the previous snapshot.
//
// The September SOH sheet has no price column at all, and the price column on the
// location sheet is broken — it repeats one figure across unrelated items (₱324,821
// for both a fluorescent tube and a coil of THHN wire) and prices ¾-inch teflon tape
// at ₱120,535 a roll against ₱6.25 in July. Valuing the warehouse off it gives
// ₱973M against ₱100M in July, and the overstatement is concentrated in twelve lines
// that account for 86% of it: the signature of a lookup that has slipped its rows.
// So the previous snapshot's prices are carried forward, matched on item code plus
// specific description and then on item code alone, and lines it cannot price are
// left at zero — which the app already reports as "no price recorded" rather than
// as free stock.
const prevInventory = await load('inventory.js').then((m) => m.inventory).catch(() => [])
const prevSk = await load('safekeepingSheets.js').then((m) => m.SOH_ROWS).catch(() => [])

const key2 = (code, desc2) => `${code}|${String(desc2 || '').toUpperCase()}`
const priceByKey = new Map(), priceByCode = new Map()
const classByKey = new Map(), classByCode = new Map()
const locByKey = new Map(), locByCode = new Map()
for (const r of prevInventory) {
  if (r.unitPrice > 0) {
    priceByKey.set(key2(r.itemCode, r.detailedDescription), r.unitPrice)
    if (!priceByCode.has(r.itemCode)) priceByCode.set(r.itemCode, r.unitPrice)
  }
  if (r.conditionClass) {
    classByKey.set(key2(r.itemCode, r.detailedDescription), r.conditionClass)
    if (!classByCode.has(r.itemCode)) classByCode.set(r.itemCode, r.conditionClass)
  }
  // Only consulted when this workbook carries no location sheet of its own.
  if (r.location) {
    locByKey.set(key2(r.itemCode, r.detailedDescription), { raw: r.location, count: r.binCount || 1 })
    if (!locByCode.has(r.itemCode)) locByCode.set(r.itemCode, { raw: r.location, count: r.binCount || 1 })
  }
}
for (const r of prevSk) {
  if (r.class && !classByKey.has(key2(r.itemCode, r.detailedDescription))) {
    classByKey.set(key2(r.itemCode, r.detailedDescription), r.class)
  }
}
// This workbook's own movement rows carry a class per item code — a second source for
// codes the previous snapshot never held.
const classFromMovement = new Map()
for (const r of [...CW_IN, ...CW_OUT, ...SK_IN, ...SK_OUT]) {
  const c = r.cls.toUpperCase()
  if (r.code && /^[ABC]$/.test(c) && !classFromMovement.has(r.code)) classFromMovement.set(r.code, c)
}

const priceFor = (code, desc2) => priceByKey.get(key2(code, desc2)) ?? priceByCode.get(code) ?? 0
const classFor = (code, desc2) =>
  classByKey.get(key2(code, desc2)) ?? classFromMovement.get(code) ?? classByCode.get(code) ?? ''

// BRAND: read out of the specific description, which is written as dot-separated
// segments with the manufacturer usually second ("FLOURESCENT TUBE.PHILIPS.36WATTS").
// The vocabulary is the set the previous snapshot already recognised, so brands stay
// spelled the way the app has always shown them.
const BRANDS = [...new Set(prevInventory.map((r) => r.brand).filter(Boolean))]
const brandFor = (desc2) => {
  const up = ` ${desc2.toUpperCase().replace(/[.,/()]/g, ' ')} `
  for (const b of BRANDS) if (up.includes(` ${b.toUpperCase()} `)) return b
  return ''
}

// PROJECT CODES: filled only where the sheet's project name matches the project
// master exactly. The sheet writes names loosely ("Avesta Residence" against
// "Avesta Residences Gen Req & Tower 1", "Jab Residences" against "4PH Jab
// Greenwoods Dasmariñas") and guessing which project code a loose name means would
// attribute one site's material to another. Unmatched names keep the name and no code.
const projectByName = new Map(PROJECTS.map((p) => [p.name.toLowerCase(), p.code]))
const projectCodeFor = (name) => projectByName.get(String(name).toLowerCase()) ?? ''

// The safekeeping sheets used to carry a short trade code (ARCHI / STRUCT / MEPF /
// GEN REQ). The September workbook dropped it, so it is derived back from the item
// master's trade to keep the column meaningful rather than empty.
const SHORT_TRADE = {
  'Architectural Works': 'ARCHI', 'Structural Works': 'STRUCT', 'General Requirements': 'GEN REQ',
  'Electrical and Auxiliary Works': 'MEPF', 'Plumbing Works': 'MEPF', 'Mechanical Works': 'MEPF',
  'Fire Protection Works': 'MEPF', 'Site Works': 'STRUCT', 'Allied Services': 'GEN REQ',
}

// ---------------------------------------------------------------------------
// The movement ledger — warehouse-owned rows only.
//
// `off` is days before the snapshot date, matching lastMovementOffset on the stock
// rows, so 0 is the most recent movement on record.
// ---------------------------------------------------------------------------
const snapshotMs = Date.parse(`${SNAPSHOT_DATE}T00:00:00Z`)
const offsetOf = (iso) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  return Math.round((snapshotMs - Date.parse(`${iso}T00:00:00Z`)) / 86400000)
}

const ledgerFrom = (rows, dir) =>
  rows
    .map((r) => ({ r, off: offsetOf(r.date) }))
    // Undated rows are dropped rather than parked on an invented day, which would put
    // volume the warehouse never moved into whichever bucket the guess landed in.
    .filter((x) => x.off !== null && x.off >= 0)
    .map(({ r, off }) => ({
      dir, off, c: r.code, d: r.desc || r.desc2, q: r.qty, u: r.uom.toUpperCase(),
      p: dir === 'in' ? r.origin : r.dest, r: r.docRef,
      cls: r.cls.toUpperCase(), cond: r.cond ? r.cond[0].toUpperCase() + r.cond.slice(1).toLowerCase() : '',
    }))

const LEDGER = [...ledgerFrom(CW_IN, 'in'), ...ledgerFrom(CW_OUT, 'out')]
  .sort((a, b) => b.off - a.off)

const droppedLedger = CW_IN.length + CW_OUT.length - LEDGER.length

// Per-code movement facts, used to fill the stock rows below.
const ledgerByCode = new Map()
for (const r of LEDGER) {
  if (!r.c) continue
  if (!ledgerByCode.has(r.c)) ledgerByCode.set(r.c, [])
  ledgerByCode.get(r.c).push(r)
}

// ---------------------------------------------------------------------------
// WAREHOUSE STOCK
// ---------------------------------------------------------------------------
const IN_TRANSIT_WINDOW = 14 // days; matches the previous snapshot's definition

const inventory = warehouseRows.map((r, i) => {
  const m = master.get(r.code)
  const rnd = seeded(`${r.code}|${r.desc2}|${r.soh}`)

  const totalQty = r.soh
  const moves = ledgerByCode.get(r.code) ?? []
  const outs = moves.filter((x) => x.dir === 'out')

  // In-transit flows: a trailing slice of the ledger, NOT the sheet's period In/Out
  // totals. The sheet's columns are settled movement for the whole reporting window
  // and are already reflected in SOH; these two are what has moved recently.
  const recent = (dir) =>
    moves.filter((x) => x.dir === dir && x.off <= IN_TRANSIT_WINDOW).reduce((a, x) => a + x.q, 0)
  const incomingQty = Math.round(recent('in'))
  const outgoingQty = Math.round(recent('out'))

  // Reserved / damaged / min level have no source in any warehouse sheet.
  // Synthesized deterministically — see the note on seeded() above.
  const reservedQty = totalQty > 0 && rnd() < 0.5 ? Math.floor(totalQty * rnd() * 0.3) : 0
  const availableQty = totalQty - reservedQty
  const damagedQty = totalQty > 0 && rnd() < 0.28 ? Math.max(1, Math.floor(totalQty * rnd() * 0.04)) : 0
  const minLevel = 1 + Math.floor(rnd() * 20)

  // Last movement: real where the ledger reaches this code. Where it does not, the
  // sheet's own moving class is the next best evidence and is banded; where there is
  // neither, it is synthesized in the non-moving band and says so in the header.
  let lastMovementOffset
  if (moves.length) lastMovementOffset = Math.min(...moves.map((x) => x.off))
  else if (/fast/i.test(r.moving)) lastMovementOffset = Math.floor(rnd() * 30)
  else if (/slow/i.test(r.moving)) lastMovementOffset = 31 + Math.floor(rnd() * 60)
  else if (/non/i.test(r.moving)) lastMovementOffset = 180 + Math.floor(rnd() * 185)
  else lastMovementOffset = 120 + Math.floor(rnd() * 245)

  const unitPrice = priceFor(r.code, r.desc2)

  // Location: this workbook's own sheet where it has one, otherwise the address the
  // previous snapshot recorded for the same line.
  const bins = locBins.get(`${WAREHOUSE}|${r.code}|${r.desc2.toUpperCase()}`) ?? []
  let primary = bins[0] ?? null
  let binCount = bins.length
  if (!primary) {
    const carried = locByKey.get(key2(r.code, r.desc2)) ?? locByCode.get(r.code)
    if (carried) {
      primary = parseLocation(carried.raw)
      binCount = carried.count
    }
  }

  return {
    id: i + 1,
    itemCode: r.code,
    description: r.desc,
    detailedDescription: r.desc2,
    tradeL1: m?.t ?? '',
    tradeL2: itemGroupOf(m),
    materialType: materialTypeOf(m),
    uom: r.uom.toUpperCase(),
    totalQty,
    beginningQty: r.boh,
    periodIn: r.qin,
    periodOut: r.qout,
    unitPrice,
    // The sheet's own Discounted Price column is zero on every row, so it carries no
    // information; the previous snapshot's 35% write-down convention is kept instead.
    discountedPrice: round2(unitPrice * 0.35),
    conditionClass: classFor(r.code, r.desc2),
    availableQty,
    reservedQty,
    incomingQty,
    outgoingQty,
    damagedQty,
    minLevel,
    issueFrequency: outs.length,
    lastMovementOffset,
    // Recorded rack address where the workbook gives one. `location` is the address
    // as written; zone/rack/shelf/bin are its parts, kept because the schema and the
    // material profile already read those names.
    location: primary?.raw ?? '',
    binCount: primary ? binCount || 1 : 0,
    zone: primary?.area ?? '',
    rack: primary?.rack ?? '',
    shelf: primary?.level ? String(primary.level).padStart(2, '0') : '',
    bin: primary?.bay ? String(primary.bay).padStart(3, '0') : '',
    brand: brandFor(r.desc2),
    model: '',
    inventoryValue: round2(unitPrice * totalQty),
  }
})

// ---------------------------------------------------------------------------
// SAFEKEEPING — project-owned material held at the warehouse
// ---------------------------------------------------------------------------
const SOH_ROWS = skStock.map((r, i) => {
  const m = master.get(r.code)
  return {
    id: i + 1,
    refCode: `${r.origin}${r.code}`,
    project: r.origin,
    projectCode: projectCodeFor(r.origin),
    trade: SHORT_TRADE[m?.t] ?? '',
    tradeL1: m?.t ?? '',
    itemGroup: itemGroupOf(m),
    itemCode: r.code,
    description: r.desc,
    detailedDescription: r.desc2,
    uom: r.uom.toUpperCase(),
    boh: r.boh,
    in: r.qin,
    out: r.qout,
    soh: r.soh,
    // Safekeeping stock is the owning project's, not the warehouse's, and no sheet in
    // this workbook prices it. Left at zero rather than valued off warehouse prices.
    unitPrice: 0,
    class: classFor(r.code, r.desc2),
    remarks: r.remarks,
  }
})

const skLog = (rows) =>
  rows.map((r, i) => ({
    id: i + 1,
    project: r.origin,
    projectCode: projectCodeFor(r.origin),
    date: /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : '',
    docRef: r.docRef,
    category: r.category,
    itemCode: r.code,
    description: r.desc,
    detailedDescription: r.desc2,
    uom: r.uom.toUpperCase(),
    qty: r.qty,
    class: r.cls.toUpperCase(),
    condition: r.cond ? r.cond[0].toUpperCase() + r.cond.slice(1).toLowerCase() : '',
    remarks: r.remarks,
  }))
const INCOMING_ROWS = skLog(SK_IN)
const OUTGOING_ROWS = skLog(SK_OUT)

// ---------------------------------------------------------------------------
// Write the modules
// ---------------------------------------------------------------------------
const banner = (extra) => `// AUTO-GENERATED by scripts/import-snapshot.mjs from
// '${basename(srcPath)}' — do not hand-edit. Regenerate with:
//
//   npm run import -- "sample/<workbook>.xlsx"
//
${extra}`

const jsonLines = (rows) => rows.map((r) => `  ${JSON.stringify(r)}`).join(',\n')

writeFileSync(priv('inventory.js'), `${banner(`// Warehouse-owned stock: ${warehouseRows.length} lines from ${SPLIT ? 'sheet "CW SOH"' : 'the rows of sheet "SOH" whose Project Origin is the warehouse'}.
// Snapshot ${SNAPSHOT_DATE}.
//
// STRAIGHT FROM THE SHEET: item code, both descriptions, UOM, BOH / In / Out / SOH.
//
// FROM THE ITEM MASTER: trade, item group and material type. The sheet carries no
// Item Group or Trades column; the master resolves every code here.
//
// CARRIED FORWARD from the previous snapshot: unit price and condition class, which
// no sheet in this workbook carries. ${inventory.filter((r) => !r.unitPrice).length} lines could not be priced and sit at zero.
//
// STORAGE LOCATION on ${inventory.filter((r) => r.location).length} of them, ${LOCATION_CARRIED
  ? `CARRIED FORWARD from the previous snapshot — this workbook has no
// "Item per location bin" sheet, and a bin address does not stop being true because
// a tab was left out of one export. Lines new since then have none.`
  : `read from this workbook's own "Item per location bin" sheet.`}
//
// SYNTHESIZED, deterministically and stably per line: reserved, available, damaged,
// min level, and — for lines the ledger does not reach — last movement. Brand is read
// out of the specific description.
//
// Invariants enforced at generation time:
//   totalQty === availableQty + reservedQty
//   totalQty === beginningQty + periodIn - periodOut   (holds on every source row)
// damagedQty annotates stock counted inside totalQty; incomingQty / outgoingQty are
// unsettled flows from the trailing ${IN_TRANSIT_WINDOW} days of the ledger.`)}
export const WAREHOUSE = '${WAREHOUSE}';
export const SNAPSHOT_DATE = '${SNAPSHOT_DATE}';
export const inventory = [
${jsonLines(inventory)}
];
`, 'utf8')

writeFileSync(priv('ledger.js'), `${banner(`// The warehouse's OWN movement, from ${SPLIT ? 'sheets "CW Incoming" and "CW Outgoing"' : 'the rows of "Incoming" / "Outgoing" whose Project Origin is the warehouse'}.
// Project-owned movement is in safekeepingSheets.js instead — the same division the
// stock rows use, so a line's stock and its movement never land on opposite sides.
//
// \`off\` is days before the snapshot date (${SNAPSHOT_DATE}), the same base as
// lastMovementOffset in inventory.js, so 0 is the most recent movement on record.
// Keys are short because this file ships to the browser:
//   dir = 'in' | 'out', off = day offset, c = item code, d = description,
//   q = quantity, u = UOM, p = counterparty project, r = document reference,
//   cls = condition class, cond = condition
//
// ${droppedLedger} warehouse row(s) carry no usable date and are omitted rather than parked on
// an invented day. In: ${LEDGER.filter((r) => r.dir === 'in').length}, out: ${LEDGER.filter((r) => r.dir === 'out').length}.`)}
export const LEDGER = [
${jsonLines(LEDGER)}
];
`, 'utf8')

writeFileSync(priv('safekeepingSheets.js'), `${banner(`// Project-owned material held at the warehouse, from ${SPLIT
  ? 'the three "Safekeeping …" sheets'
  : 'the rows of "SOH" / "Incoming" / "Outgoing" whose Project Origin is not the warehouse'}.
// Snapshot ${SNAPSHOT_DATE}.
//   SOH ${SOH_ROWS.length} rows, Incoming ${INCOMING_ROWS.length}, Outgoing ${OUTGOING_ROWS.length}.
//
// Caveats kept rather than papered over:
//  * No sheet in this workbook prices safekeeping stock, so unitPrice is 0 throughout
//    and the Discounted Price column is dropped entirely.
//  * ${INCOMING_ROWS.filter((r) => !r.itemCode).length} of ${INCOMING_ROWS.length} Incoming and ${OUTGOING_ROWS.filter((r) => !r.itemCode).length} of ${OUTGOING_ROWS.length} Outgoing rows have NO item code; those
//    lines are identified only by their specific description.
//  * Sheet project names are written loosely and mostly do not match the project
//    master. projectCode is filled ONLY on an exact match (${SOH_ROWS.filter((r) => r.projectCode).length} of ${SOH_ROWS.length} SOH rows) and
//    left blank otherwise, rather than guessing one site's code onto another's stock.
//  * The sheet's short trade code was dropped in this workbook; \`trade\` is derived
//    back from the item master's trade.`)}
export const SOH_ROWS = [
${jsonLines(SOH_ROWS)}
];

export const INCOMING_ROWS = [
${jsonLines(INCOMING_ROWS)}
];

export const OUTGOING_ROWS = [
${jsonLines(OUTGOING_ROWS)}
];
`, 'utf8')

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const money = (n) => '₱' + Math.round(n).toLocaleString('en-PH')
const val = inventory.reduce((a, r) => a + r.inventoryValue, 0)
const prevVal = prevInventory.reduce((a, r) => a + (r.inventoryValue || 0), 0)
const placed = inventory.filter((r) => r.location).length

console.log(`\nSnapshot ${SNAPSHOT_DATE}  <-  ${basename(srcPath)}\n`)
console.log(`  inventory            ${String(inventory.length).padStart(5)} lines   (was ${prevInventory.length})`)
console.log(`  ledger               ${String(LEDGER.length).padStart(5)} rows    in ${LEDGER.filter((r) => r.dir === 'in').length} / out ${LEDGER.filter((r) => r.dir === 'out').length}, ` +
  `spanning ${Math.max(...LEDGER.map((r) => r.off))}..${Math.min(...LEDGER.map((r) => r.off))} days back`)
console.log(`  safekeeping_soh      ${String(SOH_ROWS.length).padStart(5)} lines   (was ${prevSk.length})`)
console.log(`  safekeeping_incoming ${String(INCOMING_ROWS.length).padStart(5)} rows`)
console.log(`  safekeeping_outgoing ${String(OUTGOING_ROWS.length).padStart(5)} rows`)
console.log(`\n  valuation            ${money(val)}   (previous snapshot ${money(prevVal)})`)
console.log(`  unpriced lines       ${inventory.filter((r) => !r.unitPrice).length}  holding ${inventory.filter((r) => !r.unitPrice).reduce((a, r) => a + r.totalQty, 0).toLocaleString()} units`)
console.log(`  no condition class   ${inventory.filter((r) => !r.conditionClass).length}`)
console.log(`  ${LOCATION_CARRIED ? 'location (CARRIED)' : 'recorded location  '}  ${placed} of ${inventory.length} (${Math.round(placed / inventory.length * 100)}%), ` +
  `${inventory.filter((r) => r.binCount > 1).length} spread over several bays`)
if (LOCATION_CARRIED) {
  console.log(`                       ^ this workbook has NO "Item per location bin" sheet;`)
  console.log(`                         the addresses above are the previous snapshot's.`)
}
console.log(`  units on hand        ${inventory.reduce((a, r) => a + r.totalQty, 0).toLocaleString()}`)

const byArea = new Map()
for (const r of inventory) if (r.zone) byArea.set(r.zone, (byArea.get(r.zone) || 0) + 1)
console.log(`\n  lines per recorded area: ${[...byArea].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`)

const unmatchedProjects = [...new Set(SOH_ROWS.filter((r) => !r.projectCode).map((r) => r.project))]
if (unmatchedProjects.length) console.log(`\n  project names with no code in the master: ${unmatchedProjects.join(', ')}`)
console.log(`\nNext: npm run seed\n`)
