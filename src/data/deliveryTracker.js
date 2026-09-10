// Delivery Tracker — sourced entirely from the real "Warehouse Schedule" sheet in
// sample/MCC. PRC. OSM Delivery Tracker - Presentation.xlsx (see
// deliveryTrackerSheet.js for the generator). No seeded/fabricated rows: this is the
// company's own scheduling snapshot, reproduced as authored.
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

// The schedule's item strings are informal and bundle a brand in parentheses. This
// splits each into a proper material NAME + BRAND (+ optional detail), confirmed with
// the procurement team, and carries a `match` keyword the tracker uses to resolve a
// representative item code from the item master at runtime (the sheet has no code of
// its own, and codes are not shipped in this public repo — see ItemLookup.jsx).
//
// `sk` is the join into the safekeeping sheets, which is what gives a scheduled
// material its REAL item codes, its beginning-on-hand and its already-recorded
// deliveries and pullouts. It is a list of description keywords rather than item
// codes, for the same reason `match` is: no item code is committed to this public
// repository, so the codes are resolved at runtime from the rows themselves.
// `skNot` excludes a near-miss the keyword would otherwise sweep in.
//
// SIX of the thirteen materials resolve to NOTHING in safekeeping, and that is the
// data rather than an unfinished mapping. Checked keyword by keyword against the
// 2026-09-07 safekeeping sheets: nothing described as a sealant, a wooden door, a wire,
// a cable, a panel board, an IMC pipe, a conduit or a genset has ever been booked in.
// Those rows carry a schedule with no stock history behind it, so their BOH is 0 and
// their bars all sit to the right of today — which is exactly what the schedule says
// about them. Each still carries the keywords that WOULD describe it, so the join
// starts working by itself the first time such stock is received; what must not happen
// is a near-miss keyword added to make a row look populated.
//
// The splice-sleeve grouts (SS Mortar Grout, GRW MC7-8) are deliberately NOT folded
// into "Rebar Coupler & Accessories" — they are a separate consumable, and claiming
// them as coupler stock would overstate it. Fold them in here if procurement says they
// belong to the same package.
//
// AGW is the schedule's own shorthand for the aluminium-and-glass package, and the
// 2026-09-10 workbook writes it two ways — "AGW (Jia Hua)" on four projects and
// "AGW Sicher Aluminum" on Southscape. Same material, two suppliers, so both map to
// the material name Aluminum with the brand carrying the difference, and both take the
// keyword set that was already verified for the Sicher rows: the sheets describe this
// stock by what it is (casement window, awning window, sliding door), never by
// supplier, so widening the keywords for the new string would change what the existing
// row reports for reasons that have nothing to do with the new data.
const MATERIAL_MAP = {
  'Rebar Coupler & Accessories (Splice Sleeve)': { name: 'Rebar Coupler & Accessories', brand: 'Splice Sleeve', detail: '', match: 'coupler', sk: ['splice sleeve'] },
  'AGW (Jia Hua)': { name: 'Aluminum', brand: 'Jia Hua', detail: 'Aluminium & glass', match: 'aluminum panel', sk: ['casement window', 'awning window', 'sliding door'], skNot: ['lockset'] },
  'AGW Sicher Aluminum': { name: 'Aluminum', brand: 'Sicher', detail: 'Aluminium & glass', match: 'aluminum panel', sk: ['casement window', 'awning window', 'sliding door'], skNot: ['lockset'] },
  'KITCHEN CABINET': { name: 'Kitchen Cabinet', brand: '', detail: '', match: 'kitchen cabinet', sk: ['kitchen cabinet'] },
  'KITO SEALANT (Interior)': { name: 'Sealant', brand: 'Kito', detail: 'Interior', match: 'sealant', sk: ['sealant'] },
  'PENGUIN SEALANT (Exterior)': { name: 'Sealant', brand: 'Penguin', detail: 'Exterior', match: 'sealant', sk: ['sealant'] },
  'Plumbing Fixtures (Laviya)': { name: 'Plumbing Fixtures', brand: 'Laviya', detail: '', match: 'lavatory', sk: ['bidet', 'mirror', 'water closet', 'shower head', 'shower set', 'kitchen sink', 'faucet', 'floor drain'] },
  'SPC Flooring Yekalon': { name: 'SPC Flooring', brand: 'Yekalon', detail: '', match: 'spc flooring', sk: ['spc flooring'] },
  'WIRING DEVICES (Lonon)': { name: 'Wiring Devices', brand: 'London', detail: '', match: 'convenience outlet', sk: ['convenience outlet', 'way switch', 'cover plate'] },
  'Wires & Cables Panel Boards': { name: 'Wires & Cables', brand: '', detail: 'Panel boards', match: 'thhn', sk: ['wire', 'cable', 'panel board'] },
  'IMC PIPE (Electrical Conduits)': { name: 'IMC Pipe', brand: '', detail: 'Electrical conduits', match: 'imc pipe', sk: ['imc pipe', 'electrical conduit'] },
  GENSET: { name: 'Genset', brand: '', detail: '', match: 'generator', sk: ['genset', 'generator set'] },
  'Wooden Door (Seyken)': { name: 'Wooden Door', brand: 'Seyken', detail: '', match: 'wooden door', sk: ['wooden door', 'flush door'] },
}

// Filled in place by rebuildDeliveryRows() so consumers keep a live reference
// after src/lib/hydrate.js swaps in the rows from Postgres.
export const deliveryRows = []

export function rebuildDeliveryRows() {
  deliveryRows.length = 0
  deliveryRows.push(
    ...DELIVERY_TRACKER_ROWS.map((r) => {
      const m = MATERIAL_MAP[r.item] || {}
      return {
        ...r,
        trade: TRADE_BY_CATEGORY[r.category] || r.category,
        project: PROJECT_NAME_BY_CODE[r.project] || r.project,
        // The sheet's own short code is KEPT alongside the proper name: the Gantt joins
        // this schedule to the safekeeping sheets, whose project names are written
        // loosely ('Jab Residences' vs '4PH Jab Greenwoods Dasmariñas'), and the code is
        // the only stable key both sides share. See SK_PROJECT_KEY in deliveryGantt.js.
        projectCode: r.project,
        materialName: m.name || r.item,
        brand: m.brand || '',
        matDetail: m.detail || '',
        matchKey: m.match || '',
        skKeys: m.sk || [],
        skNot: m.skNot || [],
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
