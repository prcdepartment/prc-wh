// Delivery Tracker — Gantt model.
//
// ONE SOURCE. This module turns the delivery schedule into a timeline, and the schedule
// is all it reads: src/data/deliveryTracker.js, which is the "Target Delivery" sheet of
// the OSM Delivery Tracker workbook, narrowed to the rows bound for the central
// warehouse.
//
// It used to join two more — safekeeping's `soh` for an opening position and its
// `incoming`/`outgoing` for recorded movement — which is where BOH, the recorded bars
// and the real item codes came from. That join was removed on 2026-09-11 at
// procurement's request, so the card now reports the schedule and nothing else. Three
// consequences follow, and all three are stated on the card rather than papered over:
//
//   * BOH is 0 on every row. The workbook records no opening stock, so there is no
//     honest figure to put there.
//   * Every bar is a SCHEDULED delivery. There are no recorded receipts to draw, so the
//     solid/faded distinction now reads purely as "target has passed" vs "still ahead".
//   * The out lane is empty on every row, as it always was — no source in this system
//     schedules a release — and now there are not even recorded pullouts to fill it.
//
// ---------------------------------------------------------------------------
// WHY THE In / Out COLUMNS ARE DERIVED FROM THE BARS
//
// The requirement is that every bar carries a number and those numbers sum to the row's
// In / Out column. That can only hold if the columns ARE the sum of the bars, so they
// are computed here from the bar list rather than from any total stated elsewhere.
// Undated deliveries are excluded and reported separately — see finalise().
// ---------------------------------------------------------------------------

import { deliveryRows } from './deliveryTracker'
// Prices only — never quantities. The tracker's schedule still comes from the delivery
// workbook alone; this is the modelled peso rate per material, and it is a mock-up that
// says so on the card. See deliveryValue.js for what is grounded and what is assumed.
import { materialPrices } from './deliveryValue'

const DAY = 86400000

export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1)
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1)

// ---------------------------------------------------------------------------
// THE TODAY LINE IS THE REAL CURRENT DATE, deliberately NOT the snapshot date.
//
// `TODAY` in lib/format.js is the stock snapshot and must stay that way: the ledger
// back-cast, the aging bands and every figure on Analytics are measured in days before
// it, so moving it would silently re-date all of them. But a delivery schedule is read
// against the real calendar — "is that batch late?" is a question about today, not
// about when the stock file was exported — so this card asks the clock instead.
//
// A function, not a module constant: a constant is evaluated once when the bundle
// loads and would be stale for anyone who leaves the tab open overnight. The component
// memoises it per mount and re-arms itself at midnight.
export const ganttToday = () => startOfDay(new Date())

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
// Each line states the pack it assumes, so a warehouse reader can correct the ASSUMPTION
// rather than argue with the number it produces. The unit is whatever the schedule counts
// that material in — a "set" of plumbing fixtures is a water closet plus a lavatory plus
// a faucet, which is why that figure is low and not a count of individual pieces.
const UNITS_PER_PALLET = {
  'Rebar Coupler & Accessories': 1500, // grouted steel sleeves, bulk-boxed on a pallet
  'Kitchen Cabinet': 4,                // carcass sets, assumed flat-packed
  Sealant: 900,                        // ~24 tubes a carton, ~38 cartons a pallet
  Aluminum: 8,                         // glazed window/door sets, racked on edge
  // 12, lowered from 24 on 2026-09-11. A SET here is a water closet plus a lavatory plus
  // a faucet — the three the schedule ships together — and a water closet alone is close
  // to a quarter of a pallet's footprint. 24 sets to a pallet implied half a water closet
  // each, which is not a pack that exists.
  'Plumbing Fixtures': 12,
  'Wiring Devices': 2000,              // switches, outlets and cover plates, boxed
  'Wooden Door': 20,                   // door leaves, stacked flat
}
const UNITS_PER_PALLET_BY_UOM = { SET: 10, SETS: 10, PC: 300, PCS: 300, TUBE: 900, TUBES: 900, LM: 500 }
const DEFAULT_UNITS_PER_PALLET = 200

export const unitsPerPallet = (materialName, uom) =>
  UNITS_PER_PALLET[materialName]
  || UNITS_PER_PALLET_BY_UOM[String(uom || '').toUpperCase()]
  || DEFAULT_UNITS_PER_PALLET

// ---------------------------------------------------------------------------
// MINIMUM STOCK LEVEL — MODELLED, NOT RECORDED. Flagged as such on every cell.
//
// Nothing in any source records a minimum: zero matches for "minimum", "min stock",
// "reorder", "safety stock", "buffer" or "par level" anywhere in the delivery workbook,
// and no such column on any sheet of the stock workbook either. Procurement asked for a
// modelled figure "based on the scale and scope of the projects" so the column has
// something to work against until real levels are set, so that is exactly what this is
// — a model, derived from the schedule itself, and it must never be mistaken for a
// figure the warehouse has agreed.
//
// THE MODEL. A material's buffer should scale with how much of it that project is
// actually taking, so the input is the row's own total scheduled quantity — the only
// measure of project scale this source contains:
//
//     minimum  =  roundToPlanningStep( total scheduled x COVER )
//
// COVER is 15%, which is roughly the share one delivery represents on a typical row
// here (the median row carries six or seven batches). The result is rounded to a
// sensible planning step rather than left as a raw fraction, because "1,250" reads as a
// figure somebody chose and "1,247" reads as one a spreadsheet produced — and the
// rounding is what keeps this visibly a policy number rather than a measurement.
//
// Deliberately NOT used: the `minLevel` on every inventory line. That one is synthesized
// by the stock importer (`1 + Math.floor(rnd() * 20)`) and bears no relation to the
// material, so wiring it in would be worse than this — a random number wearing the
// costume of a real one.
//
// TO REPLACE WITH REAL FIGURES: put them in MIN_STOCK_OVERRIDE below, keyed by the
// material name MATERIAL_MAP produces, or by 'Material|PROJECTCODE' for a per-project
// level. Anything listed there wins over the model, and a row using a real figure stops
// being flagged as modelled.
const MIN_STOCK_COVER = 0.15

// Real, agreed levels go here and take precedence over the model. Empty today.
const MIN_STOCK_OVERRIDE = {
  // 'Rebar Coupler & Accessories': 500,
  // 'Plumbing Fixtures|JABS': 1200,
}

// Round to a step a planner would actually write down: 5s below 100, 10s below 500,
// 50s below 2,000, 100s above that.
function planningStep(n) {
  if (n <= 0) return 0
  const step = n < 100 ? 5 : n < 500 ? 10 : n < 2000 ? 50 : 100
  return Math.max(step, Math.round(n / step) * step)
}

/**
 * @param materialName  the mapped material name
 * @param projectCode   the schedule's own short project code, or '' on a parent row
 * @param scheduledQty  total scheduled quantity for this row — the scale input
 * @returns {{ value: number|null, modelled: boolean }}
 */
export function minStockLevel(materialName, projectCode, scheduledQty) {
  const scoped = MIN_STOCK_OVERRIDE[`${materialName}|${projectCode || ''}`]
  if (Number.isFinite(scoped)) return { value: scoped, modelled: false }
  const general = MIN_STOCK_OVERRIDE[materialName]
  if (Number.isFinite(general)) return { value: general, modelled: false }
  if (!Number.isFinite(scheduledQty) || scheduledQty <= 0) return { value: null, modelled: false }
  return { value: planningStep(scheduledQty * MIN_STOCK_COVER), modelled: true }
}

// Every level on the card is modelled while this is empty — the footnote says so once
// rather than every row repeating it.
export const hasRealMinStock = Object.keys(MIN_STOCK_OVERRIDE).length > 0
export const MIN_STOCK_COVER_PCT = Math.round(MIN_STOCK_COVER * 100)

// ---------------------------------------------------------------------------
// BAR CONSTRUCTION


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
// Leaf rows: one per material x project — the grain the schedule is managed at, since a
// batch number only means something inside a project. Returned as the CHILDREN of a
// material; see buildGanttRows.
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
        project: d.project,
        projectCode: d.projectCode || '',
        // The one distinctive word — "Jab", "Strevi", "Southscapes". It is this row's
        // own label (the full name ellipsises in a 172px column exactly where the
        // projects differ) and it is what the parent above tags itself with.
        projectShort: d.projectShort || d.project,
        isChild: true,
        trade: d.trade,
        uom: '',
        planned: [],
        // Batch accumulator, keyed so every line item of one delivery lands on one
        // bar. Deleted in finalise() — it is scratch, and leaving a Map on the row
        // would ride into every memo dependency and tooltip that spreads the row.
        batches: new Map(),
        boh: 0,
      }
      byKey.set(key, row)
    }
    // ONE PLANNED BAR PER BATCH, not per line item — and with the 2026-09-10 workbook
    // that distinction is the difference between a readable chart and an unreadable
    // one. The previous sheet was already flat at batch grain (27 rows). This one is
    // hierarchical and gives its line items: JABS' wooden doors alone are 28 rows that
    // are really 7 deliveries, four door types each. The batch is what carries the
    // target date, the tower and the remarks; the line items are what is inside it.
    //
    // So a bar is a batch, its quantity is the SUM of its line items, and the line
    // items ride along as `lines` for the tooltip. Summing here rather than letting
    // packTrack merge them keeps the merge badge meaning what it says: "these are
    // separate deliveries drawn on top of each other at this zoom", not "this is one
    // delivery that was always one thing".
    const q = parseQty(d.qty)
    const span = targetSpan(d)
    // Keyed on the SOURCE item string, not the mapped material name. Two source
    // strings can share one material — the two sealants both map to Sealant, as the
    // two AGW suppliers both map to Aluminum — and without `d.item` in the key an
    // interior and an exterior sealant batch falling on the same date in the same
    // project would fuse into a single bar, summing two different products under one
    // brand. They stay separate bars; if they overlap on screen, packTrack merges them
    // for drawing and says so with its badge, which is the honest version.
    const bkey = `${d.item}|${d.batch || ''}|${d.targetDate || ''}|${d.targetText || ''}|${d.location || ''}`
    let bar = row.batches.get(bkey)
    if (!bar) {
      bar = {
        kind: 'planned', lane: 'in',
        start: span ? span.start : null,
        end: span ? span.end : null,
        precision: span ? span.precision : 'none',
        firm: span ? span.firm : false,
        qty: null, tbc: true, qtyRaw: '', product: null,
        label: d.batch || 'Batch', batch: d.batch, no: d.no,
        // The source item, its brand and its project ride on the bar. A PARENT row's
        // bars come from several children, so the bar has to name its own project —
        // reading it off the row would report the wrong one on every merged parent bar.
        sourceItem: d.item, brand: d.brand || '', project: d.project,
        projectShort: d.projectShort || d.project,
        uom: d.uom && d.uom !== 'TBC' ? d.uom : '',
        // `warehouse` is the sheet's DELIVERY LOCATION — where the batch is bound, which
        // is not always the warehouse: several batches go straight to the project site.
        // Carried onto the bar for the detail panel, where "deliver to" is the question
        // a reader opening a bar most often has.
        status: d.status, location: d.location, warehouse: d.warehouse,
        opsRemarks: d.opsRemarks, prcRemarks: d.prcRemarks, dpPayment: d.dpPayment,
        targetText: d.targetText, targetDate: d.targetDate,
        lines: [],
      }
      row.batches.set(bkey, bar)
      row.planned.push(bar)
    }
    bar.lines.push({
      no: d.no,
      designation: d.designation || '',
      description2: d.description2 || '',
      qty: q.value, qtyRaw: q.raw, tbc: q.tbc, uom: d.uom || '',
    })
    // A batch's quantity is the sum of the line items that HAVE one. It stays null —
    // and the bar stays TBC — only while none of them does, so a batch with three
    // priced lines and one blank still reports the three rather than nothing.
    if (q.value != null) bar.qty = (bar.qty || 0) + q.value
    bar.tbc = bar.qty == null
    if (!bar.uom && d.uom && d.uom !== 'TBC') bar.uom = d.uom
    if (!bar.status && d.status) bar.status = d.status
    if (!row.uom && d.uom && d.uom !== 'TBC') row.uom = d.uom
  }

  // THE SAFEKEEPING JOIN USED TO BE HERE, and its removal on 2026-09-11 is the whole
  // point of the current shape. Each row was matched into the stock sheets for its
  // opening position, its already-recorded receipts and pullouts, and its real item
  // codes. The tracker now reports the delivery workbook and nothing else, so all of
  // that is gone and every row is finalised straight from its own scheduled batches.
  for (const row of byKey.values()) {
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
    // Short names for the tags under a material row, in the children's own order.
    // Deduplicated: a material with two batches for one project must not tag it twice.
    p.projectTags = [...new Set(p.children.map((c) => c.projectShort).filter(Boolean))]

    const sum = (f) => p.children.reduce((a, c) => a + (Number(f(c)) || 0), 0)
    p.boh = sum((c) => c.boh)
    p.totalIn = sum((c) => c.totalIn)
    p.totalOut = sum((c) => c.totalOut)
    p.tbcIn = sum((c) => c.tbcIn)
    p.tbcOut = sum((c) => c.tbcOut)
    p.undatedIn = sum((c) => c.undatedIn)
    p.undatedInCount = sum((c) => c.undatedInCount)
    p.tbcUndated = sum((c) => c.tbcUndated)
    p.eoh = p.boh + p.totalIn - p.totalOut
    p.recordedIn = sum((c) => c.recordedIn)
    p.recordedOut = sum((c) => c.recordedOut)
    p.bohAdjusted = p.children.some((c) => c.bohAdjusted)

    // A material's minimum is the sum of its projects' minimums — but only over the
    // children that actually HAVE one. Summing a partial set would report a total that
    // silently excludes the projects with no level set, which reads as a complete
    // figure and is not one, so the parent stays null until at least one child has a
    // level and flags whether the cover is partial.
    const withMin = p.children.filter((c) => c.minStock != null)
    p.minStock = withMin.length ? withMin.reduce((a, c) => a + c.minStock, 0) : null
    p.minStockPartial = withMin.length > 0 && withMin.length < p.children.length
    // A material's level is modelled if ANY of the projects under it is. Mixing a real
    // agreed level with a modelled one gives a total that is partly modelled, and the
    // weaker claim is the one the card has to make about it.
    p.minStockModelled = withMin.some((c) => c.minStockModelled)
    p.scheduledQty = p.children.reduce((a, c) => a + (c.scheduledQty || 0), 0)

    // Concatenated, not recomputed: rowAt() and capacityAt() then give a parent exactly
    // the sum of its children at any cursor position, by construction.
    const cat = (f) => p.children.flatMap(f)
    p.planned = cat((c) => c.planned).sort(byStart)
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
  delete row.batches
  // The in lane is the dated schedule. It used to be the recorded receipts PLUS the
  // schedule sharing one track; with the stock sheets gone there is nothing recorded to
  // merge in, so a bar is always a scheduled delivery.
  row.inBars = row.planned.filter((p) => p.start).sort(byStart)
  row.noDateBars = row.planned.filter((p) => !p.start)
  // Empty, and structurally so: no source in this system schedules an outbound, and the
  // recorded pullouts that used to fill this lane came from safekeeping. Kept as a real
  // (empty) lane rather than removed, because the card still offers an Out view and a
  // lane that is present-and-empty says "nothing is planned out" where a missing lane
  // would say nothing at all.
  row.outBars = []

  const sum = (bars) => bars.reduce((a, b) => a + (b.qty || 0), 0)
  const tbc = (bars) => bars.filter((b) => b.tbc).length

  // The In / Out columns ARE the sum of their lane's DRAWN bars — see the header note.
  //
  // UNDATED DELIVERIES ARE EXCLUDED, and that changed on 2026-09-10. A delivery with no
  // target at all cannot be placed on a timeline, so it draws no bar; while its quantity
  // was still being added to the column, the column did not equal the bars on the row,
  // which is the one invariant this card is built around. On the previous 27-row sheet
  // that was invisible. On the 2026-09-10 workbook 70 of 355 line items carry no target,
  // and it showed: Plumbing Fixtures read 72,998 against 26,120 drawn, and Jab's sealant
  // read 95,234 with nothing drawn at all.
  //
  // So they are treated exactly as a TBC quantity already is — excluded from the total
  // rather than counted, and reported separately so nothing goes quiet. `undatedIn` is
  // the quantity held back and `undatedInCount` how many deliveries it covers; the card
  // shows the count beside the figure and the tooltip gives the quantity.
  row.totalIn = sum(row.inBars)
  row.totalOut = sum(row.outBars)
  row.undatedIn = sum(row.noDateBars)
  row.undatedInCount = row.noDateBars.length
  row.tbcIn = tbc(row.inBars)
  row.tbcOut = tbc(row.outBars)
  // TBC among the undated is counted once, under the undated heading — a delivery with
  // neither a date nor a quantity must not be reported twice.
  row.tbcUndated = tbc(row.noDateBars)

  // BOH IS ZERO, AND THAT IS THE HONEST ANSWER rather than a missing feature.
  //
  // The delivery workbook records what is scheduled to ARRIVE. It carries no opening
  // position, no stock on hand and no receipts — those came from the safekeeping sheets,
  // which this card no longer reads. So the position before the first bar on the
  // timeline is not something this source knows, and the only truthful figure is zero
  // with a tooltip that says why. Inventing an opening balance to make the column look
  // populated is the one thing that must not happen.
  //
  // EOH therefore reads as "how much will have arrived by the cursor" — cumulative
  // scheduled intake — which is a real and useful figure for a delivery tracker even
  // though it is not a stock position.
  row.recordedIn = 0
  row.recordedOut = 0
  row.bohAdjusted = false
  row.boh = 0
  row.eoh = row.boh + row.totalIn - row.totalOut

  const all = [...row.inBars, ...row.outBars]
  row.firstDate = all.length ? Math.min(...all.map((b) => b.start.getTime())) : null
  row.lastDate = all.length ? Math.max(...all.map((b) => b.end.getTime())) : null
  row.plannedCount = row.planned.length
  // The model's scale input is everything this project has scheduled for this material,
  // dated or not — an undated batch is still tonnage the warehouse will have to hold.
  const scheduled = row.totalIn + (row.undatedIn || 0)
  const min = minStockLevel(row.materialName, row.projectCode, scheduled)
  row.minStock = min.value
  row.minStockModelled = min.modelled
  row.scheduledQty = scheduled
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
// Rewritten 2026-09-11, because the previous version reported one number twice and
// rounded in a way the warehouse does not.
//
// WHAT WAS WRONG.
//   * It computed a NET (in minus out) and a HELD (opening plus in minus out) and printed
//     both. With no outbound anywhere in this system and no opening stock, out is 0 and
//     BOH is 0 — so net and held are the same arithmetic, and the read-out was showing
//     the identical figure on both of its lines.
//   * It summed fractional pallets across every material and ceilinged the TOTAL. That
//     treats a third of a pallet of sealant and a third of a pallet of doors as adding up
//     to two thirds of one position, which no warehouse can do: two different materials
//     do not share a pallet position. Part-pallets are rounded up PER MATERIAL now, which
//     is what actually consumes floor.
//
// So there is one figure: the floor the deliveries that have landed by the cursor will
// be occupying. It only grows as the line moves right, which is correct — nothing in
// this schedule ever leaves.
export function capacityAt(rows, cursor) {
  let units = 0
  let positions = 0
  let exactPallets = 0
  const perRow = []

  for (const row of rows) {
    const { inQty } = rowAt(row, cursor)
    if (inQty <= 0) continue
    const upp = unitsPerPallet(row.materialName, row.uom)
    const pallets = inQty / upp
    // Ceilinged here, per material x project, not on the total — see the note above.
    const rowPositions = Math.ceil(pallets)
    units += inQty
    exactPallets += pallets
    positions += rowPositions
    perRow.push({ key: row.key, name: row.materialName, project: row.project, qty: inQty, upp, positions: rowPositions })
  }

  return {
    units,
    positions,
    exactPallets,
    m2: positions * M2_PER_POSITION,
    perRow: perRow.sort((a, b) => b.positions - a.positions),
  }
}

// ---------------------------------------------------------------------------
// MONTHLY BREAKDOWN — what is due to land in a given month, split by material.
//
// WHAT "VALUE" MEANS HERE, because it is not pesos. The delivery workbook carries a
// quantity and a unit of measure and NO price — there is no price column on any sheet
// of it, and the tracker no longer reads the stock workbook that had one. So this
// counts QUANTITY, and the card says "quantity" rather than "value" everywhere it is
// labelled. Pricing it would mean joining back to the item master by keyword and
// multiplying by a unit cost that was never quoted for these deliveries; the figure
// would look authoritative and be invented.
//
// A delivery is placed in the month its target span STARTS. For a firm date that is the
// month of the date. For an estimate the span is the window the source commits to
// ("August 2026" covers the month; "Mid September" its middle third), and all of those
// start inside the month they name, so the placement is the same either way.
//
// Deliveries with no target at all cannot be placed in any month and are counted apart,
// exactly as the timeline holds them out of the In column.
// IT TAKES THE PARENT ROWS, not the raw schedule, and that is deliberate: the parents
// are what the chart is currently showing, so the ring narrows with the filter bar and
// can never describe a different set of deliveries than the bars beside it. A parent's
// bar list is the concatenation of its children's, so each delivery is counted once.
export function monthsFromParents(parents) {
  const months = new Map()
  let undated = 0
  let undatedQty = 0
  const priced = materialPrices()

  for (const p of parents) {
    // The modelled peso rate for this material, or null where none is modelled. A
    // material with no rate contributes quantity but no value, and the card says how
    // many are in that state rather than quietly treating them as free.
    const rate = priced[p.materialName]?.php ?? null
    for (const b of p.planned) {
      if (!b.start) {
        undated += 1
        if (b.qty != null) undatedQty += b.qty
        continue
      }
      const key = `${b.start.getFullYear()}-${String(b.start.getMonth() + 1).padStart(2, '0')}`
      let m = months.get(key)
      if (!m) {
        m = {
          key,
          date: startOfMonth(b.start),
          label: b.start.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }),
          short: b.start.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }),
          total: 0, value: 0, lines: 0, tbc: 0, unpricedQty: 0,
          materialsSeen: new Set(),
          byMaterial: new Map(),
          byProject: new Map(),
        }
        months.set(key, m)
      }
      m.lines += 1
      if (b.qty == null) { m.tbc += 1; continue }
      const val = rate != null ? b.qty * rate : 0
      m.total += b.qty
      m.value += val
      if (rate == null) m.unpricedQty += b.qty
      m.materialsSeen.add(p.materialName)
      const bump = (map, k) => {
        const cur = map.get(k) || { qty: 0, value: 0 }
        cur.qty += b.qty
        cur.value += val
        map.set(k, cur)
      }
      bump(m.byMaterial, p.materialName)
      bump(m.byProject, b.projectShort || b.project || '—')
    }
  }

  const list = [...months.values()].sort((a, b) => a.date - b.date)
  // Sorted by VALUE, because value is what the ring now divides up — a big slice should
  // be the one drawn first, and ordering by quantity would put a cheap bulk material
  // ahead of an expensive one that dominates the ring.
  const slices = (map) => [...map.entries()]
    .map(([name, v]) => ({ name, qty: v.qty, value: v.value }))
    .sort((a, b) => b.value - a.value || b.qty - a.qty)
  for (const m of list) {
    m.materials = slices(m.byMaterial)
    m.projects = slices(m.byProject)
    m.materialNames = [...m.materialsSeen]
    delete m.byMaterial
    delete m.byProject
    delete m.materialsSeen
  }
  return { months: list, undated, undatedQty }
}

// The month a given date falls in, or null. The ring beside the chart follows the
// position line, so this is how the line picks which month to draw.
export function monthAt(months, date) {
  if (!date) return null
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  return months.find((m) => m.key === key) || null
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
export function timelineRange(rows, unit, now = ganttToday()) {
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
