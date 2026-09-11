// Delivery Tracker — sourced entirely from the "Target Delivery" sheet of
// sample/MCC. PRC. OSM Delivery Tracker - Presentation 2.xlsx (see
// scripts/import-delivery-tracker.mjs for the reading rules and deliveryTrackerSheet.js
// for the generated module). No seeded or fabricated rows: this is the company's own
// scheduling snapshot, reproduced as authored and narrowed to the deliveries bound for
// the central warehouse — see WAREHOUSE_BOUND below.
//
// THIS WORKBOOK IS THE TRACKER'S ONLY DATA SOURCE. It used to be joined to the
// safekeeping stock sheets for opening stock, recorded receipts and real item codes;
// that join was removed on 2026-09-11 so the card reports the delivery schedule and
// nothing else. The consequences are real and are surfaced on the card rather than
// hidden: there is no opening stock, so BOH is 0 on every row; there are no recorded
// receipts, so every bar is a scheduled one; and there is no outbound, so the out lane
// is empty everywhere.
import { DELIVERY_TRACKER_ROWS } from './deliveryTrackerSheet'

// The sheet's CATEGORY column carries the trade, spelled in the tracker's own shorthand.
// Mapped onto the app's trade names, EXCEPT that this table keeps MEPF as a single trade:
// Mechanical Works, Electrical and Auxiliary Works and Fire Protection Works are
// consolidated under it (the source never splits them, and the schedule is managed as one
// MEPF package), so forcing them apart here would invent a distinction the data lacks.
// Trade names use the shortened app-wide forms (see renameTrade in trades.js): the
// "Works" suffix is dropped. MEPF stays as-is — the schedule manages it as one package.
const TRADE_BY_CATEGORY = {
  STRUCTURAL: 'Structural',
  ARCHITECTURAL: 'Architectural',
  MEPF: 'MEPF',
}

// The Warehouse Schedule sheet records projects by an informal short name; these are the
// proper project names from the project master list (public.projects), confirmed with
// the procurement team. Applied at build time so the column, the filter dropdown and the
// search box all read the proper name rather than the shorthand.
// Lancaster and OLP appear for the first time in the 2026-09-10 workbook and are NOT
// in this map, so they render as the sheet's own short code. That is deliberate: the
// proper name is not derivable from anything in the repo and guessing one would put an
// invented project name on a procurement card. Add them here once procurement confirms.
const PROJECT_NAME_BY_CODE = {
  AVESTA: 'Avesta Residences',
  JABS: '4PH Jab Greenwoods Dasmariñas',
  JENARA: '4PH Jenara Orchard Dasmarinas',
  STREVI: '4PH Strevi Bacoor',
  Southscape: 'Southscapes Trece Martires',
}

// ---------------------------------------------------------------------------
// SHORT PROJECT NAMES — the one distinctive word, for tags and narrow columns.
//
// The proper names are long and share most of their length: three of the five open with
// "4PH" and three close with a municipality. Neither end tells them apart, so a name
// truncated to fit a 172px column ellipsises exactly where the difference is. The one
// word that identifies each — Jab, Jenara, Strevi, Avesta, Southscape — is what these
// are, and it is the word people say out loud anyway.
//
// Derived where possible rather than hand-listed, so a project that appears in a future
// workbook gets a sensible short name without anyone editing this file: strip a leading
// "4PH", drop the generic tail (Residences / Residence / Project / Site) and the place
// that follows it, and keep the first word left. The explicit map above it is for the
// cases the rule would get wrong.
const SHORT_OVERRIDE = {
  // Only needed where the rule produces the wrong word. None so far.
}
const GENERIC_TAIL = /\b(residences?|towers?|project|site|development|homes?)\b.*$/i

export function shortProjectName(name) {
  const full = String(name || '').trim()
  if (!full) return ''
  if (SHORT_OVERRIDE[full]) return SHORT_OVERRIDE[full]
  const stripped = full
    .replace(/^\s*\d*\s*ph\s+/i, '')   // "4PH Jab Greenwoods…" -> "Jab Greenwoods…"
    .replace(GENERIC_TAIL, '')          // "Avesta Residences"    -> "Avesta"
    .trim()
  // Whatever survives, take its first word — that is the distinctive one in every case
  // here ("Jab Greenwoods Dasmariñas" -> "Jab", "Southscapes Trece Martires" ->
  // "Southscapes"). A short code that was never mapped to a proper name (Lancaster, OLP)
  // passes through unchanged, which is already as short as it gets.
  const first = (stripped || full).split(/\s+/)[0]
  return first.replace(/[,;]$/, '')
}

// The schedule's item strings are informal and bundle a brand in parentheses. This
// splits each into a proper material NAME + BRAND (+ optional detail), confirmed with
// the procurement team.
//
// THE SAFEKEEPING KEYWORDS ARE GONE. Each entry used to carry an `sk` list that joined
// the material to the safekeeping stock sheets, which is how the chart got its opening
// stock, its recorded receipts and its real item codes. The tracker is now built from
// the delivery workbook ALONE (2026-09-11), so that join — and the keywords that
// described it — no longer exist. `match` stays: it resolves a representative item code
// from the item master at runtime for the Table view's Item Code column, which is a
// display lookup against the item catalogue, not a second source of schedule data.
//
// The two AGW strings still collapse to one material. "AGW (Jia Hua)" and "AGW Sicher
// Aluminum" are the same aluminium-and-glass package from two suppliers, so the brand
// carries the difference. (Every Jia Hua delivery is site-bound, so only the Sicher rows
// survive the warehouse filter above — but the mapping stays correct either way.)
const MATERIAL_MAP = {
  'Rebar Coupler & Accessories (Splice Sleeve)': { name: 'Rebar Coupler & Accessories', brand: 'Splice Sleeve', detail: '', match: 'coupler' },
  'AGW (Jia Hua)': { name: 'Aluminum', brand: 'Jia Hua', detail: 'Aluminium & glass', match: 'aluminum panel' },
  'AGW Sicher Aluminum': { name: 'Aluminum', brand: 'Sicher', detail: 'Aluminium & glass', match: 'aluminum panel' },
  'KITCHEN CABINET': { name: 'Kitchen Cabinet', brand: '', detail: '', match: 'kitchen cabinet' },
  'KITO SEALANT (Interior)': { name: 'Sealant', brand: 'Kito', detail: 'Interior', match: 'sealant' },
  'PENGUIN SEALANT (Exterior)': { name: 'Sealant', brand: 'Penguin', detail: 'Exterior', match: 'sealant' },
  'Plumbing Fixtures (Laviya)': { name: 'Plumbing Fixtures', brand: 'Laviya', detail: '', match: 'lavatory' },
  'SPC Flooring Yekalon': { name: 'SPC Flooring', brand: 'Yekalon', detail: '', match: 'spc flooring' },
  'WIRING DEVICES (Lonon)': { name: 'Wiring Devices', brand: 'London', detail: '', match: 'convenience outlet' },
  'Wires & Cables Panel Boards': { name: 'Wires & Cables', brand: '', detail: 'Panel boards', match: 'thhn' },
  'IMC PIPE (Electrical Conduits)': { name: 'IMC Pipe', brand: '', detail: 'Electrical conduits', match: 'imc pipe' },
  GENSET: { name: 'Genset', brand: '', detail: '', match: 'generator' },
  'Wooden Door (Seyken)': { name: 'Wooden Door', brand: 'Seyken', detail: '', match: 'wooden door' },
}

// Filled in place by rebuildDeliveryRows() so consumers keep a live reference
// after src/lib/hydrate.js swaps in the rows from Postgres.
export const deliveryRows = []

// ---------------------------------------------------------------------------
// WAREHOUSE-BOUND ONLY.
//
// The schedule covers deliveries to several destinations — the central warehouse, and a
// number of project sites the supplier ships to directly. This card is the WAREHOUSE's
// tracker, so only the warehouse-bound rows belong on it; a pallet going straight from
// the supplier to Jab Residences never touches Taytay and is not this warehouse's to
// plan for.
//
// The source writes the destination two ways, "Taytay Central Warehouse" and plain
// "Central Warehouse", and both mean the same building. Matched case-insensitively on
// either form rather than on an exact string, because that column is typed by hand.
//
// What this drops, measured on the 2026-09-10 workbook: 268 of 355 line items, leaving
// 87 across 7 materials and 5 projects. Six materials disappear entirely — AGW (Jia
// Hua), Penguin Sealant, SPC Flooring, Wires & Cables, IMC Pipe and Genset — because
// every one of their deliveries is site-bound. 99 of the dropped rows have NO
// destination recorded at all; a blank is not the warehouse, so they go too, and
// `deliveryExcluded` reports the count so the card can say how much it is not showing.
const WAREHOUSE_BOUND = /taytay\s+central\s+warehouse|central\s+warehouse/i
export const isWarehouseBound = (r) => WAREHOUSE_BOUND.test(String(r.warehouse || ''))

// How many source rows the destination filter removed, and how many of those were blank
// rather than site-bound. Read by the card's footnote — a filter this large must not be
// silent.
export const deliveryExcluded = { total: 0, blank: 0, siteBound: 0, source: 0 }

export function rebuildDeliveryRows() {
  deliveryRows.length = 0
  const kept = DELIVERY_TRACKER_ROWS.filter(isWarehouseBound)
  deliveryExcluded.source = DELIVERY_TRACKER_ROWS.length
  deliveryExcluded.total = DELIVERY_TRACKER_ROWS.length - kept.length
  deliveryExcluded.blank = DELIVERY_TRACKER_ROWS.filter((r) => !isWarehouseBound(r) && !String(r.warehouse || '').trim()).length
  deliveryExcluded.siteBound = deliveryExcluded.total - deliveryExcluded.blank
  deliveryRows.push(
    ...kept.map((r) => {
      const m = MATERIAL_MAP[r.item] || {}
      return {
        ...r,
        trade: TRADE_BY_CATEGORY[r.category] || r.category,
        project: PROJECT_NAME_BY_CODE[r.project] || r.project,
        // The sheet's own short code is KEPT alongside the proper name. It used to be the
        // bridge to the safekeeping sheets; it is now simply the stable per-project key
        // the Gantt groups and keys its rows by, which a display name should not be.
        projectCode: r.project,
        // The one distinctive word, used for the parent-row tags and as the child rows'
        // own label. Computed once here so every consumer agrees on it.
        projectShort: shortProjectName(PROJECT_NAME_BY_CODE[r.project] || r.project),
        materialName: m.name || r.item,
        brand: m.brand || '',
        matDetail: m.detail || '',
        matchKey: m.match || '',
      }
    })
  )
}

rebuildDeliveryRows()

// Same four buckets and order the source sheet itself uses, with a tone/icon per
// urgency — worst (overdue) first, so the card reads as a priority list.
export const DELIVERY_STATUSES = [
  { key: 'Past Due / Update', short: 'Needs Attention', icon: 'alert', tone: 'danger' },
  { key: 'Due in 0-30 Days', short: 'Due 0–30 Days', icon: 'clock', tone: 'warn' },
  { key: 'Due in 31-90 Days', short: 'Due 31–90 Days', icon: 'incoming', tone: 'info' },
  { key: 'Future >90 Days', short: 'Future (90+ Days)', icon: 'calendar', tone: 'neutral' },
]

export const deliveryStatusCounts = (rows = deliveryRows) => {
  const map = {}
  for (const r of rows) map[r.status] = (map[r.status] || 0) + 1
  return map
}

export const distinctProjects = (rows = deliveryRows) => [...new Set(rows.map((r) => r.project))].sort()
export const distinctTrades = (rows = deliveryRows) => [...new Set(rows.map((r) => r.trade))].sort()
