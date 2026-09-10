// Delivery Tracker — Gantt model.
//
// The tracker card used to be one flat table of the "Warehouse Schedule" sheet. This
// module turns that schedule into a timeline by joining it to the two things the sheet
// itself does not carry: what is already ON HAND, and what has ALREADY moved.
//
//   PLAN     src/data/deliveryTracker.js  — 27 scheduled deliveries (material x project
//            x batch), each with a target date or a free-text estimate. Future-facing.
//   ACTUAL   src/data/safekeeping.js      — `incoming` and `outgoing`, every recorded
//            receipt and pullout with a real date, a document reference and a real
//            item code. Past-facing.
//   OPENING  src/data/safekeeping.js      — `soh`, whose `boh` column is the beginning
//            on-hand figure the left-hand BOH column reports.
//
// Both sides describe the same warehouse (Taytay Central), the same five projects and
// the same materials, so the join is a real one rather than a convenience. The tracker
// names its projects by an informal code and its materials by an informal string; the
// safekeeping sheets name projects loosely and materials by item code. SK_PROJECT_KEY
// and MATERIAL_MAP.sk (in deliveryTracker.js) are the two bridges.
//
// ---------------------------------------------------------------------------
// WHY THE In / Out COLUMNS ARE DERIVED FROM THE BARS
//
// The requirement is that every bar carries a number and those numbers sum to the row's
// In / Out column. That can only hold if the columns ARE the sum of the bars, so they
// are computed here from the bar list and never read from the safekeeping sheet's own
// `in` / `out` totals.
//
// That is not a stylistic choice. Checked against the 2026-09-07 snapshot, the SOH
// sheet's own `in` disagrees with the sum of its dated Incoming rows on 29 of 67
// project+code pairs — Avesta's formwork lines carry an `in` total with no dated rows
// behind it at all, and Jab's wiring devices carry the same quantity as `boh` instead.
// Those totals cover a different period from the dated sheets. Presenting the sheet
// total next to bars that add up to something else would show an arithmetic error on
// the face of the card.
//
// ---------------------------------------------------------------------------
// AND WHY BOH IS DERIVED TOO
//
// The sheet's own `boh` column cannot be used either, and this one is a trap worth
// spelling out. For Jab's wiring devices the safekeeping sheet reports boh = 10,064
// with in = 0 — while the Incoming sheet separately carries 10,064 dated units of the
// same six codes. Both describe ONE arrival. Taking the sheet's boh and then adding
// the dated receipts on top counts that stock twice, and the first build of this card
// did exactly that: BOH 10,064 + In 10,064 = EOH 20,028 for stock that only ever
// arrived once.
//
// The sheet's "beginning" is the start of ITS period, which is not the start of this
// timeline. What the left-hand edge of a Gantt needs is the position before the first
// bar on it, so BOH is wound back from the sheet's closing position instead:
//
//     BOH = sheet SOH - (every dated receipt) + (every dated pullout)
//
// which makes the whole row reconcile: at the right-hand end of the timeline,
// EOH = sheet SOH + everything still scheduled. Jab's wiring devices come out at
// BOH 0 — correct, the stock was not there before the window, it arrived inside it.
//
// Where the sheet's totals and its dated rows disagree badly enough that this goes
// NEGATIVE, the value is clamped to zero and the row is flagged `bohAdjusted`; the
// card shows a marker and the tooltip says the source does not reconcile. Hiding it
// silently would be the one unacceptable option.
// ---------------------------------------------------------------------------

import { deliveryRows } from './deliveryTracker'
import { soh, incoming, outgoing } from './safekeeping'
import { TODAY } from '../lib/format'

// ---------------------------------------------------------------------------
// Project bridge. The tracker's own sheet code is the only stable key the two sides
// share; each value is a lower-case substring test against the safekeeping sheet's
// free-text project name. Verified unique against the 11 project names in the
// safekeeping sheets — no keyword matches two projects.
export const SK_PROJECT_KEY = {
  AVESTA: 'avesta',
  JABS: 'jab',
  JENARA: 'jenara',
  STREVI: 'strevi',
  Southscape: 'southscape',
}

const DAY = 86400000

export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1)
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1)

// ---------------------------------------------------------------------------
// QUANTITY. The sheet's Qty column is free text: a plain number on most rows, "TBC"
// where the count is not yet agreed, and a product ("207 * 7", against a "Sets * Items"
// UOM) where a count of sets is given alongside the pieces per set.
//
// The product is multiplied out, because the UOM says the second figure is items per
// set and the piece count is what occupies floor space. The source string is always
// kept so a bar's tooltip can show what was actually written.
export function parseQty(raw) {
  const s = String(raw ?? '').trim()
  if (!s || /^tbc$/i.test(s)) return { value: null, raw: s || 'TBC', tbc: true }
  const parts = s.split('*').map((p) => Number(p.replace(/[^0-9.]/g, '')))
  if (parts.length > 1 && parts.every((n) => Number.isFinite(n) && n > 0)) {
    return { value: parts.reduce((a, b) => a * b, 1), raw: s, tbc: false, product: parts }
  }
  const n = Number(s.replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) && n > 0
    ? { value: n, raw: s, tbc: false }
    : { value: null, raw: s, tbc: true }
}

// ---------------------------------------------------------------------------
// TARGET SPAN. A bar's LENGTH is the precision of the commitment, which is the one
// honest reading available: a firm date covers a single day, "First Week August 2026"
// covers seven, "August, 2026" covers the whole month. A wide bar therefore means a
// vague promise, not a long delivery — and that is worth seeing.
//
// Spans are half-open, [start, end), so a single day is exactly one day wide and two
// adjacent months do not overlap by an instant.
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december']
const WEEK_INDEX = { first: 0, second: 1, third: 2, fourth: 3, last: 4 }

export function targetSpan(r) {
  if (r.targetDate) {
    const d = new Date(`${r.targetDate}T00:00:00`)
    return { start: d, end: addDays(d, 1), precision: 'day', firm: true }
  }
  const t = String(r.targetText || '').trim()
  if (!t) return null

  let m = t.match(/^(first|second|third|fourth|last)\s+week\s+([a-z]+)\s+(\d{4})/i)
  if (m) {
    const mi = MONTHS.indexOf(m[2].toLowerCase())
    if (mi >= 0) {
      const wi = WEEK_INDEX[m[1].toLowerCase()]
      const first = new Date(Number(m[3]), mi, 1)
      const monthEnd = addMonths(first, 1)
      // "Last week" is the final seven days of the month, whatever its length; the
      // other four are fixed 1-7 / 8-14 / 15-21 / 22-28 windows.
      const start = wi === 4 ? addDays(monthEnd, -7) : addDays(first, wi * 7)
      const end = wi === 4 ? monthEnd : addDays(start, 7)
      return { start, end, precision: 'week', firm: false }
    }
  }

  m = t.match(/^mid\s+([a-z]+)\s+(\d{4})/i)
  if (m) {
    const mi = MONTHS.indexOf(m[1].toLowerCase())
    // "Mid September" is read as the middle third of the month, days 11-20.
    if (mi >= 0) {
      const start = new Date(Number(m[2]), mi, 11)
      return { start, end: new Date(Number(m[2]), mi, 21), precision: 'mid', firm: false }
    }
  }

  m = t.match(/^([a-z]+),?\s+(\d{4})/i)
  if (m) {
    const mi = MONTHS.indexOf(m[1].toLowerCase())
    if (mi >= 0) {
      const start = new Date(Number(m[2]), mi, 1)
      return { start, end: addMonths(start, 1), precision: 'month', firm: false }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// FLOOR-AREA ESTIMATE — PROVISIONAL. Flagged as such on the card itself.
//
// The rack side of the arithmetic is real, taken from the same warehouse drawing the
// Floor Plan module is built from (see src/data/warehouseMap.js):
//
//   * A Type B bay is 3300 mm on centres and a rack run measures 17 raster px deep at
//     ~76 mm/px, i.e. ~1.29 m. One bay's own footprint is therefore ~4.26 m2.
//   * Racks are five levels, so five stored positions share that one footprint:
//     ~0.85 m2 of floor per position.
//   * The drawing's back-to-back pairs sit on an 86 px pitch over 34 px of rack, so
//     gross floor per net rack footprint is 86/34 = 2.53x once the aisle is counted.
//
// What is NOT real is UNITS_PER_PALLET: nothing in any source workbook records a pack
// size, a carton count or a pallet configuration, so these are estimates by material.
// They are the single thing to replace once the warehouse team supplies real pack data;
// every figure the capacity window shows is linear in them.
const BAY_M2 = (3300 / 1000) * (1292 / 1000)   // 4.26 m2 — one Type B bay's footprint
const RACK_LEVELS = 5                           // Interlock 600, five beam levels
const AISLE_FACTOR = 86 / 34                    // 2.53x, measured off the plan's rack pitch
export const M2_PER_POSITION = (BAY_M2 / RACK_LEVELS) * AISLE_FACTOR  // ~2.16 m2

// Units that fit one pallet position, on a 1.2 x 1.0 m pallet. Keyed by the tracker's own
// material name, with a UOM fallback for anything unmapped.
//
// PROVISIONAL — THIS TABLE IS THE THING TO REPLACE. Nothing in any source workbook
// records a pack size, a carton count or a pallet configuration, so each line below is a
// judgement about how the material is normally packed, not a measurement. Every square
// metre the capacity window reports is inversely proportional to these numbers, so a
// wrong pack size here is the single largest error in the estimate: halving the kitchen
// cabinet figure doubles its floor claim on its own.
//
// Ask the warehouse team to correct them line by line. The window's tooltip prints the
// value it used for each material next to the positions it produced, so a wrong one is
// visible on the card rather than buried here.
const UNITS_PER_PALLET = {
  'Rebar Coupler & Accessories': 1500, // small grouted steel sleeves, bulk-boxed
  'Kitchen Cabinet': 4,                // carcass sets, assumed flat-packed
  Sealant: 900,                        // ~24 tubes a carton, ~38 cartons a pallet
  Aluminum: 8,                         // glazed window/door sets, racked on edge
  'Plumbing Fixtures': 24,             // mixed sanitary ware; water closets set the floor
  'Wiring Devices': 2000,              // switches, outlets and plates, boxed
  'Wooden Door': 20,                   // door leaves, stacked flat
}
const UNITS_PER_PALLET_BY_UOM = { SET: 10, SETS: 10, PC: 300, PCS: 300, TUBE: 900, TUBES: 900, LM: 500 }
const DEFAULT_UNITS_PER_PALLET = 200

export const unitsPerPallet = (materialName, uom) =>
  UNITS_PER_PALLET[materialName]
  || UNITS_PER_PALLET_BY_UOM[String(uom || '').toUpperCase()]
  || DEFAULT_UNITS_PER_PALLET

// ---------------------------------------------------------------------------
// BAR CONSTRUCTION

const norm = (s) => String(s || '').toLowerCase()

// Does a safekeeping row describe this tracker material? Keyword match against both
// description columns, minus the explicit near-misses.
const skMatches = (row, keys, not) => {
  if (!keys || !keys.length) return false
  const hay = `${norm(row.description)} ${norm(row.detailedDescription)}`
  if (not && not.some((n) => hay.includes(n))) return false
  return keys.some((k) => hay.includes(k))
}

// One bar per (document reference, date). A DR number IS one delivery event, which is
// exactly what a bar should represent — grouping by it collapses the 20-odd separate
// lines of a single truckload into the one arrival a reader cares about, instead of
// stacking twenty unreadable slivers on the same day.
function actualBars(rows, lane) {
  const groups = new Map()
  for (const r of rows) {
    if (!r.date) continue
    const day = startOfDay(r.date)
    const key = `${r.docRef || '(no ref)'}|${day.getTime()}`
    let g = groups.get(key)
    if (!g) {
      g = {
        kind: 'actual', lane, start: day, end: addDays(day, 1),
        qty: 0, tbc: false, docRef: r.docRef || '', codes: new Set(), lines: 0,
        uom: r.uom || '', precision: 'day', firm: true,
      }
      groups.set(key, g)
    }
    g.qty += Number(r.qty) || 0
    g.lines += 1
    if (r.itemCode) g.codes.add(r.itemCode)
  }
  return [...groups.values()]
    .map((g) => ({ ...g, codes: [...g.codes], label: g.docRef || 'Recorded movement' }))
    .sort((a, b) => a.start - b.start)
}

// ---------------------------------------------------------------------------
// ROW MODEL. One row per material x project — the grain the schedule is actually
// managed at, since a batch number only means anything inside a project. Each row
// carries two lanes; the incoming lane holds recorded receipts up to today and
// scheduled deliveries after it, the outgoing lane holds recorded pullouts only.
//
// THERE IS NO PLANNED-OUTGOING DATA ANYWHERE IN THIS SYSTEM. No workbook, table or
// sheet schedules a release out of the warehouse, so the outgoing lane is empty to the
// right of the now line on every row. The card says so rather than leaving a reader to
// conclude that nothing is due to leave.
// Leaf rows: one per material x project. These are what the safekeeping join is done
// against, because a project is what identifies a batch and what the safekeeping sheets
// are keyed by. They are returned as the CHILDREN of a material — see buildGanttRows.
function buildLeafRows() {
  const byKey = new Map()

  for (const d of deliveryRows) {
    const key = `${d.materialName}|${d.projectCode || d.project}`
    let row = byKey.get(key)
    if (!row) {
      row = {
        key,
        materialName: d.materialName,
        brand: d.brand,
        matDetail: d.matDetail,
        matchKey: d.matchKey,
        skKeys: d.skKeys || [],
        skNot: d.skNot || [],
        project: d.project,
        projectCode: d.projectCode || '',
        isChild: true,
        trade: d.trade,
        uom: '',
        planned: [],
        codes: [],
        boh: 0,
        sohLines: 0,
      }
      byKey.set(key, row)
    }
    const q = parseQty(d.qty)
    const span = targetSpan(d)
    row.planned.push({
      kind: 'planned', lane: 'in',
      start: span ? span.start : null,
      end: span ? span.end : null,
      precision: span ? span.precision : 'none',
      firm: span ? span.firm : false,
      qty: q.value, tbc: q.tbc, qtyRaw: q.raw, product: q.product || null,
      label: d.batch || 'Batch', batch: d.batch, no: d.no,
      uom: d.uom && d.uom !== 'TBC' ? d.uom : '',
      status: d.status, location: d.location,
      opsRemarks: d.opsRemarks, prcRemarks: d.prcRemarks, dpPayment: d.dpPayment,
      targetText: d.targetText, targetDate: d.targetDate,
    })
    if (!row.uom && d.uom && d.uom !== 'TBC') row.uom = d.uom
  }

  // Join each row to its safekeeping stock and movement.
  for (const row of byKey.values()) {
    const pk = SK_PROJECT_KEY[row.projectCode]
    if (!pk) { row.planned.sort(byStart); finalise(row); continue }
    const mine = (r) => norm(r.project).includes(pk) && skMatches(r, row.skKeys, row.skNot)

    const sohRows = soh.filter(mine)
    row.sheetBoh = sohRows.reduce((a, r) => a + (Number(r.boh) || 0), 0)
    row.sohLines = sohRows.length
    row.sheetIn = sohRows.reduce((a, r) => a + (Number(r.in) || 0), 0)
    row.sheetOut = sohRows.reduce((a, r) => a + (Number(r.out) || 0), 0)
    row.sheetSoh = sohRows.reduce((a, r) => a + (Number(r.soh) || 0), 0)

    const incRows = incoming.filter(mine)
    const outRows = outgoing.filter(mine)
    row.actualIn = actualBars(incRows, 'in')
    row.actualOut = actualBars(outRows, 'out')

    const codes = new Set()
    for (const r of [...sohRows, ...incRows, ...outRows]) if (r.itemCode) codes.add(r.itemCode)
    row.codes = [...codes].sort()
    row.itemGroup = sohRows.find((r) => r.itemGroup)?.itemGroup || ''
    if (!row.uom) row.uom = sohRows[0]?.uom || incRows[0]?.uom || ''
    row.planned.sort(byStart)
    finalise(row)
  }

  return [...byKey.values()]
}

// ---------------------------------------------------------------------------
// PARENT ROWS — one per MATERIAL, holding its projects as children.
//
// The schedule is read material-first ("where are the couplers up to?") and only then
// project-by-project, so the material is the row and the project is the detail. A
// material delivered to four sites was previously four unrelated rows with the same
// name; now it is one row that opens.
//
// Every parent figure is the SUM of its children — BOH, In, Out, EOH — and its bar
// lists are their concatenation, so the parent states exactly what its children state
// and the two can never disagree. Bars that would collide on the parent's single track
// are merged for DRAWING only (see packTrack in DeliveryGantt.jsx); the arithmetic here
// is untouched by that.
//
// A material held for only one project still gets a parent row, but is not expandable:
// opening it would show one child identical to the row above it.
// `keepLeaf` is the filter bar, applied to the material x project rows BEFORE they are
// grouped and summed. Filtering the parents instead — or trimming a parent's children
// afterwards — would leave a parent stating totals for projects it no longer shows.
export function buildGanttRows(keepLeaf) {
  const byMaterial = new Map()
  const leaves = keepLeaf ? buildLeafRows().filter(keepLeaf) : buildLeafRows()
  for (const leaf of leaves) {
    let p = byMaterial.get(leaf.materialName)
    if (!p) {
      p = {
        key: leaf.materialName,
        isParent: true,
        materialName: leaf.materialName,
        brand: leaf.brand,
        matDetail: leaf.matDetail,
        trade: leaf.trade,
        uom: leaf.uom,
        children: [],
      }
      byMaterial.set(leaf.materialName, p)
    }
    p.children.push(leaf)
    if (!p.uom && leaf.uom) p.uom = leaf.uom
  }

  const parents = [...byMaterial.values()]
  for (const p of parents) {
    p.children.sort((a, b) => (a.firstDate || Infinity) - (b.firstDate || Infinity) || a.project.localeCompare(b.project))
    p.expandable = p.children.length > 1
    p.projectCount = p.children.length
    p.projects = p.children.map((c) => c.project)

    const sum = (f) => p.children.reduce((a, c) => a + (Number(f(c)) || 0), 0)
    p.boh = sum((c) => c.boh)
    p.totalIn = sum((c) => c.totalIn)
    p.totalOut = sum((c) => c.totalOut)
    p.tbcIn = sum((c) => c.tbcIn)
    p.tbcOut = sum((c) => c.tbcOut)
    p.eoh = p.boh + p.totalIn - p.totalOut
    p.sheetSoh = sum((c) => c.sheetSoh)
    p.recordedIn = sum((c) => c.recordedIn)
    p.recordedOut = sum((c) => c.recordedOut)
    p.bohAdjusted = p.children.some((c) => c.bohAdjusted)

    // Concatenated, not recomputed: rowAt() and capacityAt() then give a parent exactly
    // the sum of its children at any cursor position, by construction.
    const cat = (f) => p.children.flatMap(f)
    p.planned = cat((c) => c.planned).sort(byStart)
    p.actualIn = cat((c) => c.actualIn).sort(byStart)
    p.actualOut = cat((c) => c.actualOut).sort(byStart)
    p.inBars = cat((c) => c.inBars).sort(byStart)
    p.outBars = cat((c) => c.outBars).sort(byStart)
    p.noDateBars = cat((c) => c.noDateBars)
    p.codes = [...new Set(cat((c) => c.codes))].sort()

    const all = [...p.inBars, ...p.outBars]
    p.firstDate = all.length ? Math.min(...all.map((b) => b.start.getTime())) : null
    p.lastDate = all.length ? Math.max(...all.map((b) => b.end.getTime())) : null
    p.plannedCount = sum((c) => c.plannedCount)
  }

  // Trade first (the schedule's own primary grouping), then earliest commitment, so a
  // reader scanning down meets the work in the order it lands.
  parents.sort((a, b) => a.trade.localeCompare(b.trade) || (a.firstDate || Infinity) - (b.firstDate || Infinity) || a.materialName.localeCompare(b.materialName))
  return parents
}

// Every row the chart draws, in order, with the expanded materials opened out. One list
// keeps the three panes and the row-height template in step — they all read this.
export function visibleRows(parents, expanded) {
  const out = []
  for (const p of parents) {
    out.push(p)
    if (p.expandable && expanded.has(p.key)) {
      for (const c of p.children) out.push(c)
    }
  }
  return out
}

const byStart = (a, b) => (a.start ? a.start.getTime() : Infinity) - (b.start ? b.start.getTime() : Infinity)

function finalise(row) {
  row.actualIn = row.actualIn || []
  row.actualOut = row.actualOut || []
  // Lane bar lists: recorded movement and schedule share the incoming lane.
  row.inBars = [...row.actualIn, ...row.planned.filter((p) => p.start)].sort(byStart)
  row.noDateBars = row.planned.filter((p) => !p.start)
  row.outBars = [...row.actualOut]

  const sum = (bars) => bars.reduce((a, b) => a + (b.qty || 0), 0)
  const tbc = (bars) => bars.filter((b) => b.tbc).length

  // The In / Out columns ARE the sum of their lane's bars — see the header note.
  row.totalIn = sum(row.inBars) + sum(row.noDateBars)
  row.totalOut = sum(row.outBars)
  row.tbcIn = tbc(row.inBars) + tbc(row.noDateBars)
  row.tbcOut = tbc(row.outBars)

  // BOH is the position before the FIRST bar on this timeline, wound back off the
  // sheet's closing SOH — see the header note on why the sheet's own boh column
  // double-counts. Only RECORDED movement is unwound; a scheduled delivery has not
  // happened yet and was never in the closing position to begin with.
  row.recordedIn = sum(row.actualIn)
  row.recordedOut = sum(row.actualOut)
  const bohRaw = (row.sheetSoh || 0) - row.recordedIn + row.recordedOut
  row.bohRaw = bohRaw
  row.bohAdjusted = bohRaw < 0
  row.boh = Math.max(0, bohRaw)
  row.eoh = row.boh + row.totalIn - row.totalOut

  const all = [...row.inBars, ...row.outBars]
  row.firstDate = all.length ? Math.min(...all.map((b) => b.start.getTime())) : null
  row.lastDate = all.length ? Math.max(...all.map((b) => b.end.getTime())) : null
  row.plannedCount = row.planned.length
  row.actualCount = row.actualIn.length + row.actualOut.length
  return row
}

// ---------------------------------------------------------------------------
// CURSOR ARITHMETIC
//
// The cursor is read as END of its own day, so a delivery dated on the cursor day is
// counted — which is how a warehouse states a position ("as of close of 7 September").
export const cursorEdge = (t) => addDays(startOfDay(t), 1).getTime()

// How much of a bar has landed by the cursor. A bar covering a whole month is counted
// pro rata, because the month is the only thing the source commits to and a reader
// dragging into the middle of it is asking "roughly how much by then". A firm-date bar
// spans one day, so the same arithmetic makes it all-or-nothing on its own.
export function barPortion(bar, edge) {
  if (!bar.start || bar.qty == null) return 0
  const s = bar.start.getTime()
  const e = bar.end.getTime()
  if (edge <= s) return 0
  if (edge >= e) return bar.qty
  return bar.qty * ((edge - s) / (e - s))
}

// Stock position for one row at the cursor: opening stock plus everything received,
// less everything issued, counted to that moment. Undated planned bars are excluded —
// a delivery with no target at all cannot be placed on the timeline, so it cannot be
// claimed to have arrived by any date either.
export function rowAt(row, cursor) {
  const edge = cursorEdge(cursor)
  const inQty = row.inBars.reduce((a, b) => a + barPortion(b, edge), 0)
  const outQty = row.outBars.reduce((a, b) => a + barPortion(b, edge), 0)
  return { inQty, outQty, eoh: row.boh + inQty - outQty, edge }
}

// ---------------------------------------------------------------------------
// CAPACITY WINDOW. Net inflow at the cursor, converted to pallet positions and then to
// floor area. "To be occupied" is read as the NET of the movement — what the schedule
// adds to the floor over and above what leaves it — which is the figure requirement 8
// names. Opening stock is reported alongside it, because the net alone does not answer
// "will it fit"; the two together do.
export function capacityAt(rows, cursor) {
  let netUnits = 0
  let netPallets = 0
  let heldPallets = 0
  let inUnits = 0
  let outUnits = 0
  const perRow = []

  for (const row of rows) {
    const { inQty, outQty, eoh } = rowAt(row, cursor)
    const upp = unitsPerPallet(row.materialName, row.uom)
    const net = inQty - outQty
    const pallets = net / upp
    netUnits += net
    inUnits += inQty
    outUnits += outQty
    netPallets += pallets
    heldPallets += Math.max(0, eoh) / upp
    perRow.push({ key: row.key, name: row.materialName, project: row.project, net, pallets, upp, eoh })
  }

  // Positions are whole: half a pallet still consumes a whole one. Rounded on the TOTAL
  // rather than per row, so a hundred part-pallets do not inflate into a hundred whole
  // ones. The net is rounded to nearest (it is a change, and ceiling its magnitude would
  // overstate space freed as readily as space taken); what is HELD is ceilinged, because
  // a part-full position is still a position nothing else can use.
  const netPositions = Math.round(netPallets)
  const heldPositions = Math.ceil(heldPallets)
  return {
    netUnits, inUnits, outUnits,
    netPallets, heldPallets,
    netPositions, heldPositions,
    netM2: netPositions * M2_PER_POSITION,
    heldM2: heldPositions * M2_PER_POSITION,
    perRow: perRow.sort((a, b) => Math.abs(b.pallets) - Math.abs(a.pallets)),
  }
}

// ---------------------------------------------------------------------------
// TIMELINE

export const TIMELINE_UNITS = [
  { value: 'quarter', label: 'Quarter', colWidth: 92 },
  { value: 'month', label: 'Month', colWidth: 74 },
  { value: 'week', label: 'Week', colWidth: 46 },
  { value: 'day', label: 'Day', colWidth: 30 },
]

const startOfWeek = (d) => {
  const s = startOfDay(d)
  // Monday-first, matching the sheet's "First Week August" counting from the 1st only
  // for its own labels; the grid itself uses calendar weeks.
  return addDays(s, -((s.getDay() + 6) % 7))
}
const startOfQuarter = (d) => new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1)

export const unitStart = (d, unit) => (
  unit === 'day' ? startOfDay(d)
    : unit === 'week' ? startOfWeek(d)
      : unit === 'month' ? startOfMonth(d)
        : startOfQuarter(d)
)

const unitNext = (d, unit) => (
  unit === 'day' ? addDays(d, 1)
    : unit === 'week' ? addDays(d, 7)
      : unit === 'month' ? addMonths(d, 1)
        : addMonths(d, 3)
)

// Every column in the window, each with its own start/end so a bar's pixel position is
// a continuous time scale rather than a column index — which is what keeps a one-day
// bar in the right place inside a quarter-wide column.
export function timelineTicks(from, to, unit) {
  const ticks = []
  let cur = unitStart(from, unit)
  let guard = 0
  while (cur < to && guard++ < 4000) {
    const next = unitNext(cur, unit)
    ticks.push({ start: cur, end: next, key: cur.getTime() })
    cur = next
  }
  return ticks
}

// The window the Gantt covers: every bar plus the now line, snapped out to whole
// columns and padded by one column at each end so the first and last bar are not
// pressed against the frame.
export function timelineRange(rows, unit, now = TODAY) {
  let lo = startOfDay(now).getTime()
  let hi = addDays(startOfDay(now), 1).getTime()
  for (const row of rows) {
    for (const b of [...row.inBars, ...row.outBars]) {
      lo = Math.min(lo, b.start.getTime())
      hi = Math.max(hi, b.end.getTime())
    }
  }
  const from = unitStart(new Date(lo), unit)
  const toRaw = unitStart(new Date(hi), unit)
  const to = unitNext(toRaw, unit)
  return { from: unitNext(from, unit) > from ? addPad(from, unit, -1) : from, to: addPad(to, unit, 1) }
}

const addPad = (d, unit, n) => {
  let cur = d
  for (let i = 0; i < Math.abs(n); i++) {
    cur = n > 0 ? unitNext(cur, unit) : unitStart(new Date(cur.getTime() - 1), unit)
  }
  return cur
}

export const TICK_LABEL = {
  day: (t) => `${t.start.getDate()}`,
  week: (t) => `${t.start.getDate()}/${t.start.getMonth() + 1}`,
  month: (t) => t.start.toLocaleDateString('en-PH', { month: 'short' }),
  quarter: (t) => `Q${Math.floor(t.start.getMonth() / 3) + 1}`,
}

// Second header band: the coarser unit above the fine one, so a "12" in the day row is
// readable as a date. Runs of the same label are merged into one spanning cell.
export function tickGroups(ticks, unit) {
  const label = unit === 'day' || unit === 'week'
    ? (t) => t.start.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })
    : (t) => String(t.start.getFullYear())
  const out = []
  for (let i = 0; i < ticks.length; i++) {
    const l = label(ticks[i])
    const last = out[out.length - 1]
    if (last && last.label === l) last.span += 1
    else out.push({ label: l, span: 1, from: i })
  }
  return out
}

export { DAY }
