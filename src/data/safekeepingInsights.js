// Derived data / selectors for the Safekeeping module — mirrors the shape of
// src/data/insights.js (raw data stays dumb, this is the view-model layer).
//
// Quantity-based only: Unit Price is 0 on every source row (the sheet's lookup points at
// a deleted range), so there is no value metric to offer. Movement figures come from the
// SOH sheet's own In/Out columns, which the source maintains independently of the
// Incoming/Outgoing logs — a reconciliation gap reproduced rather than silently fixed.
import { soh, incoming, outgoing } from './safekeeping'

const sum = (arr, k) => arr.reduce((a, b) => a + (b[k] || 0), 0)
const distinctCount = (arr, k) => new Set(arr.map((r) => r[k]).filter(Boolean)).size

export const KPIS = (pool = soh) => ({
  lineItems: pool.length,
  totalSoh: sum(pool, 'soh'),
  distinctProjects: distinctCount(pool, 'project'),
  distinctItemGroups: distinctCount(pool, 'itemGroup'),
  // null, NOT zero, when the source stopped carrying the column. The 2026-09-28
  // workbook dropped BOH / In / Out from the SOH sheet entirely, and a confident "0
  // units" there reads as "nothing moved in or out", which is a different and false
  // claim from "the sheet no longer reports this". Every other absent figure in this
  // app is null for the same reason — see NoData and analytics().
  totalIn: pool.some((r) => r.in > 0) ? sum(pool, 'in') : null,
  totalOut: pool.some((r) => r.out > 0) ? sum(pool, 'out') : null,
  movingLines: pool.filter((r) => r.in > 0 || r.out > 0).length,
})

// The three ways the SOH can be cut for the Distribution card. Class used to be a
// fourth option here; dropped because Class is a condition grade (A/B/C/D), not a
// grouping dimension like the other three — cutting a donut by it answered "how much
// of each condition" rather than "where does this stock belong", which is a
// different question than Project/Trade/Item Group are asking.
export const SK_SCOPES = [
  { value: 'project', label: 'Project', icon: 'location', key: 'project' },
  { value: 'trade', label: 'Trade', icon: 'layers', key: 'trade' },
  { value: 'group', label: 'Item Group', icon: 'tag', key: 'itemGroup' },
]

// Rows carry both `qty` (what DistributionDonut reads) and `soh` (the domain name) so the
// donut and the list are fed from one call.
//
// `uom` is the group's unit only when the whole group shares one; a mixed group falls
// back to the caller's generic label, because summing PC and LM into one figure and
// labelling it "PC" would be a lie the card cannot walk back.
const groupDim = (pool, key, mixedLabel = 'units') => {
  const map = {}
  for (const r of pool) {
    const k = r[key] || '—'
    map[k] ??= { name: k, count: 0, qty: 0, uoms: new Set() }
    map[k].count += 1
    map[k].qty += r.soh || 0
    map[k].uoms.add(r.uom)
  }
  const rows = Object.values(map)
  const total = sum(rows, 'qty') || 1
  return rows
    .map((r) => ({
      name: r.name,
      label: r.name,
      count: r.count,
      qty: Math.round(r.qty * 100) / 100,
      soh: r.qty,
      value: 0,
      valueShare: 0,
      share: (r.qty / total) * 100,
      uom: r.uoms.size === 1 ? [...r.uoms][0] : mixedLabel,
    }))
    .sort((a, b) => b.qty - a.qty)
}

export const bySkScope = (pool = soh, scope = 'project', mixedLabel = 'units') => {
  const cfg = SK_SCOPES.find((s) => s.value === scope) || SK_SCOPES[0]
  return groupDim(pool, cfg.key, mixedLabel)
}

/* ------------------------------------------------- Bottom table: the three sheets --- */
// One column set per sheet, formatted like the Inventory Master List rather than a raw
// spreadsheet dump: `detailedDescription` (the sheet's "2nd Description") renders as a
// second line under Description instead of its own column, and `groupBy` names the
// fields Section view nests through — SOH has three (Project → Trade → Item Group),
// the two transaction logs have one (Project only, since neither carries a trade or
// item group of its own). Widths are shared across sheets so columns meaning the same
// thing (item code, description, qty, class, remarks) never reflow when switching views.
// Percentages, not pixels: a percentage set sums to 100 and makes the table exactly as
// wide as its container, so every column stays visible however narrow the pane gets
// (each cell truncates instead). A pixel total only fits until the container is smaller
// than it, at which point columns get pushed off the right edge. Each sheet's set is
// weighted by how much its content needs — Description widest, codes/units narrowest.
// qtySm is used three times (BOH/In/Out), so the set totals 10+43+6+(8.5*3)+9.5+6 = 100.
const W_SOH = { code: '10%', desc: '43%', uom: '6%', qty: '9.5%', qtySm: '8.5%', cls: '6%' }
const W_IN = { date: '10%', doc: '14%', category: '8%', code: '9%', desc: '24%', uom: '5.5%', qty: '7.5%', cls: '5%', cond: '7%', remarks: '10%' }
const W_OUT = { date: '10.5%', doc: '15%', category: '8.5%', code: '9.5%', desc: '27%', uom: '6%', qty: '8%', cls: '5.5%', cond: '10%' }

const SOH_GROUP = [
  { key: 'project', label: 'Project' },
  { key: 'trade', label: 'Trade' },
  { key: 'itemGroup', label: 'Item Group' },
]
const PROJECT_GROUP = [{ key: 'project', label: 'Project' }]

export const SHEET_VIEWS = [
  {
    value: 'soh',
    label: 'Stock on Hand',
    icon: 'inventory',
    rows: () => soh,
    note: 'Complete "Safekeeping SOH" sheet.',
    groupBy: SOH_GROUP,
    // The description's secondary line carries the detailed description plus trade and
    // item group (not project — project already heads each Section band, and it reads
    // as the location a line is held for rather than a description of the material).
    descKeys: ['trade', 'itemGroup'],
    columns: [
      { key: 'itemCode', label: 'Item Code', width: W_SOH.code, mono: true },
      { key: 'description', label: 'Material Description', width: W_SOH.desc, desc: true },
      { key: 'uom', label: 'UOM', width: W_SOH.uom },
      { key: 'boh', label: 'BOH', width: W_SOH.qtySm, num: true },
      { key: 'in', label: 'Incoming', width: W_SOH.qtySm, num: true },
      { key: 'out', label: 'Outgoing', width: W_SOH.qtySm, num: true },
      { key: 'soh', label: 'SOH', width: W_SOH.qty, num: true, strong: true },
      { key: 'class', label: 'Class', width: W_SOH.cls },
      // No Remarks column: the SOH sheet's Remarks holds exactly two boilerplate values
      // ("For safekeeping of materials" / "Safekeeping") across all 132 rows, so the
      // column carried no information — it only cost horizontal room.
    ],
  },
  {
    value: 'incoming',
    label: 'Incoming',
    icon: 'incoming',
    rows: () => incoming,
    note: 'Complete "Safekeeping Incoming" sheet.',
    groupBy: PROJECT_GROUP,
    columns: [
      { key: 'date', label: 'Date Received', width: W_IN.date, date: true },
      { key: 'docRef', label: 'Document Ref.', width: W_IN.doc },
      { key: 'category', label: 'Category', width: W_IN.category },
      { key: 'itemCode', label: 'Item Code', width: W_IN.code, mono: true },
      { key: 'description', label: 'Description', width: W_IN.desc, desc: true },
      { key: 'uom', label: 'UOM', width: W_IN.uom },
      { key: 'qty', label: 'Qty', width: W_IN.qty, num: true, strong: true },
      { key: 'class', label: 'Class', width: W_IN.cls },
      { key: 'condition', label: 'Condition', width: W_IN.cond },
      // Kept only here: Incoming's Remarks carries the physical container ID
      // ("Safekeeping BOX # 76", "CRATE # 54") — 25 distinct values, real information.
      { key: 'remarks', label: 'Storage Ref.', width: W_IN.remarks, blank: true },
    ],
  },
  {
    value: 'outgoing',
    label: 'Outgoing',
    icon: 'outgoing',
    rows: () => outgoing,
    note: 'Complete "Safekeeping Outgoing" sheet.',
    groupBy: PROJECT_GROUP,
    columns: [
      { key: 'date', label: 'Date Pull-Out', width: W_OUT.date, date: true },
      { key: 'docRef', label: 'Document Ref.', width: W_OUT.doc },
      { key: 'category', label: 'Category', width: W_OUT.category },
      { key: 'itemCode', label: 'Item Code', width: W_OUT.code, mono: true },
      { key: 'description', label: 'Description', width: W_OUT.desc, desc: true },
      { key: 'uom', label: 'UOM', width: W_OUT.uom },
      { key: 'qty', label: 'Qty', width: W_OUT.qty, num: true, strong: true },
      { key: 'class', label: 'Class', width: W_OUT.cls },
      { key: 'condition', label: 'Condition', width: W_OUT.cond },
      // As with SOH: Outgoing's Remarks is the single boilerplate string "Pullout of
      // safekeeping materials" on every row, so the column is dropped rather than shown.
    ],
  },
]

export const findByItemCode = (code) => soh.filter((r) => r.itemCode === code)
