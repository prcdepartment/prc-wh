// Import the Project Warehouse Audit workbook -> private-data/auditReport.js
//
//   npm run import:audit -- "sample/Audit Report Data Source.xlsx"
//
// This is the data source behind the Power BI report
// "MCC. PRC. WM. Project Warehouse Audit Report. 2026.pbix", whose three visible pages
// (Summary, Inventory Record Accuracy, Audit Findings) the app's Dashboard -> Audit tab
// reproduces. Committed for the same reason the other two importers are: the reading
// rules belong in the repo, not in someone's memory.
//
// WHICH SHEETS ARE READ, AND WHY ONLY THESE THREE
// The workbook has ten sheets, five of them hidden. The hidden ones (IC, SUM, Status2,
// IRA) are earlier, partial working copies of the same records — Status2 holds 53 of the
// 592 findings, SUM 46, IRA 6 — and the Power BI model binds none of them. Reading them
// would double-count. The three that the model does bind, and that this script reads:
//
//   "Ratings per Findings"   350 rows = 70 audits x 5 inspection criteria. The scorecard.
//   "Audit Findings"         592 rows, one per finding raised, with its status.
//   "Inventory Cylce Count"  3,244 counted lines (the sheet name's typo is the source's).
//
// Deliberately NOT read: "Schedule" and "Q4" (the audit calendar, which drives only the
// report's hidden fourth page), and "Terms" (a root-cause -> People/Process/Tools lookup
// that the model does not use — the findings sheet's own Root Cause column already
// carries that prefix inline where the auditor wrote one).
//
// THE PROJECT TYPE LIVES ONLY ON THE FINDINGS SHEET. "Ratings per Findings" has no
// Project Type column, yet the report's Project Type slicer does filter the scorecard —
// Power BI resolves it through the model relationship. So the type is a property of an
// AUDIT (a date + project pair), read off the findings rows and applied to the ratings
// by src/data/audit.js. 61 of the 70 audits carry one; the other 11 are genuinely blank
// in the source and stay blank (the report shows them under a "(Blank)" type, and they
// are real audits with real ratings, so dropping or guessing them would both be wrong).
//
// VERIFIED AGAINST THE REPORT. Every figure this script feeds was checked against the
// .pbix's own rendered numbers before the app was built:
//   - criteria averages 34/10/11/15/13, total 83%      (Summary, no filter)
//   - the 13 monthly ratings 89 88 98 74 73 84 / 74 80 77 81 78 88 90
//   - the same three splits under Vertical (82%), Horizontal (77%) and blank (93%)
//   - HIT/MISS counts and the accuracy line, 92% ... 96%  (Inventory Record Accuracy)
//   - Sum of Variance Value by month: 6.0M 14.5M 8.5M 7.3M 13.3M 1.7M 20.7M 3.9M
//   - the open/closed/cumulative series and the aging buckets of all four criteria
// See docs/CHANGELOG.md for the one visual whose own numbers do NOT reconcile with this
// workbook (Top 5 High Risk Audit Areas) and what the app does instead.
import { writeFileSync } from 'node:fs'
import { readWorkbook, cell } from './lib/xlsx.mjs'

const SRC = process.argv[2] || 'sample/Audit Report Data Source.xlsx'

const wb = readWorkbook(SRC)

// ---- cell readers ---------------------------------------------------------
// Every text cell is whitespace-collapsed. The source is hand-typed and carries
// trailing spaces ("Warehouse Organization "), embedded newlines inside a header
// ("Unit \nCost") and inside a value ("Technical Skills of \nWarehouse Personnel"),
// all of which would otherwise split a chart category in two.
const txt = (v) => String(cell(v) ?? '').replace(/\s+/g, ' ').trim()
const nbr = (v) => {
  const x = cell(v)
  if (x === null || x === undefined || x === '') return 0
  const n = Number(x)
  return Number.isFinite(n) ? n : 0
}
// Dates are real Excel serials on every sheet here, so cell() has already turned them
// into 'YYYY-MM-DD'. A blank close date means "still open" and stays ''.
const day = (v) => {
  const x = cell(v)
  if (!x) return ''
  const s = String(x)
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ''
}

/** Read a sheet as objects keyed by its own (whitespace-collapsed) header row. */
function table(name) {
  const rows = wb.rows(name)
  if (!rows.length) throw new Error(`sheet "${name}" is empty`)
  const head = rows[0].map(txt)
  return rows.slice(1)
    .filter((r) => r.some((v) => cell(v) !== null && cell(v) !== undefined && cell(v) !== ''))
    .map((r) => {
      const o = {}
      head.forEach((h, i) => { if (h) o[h] = r[i] })
      return o
    })
}

// ---- controlled vocabularies ---------------------------------------------
// The five inspection criteria are the audit instrument itself — the weights below are
// the form's, and a sixth value appearing here would mean the form changed, which is a
// thing to notice rather than to absorb silently. So an unknown one is reported, not
// mapped away.
const CRITERIA = [
  'Inventory Record Accuracy',
  'Warehouse Organization',
  'Warehouse Planning',
  'Warehouse Operations',
  'Warehouse Security and Safety',
]

// Status is written five ways in the source ('Closed', 'Closed ', 'closed', 'Open',
// 'N/A'). Case and spacing carry no meaning here, so they are folded; the three
// distinct MEANINGS are kept apart.
const STATUS = { open: 'Open', closed: 'Closed', 'n/a': 'N/A' }

// Classification typos that would split one bar of the Top-5 chart into two. Kept to
// the demonstrable cases: 'Warehosue Plan' (1 row, against 25 spelled correctly). The
// newline inside 'Technical Skills of Warehouse Personnel' is already handled by txt().
// Root-cause and findings PROSE is never rewritten — it is the auditor's wording and
// belongs on screen as written.
const CLASSIFICATION_FIX = {
  'Warehosue Plan': 'Warehouse Plan',
}

const problems = []
const note = (m) => { if (!problems.includes(m)) problems.push(m) }

// ---- "Ratings per Findings" ----------------------------------------------
// 70 audits x 5 criteria. Weight is the criterion's share of the 100% score (0.4 / 0.1 /
// 0.15 / 0.2 / 0.15) and Final Ratings is the score EARNED, already weighted — so an
// audit's overall rating is the plain sum of its five ratings, and a criterion's column
// on the scorecard is the average of that criterion's ratings. Both are computed in
// src/data/audit.js; nothing is pre-aggregated here.
const ratings = table('Ratings per Findings').map((r, i) => {
  const criteria = txt(r['Inspection Criteria'])
  if (!CRITERIA.includes(criteria)) note(`unknown inspection criteria "${criteria}" in Ratings per Findings`)
  return {
    id: i + 1,
    date: day(r['Date of Audit']),
    project: txt(r['Project Name']),
    num: nbr(r['InspCriteria_Num']),
    criteria,
    weight: nbr(r['Weight']),
    rating: nbr(r['Final Ratings']),
  }
})

// ---- "Audit Findings" -----------------------------------------------------
const findings = table('Audit Findings').map((r, i) => {
  const rawStatus = txt(r['Status']).toLowerCase()
  const status = STATUS[rawStatus] || ''
  if (!status) note(`unknown status "${txt(r['Status'])}" in Audit Findings`)
  const rawClass = txt(r['Audit Findings Classification'])
  const criteria = txt(r['Inspection Criteria'])
  if (criteria && !CRITERIA.includes(criteria)) note(`unknown inspection criteria "${criteria}" in Audit Findings`)
  return {
    id: i + 1,
    date: day(r['Date of Audit']),
    type: txt(r['Project Type']),
    project: txt(r['Project Name']),
    criteria,
    // 'Compliant' is a classification in the source: it records that a criterion was
    // checked and nothing was wrong. It is kept (it is 91 of the 592 rows and dropping
    // it would overstate how much of the audit went badly) and excluded per-visual,
    // exactly as the report's own filters do.
    classification: CLASSIFICATION_FIX[rawClass] || rawClass,
    finding: txt(r['Findings']),
    rootCause: txt(r['Root Cause']),
    actionPlan: txt(r['Action Plan']),
    timeline: day(r['Timeline']),
    closeDate: day(r['Close Date']),
    status,
  }
})

// ---- "Inventory Cylce Count" ---------------------------------------------
// The count sheet behind the Inventory Record Accuracy page: one row per item counted
// on an audit, with what SAP said, what was on the floor, and the peso gap between them.
// HIT/MISS is the source's own verdict per line and is what the accuracy percentage is
// built from, so it is read rather than recomputed from the variance.
const counts = table('Inventory Cylce Count').map((r, i) => ({
  id: i + 1,
  date: day(r['Date of Audit']),
  project: txt(r['Project Name']),
  assetType: txt(r['Asset Type']),
  itemCode: txt(r['Item Code']),
  description: txt(r['Item Description']),
  // 461 of the 3,244 rows have a UOM cell Excel stored as the number 0 — a blank the
  // sheet's own formatting filled in. Read as '' so the app says "no unit recorded"
  // instead of printing a unit called "0" beside a quantity.
  uom: txt(r['Uom']) === '0' ? '' : txt(r['Uom']),
  unitCost: nbr(r['Unit Cost']),
  systemQty: nbr(r['System Quantity']),
  actualQty: nbr(r['Actual Quantity']),
  systemValue: nbr(r['System Value']),
  actualValue: nbr(r['Actual Value']),
  // The source column is the ABSOLUTE peso exposure of the line (it is positive on
  // every one of the 3,244 rows, including the shorts), which is why the report's
  // "Financial Impact to Inventory Balance" bars are all positive. Kept as given.
  varianceValue: nbr(r['Variance Value']),
  variance: nbr(r['Variance']),
  accuracy: nbr(r['% Accuracy']),
  hitMiss: txt(r['Hit/Miss']).toUpperCase(),
  varianceType: txt(r['Type Of Varaince']),
}))

// ---- report ---------------------------------------------------------------
const uniq = (rows, f) => [...new Set(rows.map(f).filter(Boolean))].sort()
const audits = uniq(ratings, (r) => `${r.date}|${r.project}`)

// The per-audit type map, built here only to report on it; the app rebuilds it at
// runtime from the findings rows (see src/data/audit.js).
const typeOf = new Map()
for (const f of findings) if (f.type) typeOf.set(`${f.date}|${f.project}`, f.type)
const typed = audits.filter((k) => typeOf.has(k))
const conflicting = [...new Set(findings.filter((f) => f.type && typeOf.get(`${f.date}|${f.project}`) !== f.type)
  .map((f) => `${f.date}|${f.project}`))]

const months = uniq(ratings, (r) => r.date.slice(0, 7))
const openCount = findings.filter((f) => f.status === 'Open').length
const closedCount = findings.filter((f) => f.status === 'Closed').length
const hit = counts.filter((c) => c.hitMiss === 'HIT').length
const exposure = counts.reduce((a, c) => a + c.varianceValue, 0)

// Criteria averages — the Summary scorecard, printed so a bad import is visible in the
// report rather than on the dashboard.
const scorecard = CRITERIA.map((c) => {
  const rows = ratings.filter((r) => r.criteria === c)
  const avg = rows.reduce((a, r) => a + r.rating, 0) / (rows.length || 1)
  return `${c} ${(avg * 100).toFixed(0)}%`
})
const total = CRITERIA.reduce((sum, c) => {
  const rows = ratings.filter((r) => r.criteria === c)
  return sum + rows.reduce((a, r) => a + r.rating, 0) / (rows.length || 1)
}, 0)

console.log(`\n${SRC}`)
console.log(`  sheets read       "Ratings per Findings", "Audit Findings", "Inventory Cylce Count"`)
console.log(`  audits            ${audits.length} (date x project) across ${uniq(ratings, (r) => r.project).length} projects and ${months.length} months`)
console.log(`  months            ${months.join(', ')}`)
console.log(`  ratings rows      ${ratings.length}  (expected ${audits.length} x 5 = ${audits.length * 5})`)
console.log(`  project type      ${typed.length} of ${audits.length} audits carry one; ${audits.length - typed.length} are blank in the source`)
console.log(`                    ${[...new Set(findings.map((f) => f.type || '(blank)'))].join(', ')}`)
if (conflicting.length) console.log(`  !! type conflict  ${conflicting.join(', ')}`)
console.log(`  scorecard         ${scorecard.join(' · ')}  => ${(total * 100).toFixed(0)}%`)
console.log(`  findings          ${findings.length}  (${openCount} open, ${closedCount} closed, ${findings.length - openCount - closedCount} N/A)`)
console.log(`  classifications   ${uniq(findings, (f) => f.classification).length}`)
console.log(`  counted lines     ${counts.length}  (${hit} HIT, ${counts.length - hit} MISS = ${(hit / counts.length * 100).toFixed(0)}% accuracy)`)
console.log(`  count exposure    ₱${(exposure / 1e6).toFixed(1)}M total variance value`)
console.log(`  asset types       ${uniq(counts, (c) => c.assetType).join(', ')}`)
if (ratings.length !== audits.length * 5) console.log(`  !! ratings rows are not 5 per audit — the scorecard will be uneven`)
if (problems.length) { console.log('\n  PROBLEMS'); for (const p of problems) console.log(`    - ${p}`) }

// ---- write ----------------------------------------------------------------
const header = `// GENERATED by scripts/import-audit-report.mjs from
// ${SRC}
// — do not hand-edit. Re-run: npm run import:audit -- "sample/<workbook>.xlsx"
//
// The data source behind the Power BI report "Project Warehouse Audit Report", read from
// its three live sheets. The five hidden sheets are partial working copies of the same
// records and are deliberately skipped — see the importer for the full reasoning.
//
// ${audits.length} audits (a date x a project) over ${months.length} months:
//   AUDIT_RATINGS  ${ratings.length} rows — 5 weighted inspection criteria per audit.
//   AUDIT_FINDINGS ${findings.length} rows — one per finding raised (${openCount} still open).
//   AUDIT_COUNTS   ${counts.length} rows — every line counted in a cycle count.
//
// Project Type is a property of an AUDIT and is carried on the findings rows only;
// ${audits.length - typed.length} of the ${audits.length} audits have none in the source. src/data/audit.js rebuilds
// the map and leaves those blank rather than guessing.
`

const block = (name, rows) =>
  `\nexport const ${name} = [\n` +
  rows.map((r) => ' ' + JSON.stringify(r)).join(',\n') +
  '\n]\n'

writeFileSync(
  'private-data/auditReport.js',
  header + block('AUDIT_RATINGS', ratings) + block('AUDIT_FINDINGS', findings) + block('AUDIT_COUNTS', counts)
)
console.log(`\n  -> private-data/auditReport.js\n`)
