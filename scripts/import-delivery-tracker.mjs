// Import the OSM Delivery Tracker workbook -> private-data/deliveryTrackerSheet.js
//
//   npm run import:delivery -- "sample/MCC. PRC. OSM Delivery Tracker - Presentation 2.xlsx"
//
// Written because the previous delivery-tracker module was generated ad hoc and the
// generator was not kept — the exact failure mode CLAUDE.md records for the July stock
// snapshot. This file is the reading rules, committed.
//
// THE SHEET IS HIERARCHICAL, NOT FLAT. One visible table, four levels deep:
//
//   TRADE        a row carrying only column A ("STRUCTURAL"), no other cell filled
//     ITEM       column A, vertically MERGED across every row of that material
//       PROJECT  column B, merged across that project's rows
//         BATCH  column C, merged across the batch's line items — and the batch is
//                what carries the TARGET DATE, the LOCATION, the destination and the
//                remarks, all merged the same way
//           line one row: DESIGNATION (model / handing), 2ND DESCRIPTION, QTY, UOM
//
// So a BATCH is one scheduled delivery and its line items are what is in it. That is
// the granularity the Gantt draws a bar at, and a bar's quantity is the sum of its
// line items. Both levels are kept: the rows below are line items, each carrying its
// batch's context, so nothing is aggregated away at import time.
//
// Merges are expanded from the sheet's own mergeCells ranges rather than by
// forward-filling until the next non-empty cell. Forward-filling looks equivalent and
// is not: several blocks have line items whose BATCH is genuinely blank (AVESTA's
// wooden doors), and a fill would inherit the batch above and invent a schedule for
// them.
import { writeFileSync } from 'node:fs'
import { readWorkbook, unzip, colIndex, cell } from './lib/xlsx.mjs'

const SRC = process.argv[2]
if (!SRC) {
  console.error('usage: npm run import:delivery -- "sample/<workbook>.xlsx"')
  process.exit(1)
}

// The snapshot the rest of the app is anchored to. Used only to bucket STATUS, which
// the DB column still wants; the app recomputes it against the real current date at
// runtime (see statusFor in src/data/deliveryTracker.js).
const { SNAPSHOT_DATE } = await import(new URL('../private-data/inventory.js', import.meta.url))

const SHEET = 'Target Delivery'

// ---- read + expand merges -------------------------------------------------
const wb = readWorkbook(SRC)
if (!wb.sheetNames.includes(SHEET)) {
  console.error(`no "${SHEET}" sheet — found: ${wb.sheetNames.join(', ')}`)
  process.exit(1)
}
const grid = wb.rows(SHEET).map((r) => r.map(cell))

// WHAT EACH ROW ACTUALLY AUTHORED, recorded BEFORE the merges are expanded — and the
// order matters. Expanding first and classifying after gets two things wrong, both
// found by measurement rather than by reading:
//
//  * a blank spacer row sitting INSIDE a material's merged column-A span gains the
//    item name from the expansion and nothing else, so it then looks exactly like a
//    trade band ("A filled, nothing beyond A") — which read IMC PIPE as a fourth trade;
//  * that same row would otherwise be counted as a line item, inflating the count by
//    one, because after expansion it carries a full set of inherited values.
//
// A row that authored nothing is a spacer, whatever the merges hand it afterwards.
const authored = grid.map((r) => (r || []).map((v) => v !== null && v !== undefined && String(v).trim() !== ''))
const authoredAny = authored.map((f) => f.some(Boolean))
const authoredOnlyA = authored.map((f) => f[0] === true && !f.slice(1).some(Boolean))

const sheetPath = wb.sheets.find((s) => s.name === SHEET).path
const xml = unzip(SRC).get(sheetPath).toString('utf8')
const mergeBlock = /<mergeCells[^>]*>([\s\S]*?)<\/mergeCells>/.exec(xml)
const merges = mergeBlock
  ? [...mergeBlock[1].matchAll(/ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/g)].map((m) => ({
      c0: colIndex(m[1]), r0: Number(m[2]) - 1, c1: colIndex(m[3]), r1: Number(m[4]) - 1,
    }))
  : []
for (const m of merges) {
  const v = grid[m.r0]?.[m.c0]
  if (v === null || v === undefined || v === '') continue
  for (let r = m.r0; r <= m.r1; r++) {
    for (let c = m.c0; c <= m.c1; c++) if (grid[r]) grid[r][c] = v
  }
}

// ---- column map, by header text so a reordered export still reads ---------
const HEAD = (grid[0] || []).map((v) => String(v ?? '').trim().toUpperCase())
const at = (...names) => {
  for (const nm of names) {
    const i = HEAD.indexOf(nm)
    if (i >= 0) return i
  }
  throw new Error(`no column headed ${names.join(' / ')} — got: ${HEAD.join(' | ')}`)
}
const C = {
  item: at('ITEM'),
  project: at('PROJECT'),
  batch: at('BATCH'),
  designation: at('DESIGNATION'),
  desc2: at('2ND DESCRIPTION'),
  qty: at('QTY'),
  uom: at('UOM'),
  target: at('TARGET DATE DELIVERY', 'TARGET DATE'),
  location: at('LOCATION'),
  dest: at('DELIVERY LOCATION'),
  ops: at('OPS REMARKS'),
  dp: at('DP PAYMENT'),
  prc: at('PRC REMARKS'),
}

// ---- status bucketing -----------------------------------------------------
// A text estimate ("August 2026", "Mid September 2026") is bucketed on the FIRST day
// it could land, so a vague promise is never reported as safer than a firm date in the
// same month. A row with no target at all gets no status: an empty cell is not a date.
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december']
const WEEK_WORDS = ['first', '1st', 'second', '2nd', 'third', '3rd', 'fourth', '4th', 'fifth', '5th']

export function earliestTarget(targetDate, targetText) {
  if (targetDate) return targetDate
  const t = String(targetText || '').toLowerCase()
  if (!t) return ''
  const mi = MONTHS.findIndex((m) => t.includes(m))
  const yr = /\b(20\d{2})\b/.exec(t)
  if (mi < 0 || !yr) return ''
  let day = 1
  if (/\bmid\b/.test(t)) day = 11
  const wk = /\b(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)\s*week\b/.exec(t)
  if (wk) day = 1 + 7 * Math.floor(WEEK_WORDS.indexOf(wk[1]) / 2)
  return `${yr[1]}-${String(mi + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const statusFor = (iso, today) => {
  if (!iso) return ''
  const days = Math.round((Date.parse(iso) - Date.parse(today)) / 86400000)
  if (days < 0) return 'Past Due / Update'
  if (days <= 30) return 'Due in 0-30 Days'
  if (days <= 90) return 'Due in 31-90 Days'
  return 'Future >90 Days'
}

// ---- walk -----------------------------------------------------------------
// ITEM and PROJECT are forward-filled after the merge expansion; BATCH deliberately is
// NOT. The difference is what a blank means in each column. This workbook's own merge
// ranges stop short in two places — AGW (Jia Hua)'s column-A merge ends mid-material,
// leaving ten JENARA window lines with no material at all, and Plumbing Fixtures'
// project merges cover only each project's first batch, orphaning three more rows. A
// line item always belongs to SOME material and SOME project, so a blank there is a
// formatting gap in the source and the row above is the answer. A blank BATCH is real
// data (AVESTA's wooden doors carry none), so filling it would invent a schedule.
// Both fills reset at a trade band, so one trade's last material cannot leak into the
// next trade's first row.
const rows = []
let trade = ''
let fillItem = ''
let fillProject = ''
let carriedItem = 0
let carriedProject = 0
let skippedBlank = 0
for (let i = 1; i < grid.length; i++) {
  const g = grid[i]
  if (!g) continue
  // A trade band: this row authored column A and nothing else. It re-scopes what
  // follows. Judged on what the row AUTHORED, never on what the merges gave it.
  if (authoredOnlyA[i]) {
    trade = String(g[C.item]).trim()
    fillItem = ''
    fillProject = ''
    continue
  }
  // A spacer inside a merged block: authored nothing of its own.
  if (!authoredAny[i]) { skippedBlank++; continue }

  const clean = (v) => (v === null || v === undefined ? ''
    : String(v).replace(/\s*\r?\n\s*/g, ' ').replace(/\s+/g, ' ').trim())
  const txt = (c) => clean(g[c])

  // Item strings carry a hard line break before the brand — "Rebar Coupler &
  // Accessories\r\n(Splice Sleeve)". Collapsed to one space, which is the form the
  // previous module used and the form MATERIAL_MAP is keyed on.
  let item = txt(C.item)
  let project = txt(C.project)
  if (item) fillItem = item
  else if (fillItem) { item = fillItem; carriedItem++ }
  if (project) fillProject = project
  else if (fillProject) { project = fillProject; carriedProject++ }

  const rawTarget = g[C.target]
  const isDate = typeof rawTarget === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawTarget)
  const targetDate = isDate ? rawTarget : ''
  const targetText = isDate ? '' : txt(C.target)

  const qtyRaw = g[C.qty]

  rows.push({
    no: rows.length + 1,
    category: trade,
    item,
    project,
    batch: txt(C.batch),
    // NEW in this workbook: the model / handing of the line and its qualifier. The
    // previous sheet had neither, which is why the tracker's Material Description cell
    // had no second line to show and the changelog recorded that as a data gap.
    designation: txt(C.designation),
    description2: txt(C.desc2),
    // Quantity is a real number wherever it is given at all — the previous sheet was
    // almost entirely the string "TBC". Left as '' where blank so the app keeps
    // excluding it from totals rather than counting it as zero.
    qty: typeof qtyRaw === 'number' ? qtyRaw : txt(C.qty),
    uom: txt(C.uom),
    targetDate,
    targetText,
    location: txt(C.location),
    warehouse: txt(C.dest),
    status: statusFor(earliestTarget(targetDate, targetText), SNAPSHOT_DATE),
    opsRemarks: txt(C.ops),
    dpPayment: txt(C.dp),
    prcRemarks: txt(C.prc),
  })
}

// ---- report ---------------------------------------------------------------
const uniq = (f) => [...new Set(rows.map(f).filter(Boolean))]
const batchKey = (r) => `${r.category}|${r.item}|${r.project}|${r.batch}|${r.targetDate}|${r.targetText}`
const batches = uniq(batchKey)
const firm = rows.filter((r) => r.targetDate).length
const est = rows.filter((r) => !r.targetDate && r.targetText).length
const numeric = rows.filter((r) => typeof r.qty === 'number')
const buckets = {}
for (const r of rows) {
  const k = r.status || '(no target)'
  buckets[k] = (buckets[k] || 0) + 1
}

console.log(`\n${SRC}`)
console.log(`  sheet             "${SHEET}"`)
console.log(`  line items        ${rows.length}   (${skippedBlank} blank rows skipped, ${merges.length} merges expanded)`)
console.log(`  carried forward   ${carriedItem} rows took the material above them, ${carriedProject} took the project — the source's merges stop short`)
console.log(`  delivery batches  ${batches.length}`)
console.log(`  materials         ${uniq((r) => r.item).length}`)
console.log(`  projects          ${uniq((r) => r.project).length} — ${uniq((r) => r.project).join(', ')}`)
console.log(`  trades            ${uniq((r) => r.category).join(', ')}`)
console.log(`  with a target     ${firm + est} of ${rows.length}  (${firm} firm dates, ${est} text estimates)`)
console.log(`  numeric qty       ${numeric.length} of ${rows.length}, summing to ${numeric.reduce((a, r) => a + r.qty, 0).toLocaleString()}`)
console.log(`  uom values        ${uniq((r) => r.uom).join(', ')}`)
console.log(`  status buckets    ${JSON.stringify(buckets)}`)

// ---- write ----------------------------------------------------------------
const header = `// GENERATED by scripts/import-delivery-tracker.mjs from
// ${SRC}
// — do not hand-edit. Re-run: npm run import:delivery -- "<workbook>"
//
// Source sheet "${SHEET}", a hierarchical table: trade band > ITEM (merged) > PROJECT
// (merged) > BATCH (merged, and the level carrying the target date, location,
// destination and remarks) > one row per line item (designation, 2nd description, qty,
// uom). Merges are expanded from the sheet's own mergeCells ranges, so a line item
// whose BATCH is genuinely blank stays blank rather than inheriting the one above.
//
// ${rows.length} line items across ${batches.length} delivery batches,
// ${uniq((r) => r.item).length} materials, ${uniq((r) => r.project).length} projects.
//
// TARGET DELIVERY is mixed, as before: ${firm} rows carry a real date and ${est} carry a
// free-text estimate ("August 2026", "Mid September 2026"). Both are kept as separate
// fields rather than inventing an exact date for the text ones.
//
// STATUS is DERIVED here — it is not a column in this workbook, unlike the previous
// one — by bucketing the earliest day the target could land against SNAPSHOT_DATE.
// The app recomputes it against the real current date at runtime (statusFor in
// src/data/deliveryTracker.js), so this stored value only feeds the DB column.

export const DELIVERY_TRACKER_ROWS = [
`
const body = rows.map((r) => ' ' + JSON.stringify(r, null, 1).replace(/\n/g, '\n ')).join(',\n')
writeFileSync('private-data/deliveryTrackerSheet.js', header + body + '\n]\n')
console.log(`\n  -> private-data/deliveryTrackerSheet.js\n`)
