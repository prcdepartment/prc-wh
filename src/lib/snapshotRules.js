// HOW A CENTRAL WAREHOUSE INVENTORY WORKBOOK IS READ. One copy, two callers.
//
// These are the rules that turn 'MCC. PRC. WM. CW Taytay Inventory. YYYY MM DD.xlsx'
// into the five row sets the app runs on: warehouse stock, the warehouse's own
// movement ledger, and the three safekeeping sheets. They were written and hardened
// inside scripts/import-snapshot.mjs across six consecutive monthly workbooks, and
// they moved here on 2026-10-06 so that the in-app Import module (admin → Import
// Data) reads a workbook by EXACTLY the same rules the command line does.
//
// That matters more than the deduplication. Every rule below exists because a real
// workbook broke something, and most of the breakages were silent — a column read one
// position to the left still imports, it just imports the wrong thing. A second
// implementation of these rules would drift, and the drift would show up as two
// different valuations of the same warehouse with no way to tell which was right.
//
// This module is deliberately PURE: no filesystem, no network, no Supabase, no
// import.meta.env. It takes an already-opened workbook plus the reference data it
// needs, and returns rows and warnings. The caller decides what to do with them —
// scripts/import-snapshot.mjs writes /private-data/*.js, src/lib/importSnapshot.js
// stages them into Postgres.
//
// ---------------------------------------------------------------------------
// WHAT THIS ASSUMES, AND WHAT IT REFUSES TO ASSUME
//
// STABLE across every snapshot so far: the COLUMN NAMES of the stock sheets
// (Project Origin, Item Code, Item Description, Specific Description, Uom, SOH, …)
// and of the movement sheets (…, Date, Document Reference, Category, Item Code,
// Item Description, 2nd Description, Uom, Qty, Class, Condition, Remarks).
// Everything here is found by those names — never by position; see `pick`.
//
// NOT STABLE, and therefore detected per file rather than assumed:
//   * whether warehouse and safekeeping are on SEPARATE sheets or merged into one
//     and split by Project Origin — see the layout note below;
//   * whether a location sheet is present at all. 2026-09-02 had one; the July and
//     2026-09-07 files do not;
//   * whether BOH / In / Out are present on the stock sheet (dropped 2026-09-28);
//   * whether the ownership column is present, and whether it is TRUSTWORTHY.
//
// NEVER IN THE WORKBOOK, so sourced elsewhere every time:
//   * trade and item group — from the item master, which resolves every code the
//     sheets carry and is a better taxonomy than the sheet's own charge codes;
//   * unit price and condition class — carried forward from the previous snapshot
//     where this workbook does not give them.
// ---------------------------------------------------------------------------
import { cell } from './xlsx.js'

export const WAREHOUSE = 'Central Warehouse Taytay'

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

const OWNERSHIP = { warehouse: /^central warehouse inventory$/i, safekeeping: /^safekeeping inventory$/i }
const MOVING = /^(fast|slow|non)[\s-]?moving$/i

/** Index of the first column whose header matches, or -1. */
const pick = (header, ...names) =>
  header.findIndex((h) => names.some((n) => n instanceof RegExp ? n.test(clean(h)) : clean(h).toLowerCase() === n))

const IN_TRANSIT_WINDOW = 14 // days; matches the previous snapshot's definition
const OWNERSHIP_MAX_DISAGREEMENT = 0.2

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

// The safekeeping sheets used to carry a short trade code (ARCHI / STRUCT / MEPF /
// GEN REQ). The September workbook dropped it, so it is derived back from the item
// master's trade to keep the column meaningful rather than empty.
const SHORT_TRADE = {
  'Architectural Works': 'ARCHI', 'Structural Works': 'STRUCT', 'General Requirements': 'GEN REQ',
  'Electrical and Auxiliary Works': 'MEPF', 'Plumbing Works': 'MEPF', 'Mechanical Works': 'MEPF',
  'Fire Protection Works': 'MEPF', 'Site Works': 'STRUCT', 'Allied Services': 'GEN REQ',
}

// ---------------------------------------------------------------------------
// LOCATIONS — the hidden "Item per location bin" sheet addresses each line as
// AREA-Rn-LL-BBB: warehouse area, rack within that area, beam level, bay. Those areas
// and rack counts are the same ones the floor plan was drawn from, which is what makes
// the two line up (MEPF has racks R1-R3, STRUC and ARCHI one each, and the bay numbers
// stop at 13 on MEPF R1 — exactly the long run against the west wall).
//
// The column is not clean: ~10% of its cells hold a movement class ("non moving") or
// "No data" where a location was never recorded, so anything that does not begin with
// a known area name is discarded rather than stored as a location.
// ---------------------------------------------------------------------------
const AREA_CODES = ['MEPF', 'STRUC', 'ARCHI', 'HIGH VALUE', 'TILES AREA', 'CAGE', 'YARD']
const LOCATION_RE = new RegExp(`^(${AREA_CODES.join('|')})(?:-R(\\d+)-(\\d+)-(\\d+))?$`, 'i')

const parseLocation = (raw) => {
  const m = LOCATION_RE.exec(String(raw).replace(/\s+/g, ' ').trim())
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

const key2 = (code, desc2) => `${code}|${String(desc2 || '').toUpperCase()}`

/**
 * Read a Central Warehouse inventory workbook.
 *
 * @param {{sheetNames: string[], rows: (name: string) => any[][]}} wb an open workbook
 * @param {object} refs reference data this workbook does not carry
 * @param {{c:string,d:string,t:string,g:string,m:string,u:string}[]} refs.itemMaster
 * @param {{code:string,name:string}[]} refs.projects
 * @param {object[]} refs.prevInventory previous snapshot's inventory rows (camelCase)
 * @param {object[]} refs.prevSafekeepingSoh previous snapshot's safekeeping SOH rows
 * @returns {object} rows, warnings and the facts the caller needs to report
 */
export function buildSnapshot(wb, refs = {}) {
  const { itemMaster = [], projects = [], prevInventory = [], prevSafekeepingSoh = [] } = refs

  const has = (name) => wb.sheetNames.includes(name)
  const sheet = (name) => wb.rows(name)

  // Things wrong with the SOURCE, not with this code. Collected rather than thrown,
  // because a bad column should not stop an import that is otherwise fine — but it
  // must be impossible to miss, so every caller puts them at the top of its report.
  const warnings = []
  const warn = (m) => { warnings.push(m) }

  // findOwnershipCol works on raw rows, so the usability check needs to know which
  // column held Project Origin on that same sheet.
  const ORIGIN_COL = new WeakMap()
  const DEST_COL = new WeakMap()

  /** Index of the column whose values are the ownership vocabulary, or -1. */
  function findOwnershipCol(rows) {
    const width = rows.reduce((w, r) => Math.max(w, r.length), 0)
    for (let c = 0; c < width; c++) {
      let hits = 0, other = 0
      for (const r of rows) {
        const v = clean(r[c])
        if (!v) continue
        if (OWNERSHIP.warehouse.test(v) || OWNERSHIP.safekeeping.test(v)) hits++
        else other++
      }
      if (other === 0 && hits >= rows.length * 0.9) return c
    }
    return -1
  }

  /**
   * Is the ownership column actually usable on this sheet?
   *
   * Added after 2026-09-28, where the column was present and well-formed and still
   * completely wrong. On SOH it read "Safekeeping Inventory" on all 1,007 rows — a
   * fill-down — which would have classified the warehouse's own 764 lines as somebody
   * else's material and left the inventory table empty. On Outgoing, 285 rows that the
   * 09-21 workbook had explicitly marked Safekeeping (matched on document reference,
   * item code and quantity) came back marked Central Warehouse, including a project
   * pulling out its OWN wooden doors and flooring.
   *
   * Three gates, all of which that file fails and every earlier file passes.
   */
  function ownershipUsable(rows, col, label) {
    if (col < 0) return false

    // 1. A classification with ONE distinct value classifies nothing.
    const vals = new Set(rows.map((r) => clean(r[col]).toLowerCase()).filter(Boolean))
    if (vals.size < 2) {
      warn(`${label}: the ownership column holds only "${[...vals][0] ?? ''}" on every row — it classifies nothing, so it is ignored.`)
      return false
    }

    // 2. The column is a REFINEMENT of Project Origin, not a replacement — on 09-21 it
    //    disagreed with origin on 4% of rows and was right every time. Half the sheet
    //    disagreeing is not a better classification, it is a broken column.
    let disagree = 0
    for (const r of rows) {
      const byCol = OWNERSHIP.warehouse.test(clean(r[col]))
      const byOrigin = clean(r[ORIGIN_COL.get(rows)] ?? '') === WAREHOUSE
      if (byCol !== byOrigin) disagree++
    }
    const share = disagree / rows.length
    if (share > OWNERSHIP_MAX_DISAGREEMENT) {
      warn(`${label}: the ownership column contradicts Project Origin on ${disagree} of ${rows.length} rows ` +
        `(${Math.round(share * 100)}%). It is meant to refine that, not reverse it, so it is ignored.`)
      return false
    }

    // 3. The gate the other two let through. Some rows are warehouse material BY
    //    CONSTRUCTION: the warehouse is the origin and either there is no destination
    //    (a stock line) or the destination is the warehouse too (it bought for itself).
    //    The column cannot be right about anything if it is wrong about those.
    //
    //    This is what exposed the 09-28 Incoming sheet. It disagreed with Project Origin
    //    on only 6% of rows, under the gate above — because on Incoming a genuine
    //    warehouse receipt often DOES have a project origin, so broad disagreement is
    //    expected there and the threshold has to stay loose. But of its 26 unambiguous
    //    rows it called 17 safekeeping, including the warehouse's own battery and paint
    //    purchases. Checked against the previous workbook afterwards: 62 rows had
    //    flipped class since 09-21.
    const oc = ORIGIN_COL.get(rows)
    const dc = DEST_COL.get(rows)
    const unambiguous = rows.filter((r) =>
      clean(r[oc] ?? '') === WAREHOUSE && (dc === undefined || dc < 0 || clean(r[dc] ?? '') === WAREHOUSE))
    if (unambiguous.length >= 10) {
      const agree = unambiguous.filter((r) => OWNERSHIP.warehouse.test(clean(r[col]))).length
      if (agree / unambiguous.length < 0.8) {
        warn(`${label}: of ${unambiguous.length} rows that are warehouse material by construction ` +
          `(warehouse to warehouse), the ownership column calls only ${agree} warehouse. It is ignored.`)
        return false
      }
    }
    return true
  }

  /** Index of a column holding the fast/slow/non-moving class, or -1. */
  function findMovingCol(rows) {
    const width = rows.reduce((w, r) => Math.max(w, r.length), 0)
    let best = -1, bestHits = 0
    for (let c = 0; c < width; c++) {
      let hits = 0
      for (const r of rows) if (MOVING.test(clean(r[c]))) hits++
      if (hits > bestHits) { bestHits = hits; best = c }
    }
    return bestHits >= 10 ? best : -1
  }

  // SOH sheets: row 1 is "As of: <date>", row 2 the header, data from row 3.
  const sohRows = (name) => {
    const all = sheet(name)
    const head = all[1] ?? []
    const c = {
      origin: pick(head, 'project origin', 'project name'),
      code: pick(head, 'item code'),
      desc: pick(head, 'item description'),
      desc2: pick(head, 'specific description', '2nd description'),
      uom: pick(head, 'uom'),
      boh: pick(head, 'boh'),
      qin: pick(head, 'in'),
      qout: pick(head, 'out'),
      soh: pick(head, 'soh'),
      price: pick(head, 'unit price'),
      cls: pick(head, 'class'),
      remarks: pick(head, 'remarks'),
    }
    if (c.code < 0 || c.soh < 0) throw new Error(`${name}: no "Item Code" / "SOH" header found`)
    const body = all.slice(2).filter((r) => clean(r[c.code]))
    ORIGIN_COL.set(body, c.origin)
    DEST_COL.set(body, -1) // a stock sheet has no destination
    const ownCol = findOwnershipCol(body)
    const own = ownershipUsable(body, ownCol, name) ? ownCol : -1
    const mov = findMovingCol(body)
    const g = (r, i) => (i >= 0 ? clean(r[i]) : '')
    const n = (r, i) => (i >= 0 ? num(r[i]) : 0)
    return body.map((r) => {
      const soh = n(r, c.soh)
      // BOH / In / Out vanished from the 09-28 sheet. Where they are absent the opening
      // balance is taken as the closing one with no flows: the workbook reports no
      // movement for the period, and inventing some would be worse than saying so.
      const hasFlows = c.boh >= 0 && c.qin >= 0 && c.qout >= 0
      return {
        origin: g(r, c.origin), code: g(r, c.code), desc: g(r, c.desc), desc2: g(r, c.desc2),
        uom: g(r, c.uom), soh,
        boh: hasFlows ? n(r, c.boh) : soh,
        qin: hasFlows ? n(r, c.qin) : 0,
        qout: hasFlows ? n(r, c.qout) : 0,
        price: n(r, c.price),
        cls: g(r, c.cls),
        owner: own >= 0 ? g(r, own) : '',
        moving: mov >= 0 ? clean(r[mov]) : '',
        remarks: g(r, c.remarks),
      }
    })
  }

  const movementRows = (name) => {
    const all = sheet(name)
    const head = all[0] ?? []
    const c = {
      origin: pick(head, 'project origin'),
      dest: pick(head, 'project destination'),
      date: pick(head, /^date/i),
      docRef: pick(head, 'document reference'),
      category: pick(head, 'category'),
      code: pick(head, 'item code'),
      desc: pick(head, 'item description'),
      desc2: pick(head, '2nd description', 'specific description'),
      uom: pick(head, 'uom'),
      qty: pick(head, 'qty'),
      cls: pick(head, 'class'),
      cond: pick(head, 'condition'),
      remarks: pick(head, 'remarks'),
    }
    if (c.origin < 0 || c.qty < 0) throw new Error(`${name}: no "Project Origin" / "Qty" header found`)
    const body = all.slice(1).filter((r) => clean(r[c.origin]))
    ORIGIN_COL.set(body, c.origin)
    DEST_COL.set(body, c.dest)
    const ownCol = findOwnershipCol(body)
    const own = ownershipUsable(body, ownCol, name) ? ownCol : -1
    const g = (r, i) => (i >= 0 ? clean(r[i]) : '')
    return body.map((r) => ({
      origin: g(r, c.origin), dest: g(r, c.dest), date: g(r, c.date), docRef: g(r, c.docRef),
      category: g(r, c.category), code: g(r, c.code), desc: g(r, c.desc), desc2: g(r, c.desc2),
      uom: g(r, c.uom), qty: c.qty >= 0 ? num(r[c.qty]) : 0, cls: g(r, c.cls), cond: g(r, c.cond),
      owner: own >= 0 ? g(r, own) : '',
      remarks: g(r, c.remarks),
    }))
  }

  // ---------------------------------------------------------------------------
  // TWO LAYOUTS, AND WHY BOTH HAVE TO BE READ
  //
  // The warehouse has sent this workbook in two shapes, so the layout is detected
  // rather than assumed:
  //
  //   SPLIT  (July, and again 2026-09-07) — "CW SOH" / "CW Incoming" / "CW Outgoing"
  //          beside "Safekeeping SOH" / "Safekeeping Incoming" / "Safekeeping Outgoing".
  //   MERGED (2026-09-02 onwards) — one "SOH" / "Incoming" / "Outgoing", warehouse and
  //          safekeeping distinguished only by the ownership or Project Origin column.
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
  if (!SPLIT && !has('SOH')) {
    throw new Error(
      'This workbook has neither a "CW SOH" sheet nor an "SOH" sheet, so it is not a ' +
      'Central Warehouse inventory snapshot. Sheets found: ' + wb.sheetNames.join(', '))
  }

  // The "As of:" date sits beside its own label, and that label changed column when the
  // 09-28 workbook dropped Concatenate. Scan the first row for a date rather than
  // reading a fixed cell.
  const snapshotDate = (() => {
    for (const c of sheet(SPLIT ? 'CW SOH' : 'SOH')[0] ?? []) {
      const v = cell(c)
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v
    }
    throw new Error('The SOH sheet\'s first row carries no "As of:" date, so the snapshot has no date.')
  })()

  // ---------------------------------------------------------------------------
  // WHO OWNS THE MATERIAL — three signals, in order of authority.
  //
  // 1. The OWNERSHIP COLUMN, new in 2026-09-21. The warehouse now states outright, per
  //    row, whether a line is its own stock or a project's held for safekeeping. Where
  //    it exists AND passes the gates above, nothing else is consulted, because it is a
  //    statement rather than an inference — and it is measurably better than what it
  //    replaces: on 09-21 it disagrees with Project Origin on 68 rows, and every one
  //    checked was the column being right.
  // 2. The SHEET, when the workbook splits CW * from Safekeeping * (July, 09-07).
  // 3. PROJECT ORIGIN, the only signal a merged workbook without the column has (09-02).
  //
  // Falling back rather than assuming matters because each rule is wrong for the other
  // shapes, and wrong silently: a misfiled row still imports, it just lands in the wrong
  // half of the business.
  // ---------------------------------------------------------------------------
  const ownedByWarehouse = (r) =>
    r.owner ? OWNERSHIP.warehouse.test(r.owner) : r.origin === WAREHOUSE

  let warehouseRows, skStock, CW_IN, CW_OUT, SK_IN, SK_OUT, partition
  if (SPLIT) {
    partition = 'sheet'
    warehouseRows = sohRows('CW SOH')
    skStock = sohRows('Safekeeping SOH')
    CW_IN = movementRows('CW Incoming')
    CW_OUT = movementRows('CW Outgoing')
    SK_IN = movementRows('Safekeeping Incoming')
    SK_OUT = movementRows('Safekeeping Outgoing')
  } else {
    const SOH = sohRows('SOH')
    const INCOMING = has('Incoming') ? movementRows('Incoming') : []
    const OUTGOING = has('Outgoing') ? movementRows('Outgoing') : []
    if (!has('Incoming')) warn('This workbook has no "Incoming" sheet; no receipts were read.')
    if (!has('Outgoing')) warn('This workbook has no "Outgoing" sheet; no releases were read.')
    partition = SOH.some((r) => r.owner) ? 'ownership column' : 'project origin'
    warehouseRows = SOH.filter(ownedByWarehouse)
    skStock = SOH.filter((r) => !ownedByWarehouse(r))
    CW_IN = INCOMING.filter(ownedByWarehouse)
    CW_OUT = OUTGOING.filter(ownedByWarehouse)
    SK_IN = INCOMING.filter((r) => !ownedByWarehouse(r))
    SK_OUT = OUTGOING.filter((r) => !ownedByWarehouse(r))
  }

  if (warehouseRows.length === 0) {
    throw new Error(
      'Not one stock line in this workbook is warehouse-owned. That is almost always a ' +
      'broken ownership or Project Origin column rather than an empty warehouse, so the ' +
      'import stops here rather than emptying the inventory table.')
  }

  // The location sheet is NOT in every export — the 2026-09-07 workbook dropped it
  // again. Where it is absent the addresses are carried forward from the previous
  // snapshot rather than discarded: a pallet does not move because a spreadsheet tab
  // was left out of this week's file, and throwing 787 real bin addresses away would
  // silently return the floor plan to guessing.
  const hasLocationSheet = has('Item per location bin')
  const locationCarried = !hasLocationSheet

  const locBins = new Map() // project|code|desc2 -> [parsed location, ...]
  if (hasLocationSheet) {
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
  const master = new Map(itemMaster.map((r) => [r.c, r]))
  const materialTypeOf = (m) => MATERIAL_TYPE[m?.m] ?? m?.m ?? 'Consumable'
  const itemGroupOf = (m) => ITEM_GROUP[m?.g] ?? m?.g ?? ''

  // PRICE and CONDITION CLASS: carried forward from the previous snapshot where this
  // workbook does not give them.
  //
  // The September SOH sheet had no price column at all, and the price column on the
  // location sheet is broken — it repeats one figure across unrelated items (₱324,821
  // for both a fluorescent tube and a coil of THHN wire) and prices ¾-inch teflon tape
  // at ₱120,535 a roll against ₱6.25 in July. Valuing the warehouse off it gives
  // ₱973M against ₱100M in July, and the overstatement is concentrated in twelve lines
  // that account for 86% of it: the signature of a lookup that has slipped its rows.
  // So the previous snapshot's prices are carried forward, matched on item code plus
  // specific description and then on item code alone, and lines it cannot price are
  // left at zero — which the app already reports as "no price recorded" rather than
  // as free stock.
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
  for (const r of prevSafekeepingSoh) {
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
  const projectByName = new Map(projects.map((p) => [p.name.toLowerCase(), p.code]))
  const projectCodeFor = (name) => projectByName.get(String(name).toLowerCase()) ?? ''

  // ---------------------------------------------------------------------------
  // The movement ledger — warehouse-owned rows only.
  //
  // `off` is days before the snapshot date, matching lastMovementOffset on the stock
  // rows, so 0 is the most recent movement on record.
  // ---------------------------------------------------------------------------
  const snapshotMs = Date.parse(`${snapshotDate}T00:00:00Z`)
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

  const ledger = [...ledgerFrom(CW_IN, 'in'), ...ledgerFrom(CW_OUT, 'out')]
    .sort((a, b) => b.off - a.off)

  const droppedLedger = CW_IN.length + CW_OUT.length - ledger.length

  // Per-code movement facts, used to fill the stock rows below.
  const ledgerByCode = new Map()
  for (const r of ledger) {
    if (!r.c) continue
    if (!ledgerByCode.has(r.c)) ledgerByCode.set(r.c, [])
    ledgerByCode.get(r.c).push(r)
  }

  // ---------------------------------------------------------------------------
  // WAREHOUSE STOCK
  // ---------------------------------------------------------------------------
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

    // The sheet's own price where it gives one, otherwise the carried-forward figure.
    // A Unit Price column returned on 09-28 after five snapshots without one, but
    // populated on only 7 of 1,007 rows — present is not the same as usable, so it is
    // taken per row rather than trusted wholesale.
    const unitPrice = r.price > 0 ? r.price : priceFor(r.code, r.desc2)

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
      // Likewise the class: the 09-28 sheet fills it on every row, which beats carrying
      // last month's forward, but earlier sheets leave it blank.
      conditionClass: r.cls || classFor(r.code, r.desc2),
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
  const soh = skStock.map((r, i) => {
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

  // On a safekeeping row the project is WHOSE MATERIAL IT IS, which is the counterparty
  // that is not the warehouse. Origin names it on all but a handful: 10 of the 09-21
  // outgoing rows are pull-outs the warehouse itself executed, where the owning project
  // is the destination. Taking origin blindly there would file those under a project
  // called "Central Warehouse Taytay", which is incoherent in a table defined as
  // project-owned material HELD BY the warehouse.
  const skParty = (r) => (r.origin && r.origin !== WAREHOUSE ? r.origin : r.dest || r.origin)

  const skLog = (rows) =>
    rows.map((r, i) => ({
      id: i + 1,
      project: skParty(r),
      projectCode: projectCodeFor(skParty(r)),
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
  const incoming = skLog(SK_IN)
  const outgoing = skLog(SK_OUT)

  // ---------------------------------------------------------------------------
  // Facts both callers report. Computed here so the CLI report and the in-app
  // preview can never quote different figures for the same file.
  // ---------------------------------------------------------------------------
  const unpriced = inventory.filter((r) => !r.unitPrice)
  const placed = inventory.filter((r) => r.location)
  const byArea = {}
  for (const r of inventory) if (r.zone) byArea[r.zone] = (byArea[r.zone] || 0) + 1

  const stats = {
    snapshotDate,
    split: SPLIT,
    partition,
    hasLocationSheet,
    locationCarried,
    counts: {
      inventory: inventory.length,
      ledger: ledger.length,
      safekeeping_soh: soh.length,
      safekeeping_incoming: incoming.length,
      safekeeping_outgoing: outgoing.length,
    },
    ledgerIn: ledger.filter((r) => r.dir === 'in').length,
    ledgerOut: ledger.filter((r) => r.dir === 'out').length,
    ledgerSpan: ledger.length ? { oldest: Math.max(...ledger.map((r) => r.off)), newest: Math.min(...ledger.map((r) => r.off)) } : null,
    droppedLedger,
    value: round2(inventory.reduce((a, r) => a + r.inventoryValue, 0)),
    units: inventory.reduce((a, r) => a + r.totalQty, 0),
    unpricedLines: unpriced.length,
    unpricedUnits: unpriced.reduce((a, r) => a + r.totalQty, 0),
    noConditionClass: inventory.filter((r) => !r.conditionClass).length,
    placedLines: placed.length,
    multiBinLines: inventory.filter((r) => r.binCount > 1).length,
    byArea,
    unmatchedProjects: [...new Set(soh.filter((r) => !r.projectCode).map((r) => r.project))],
    sohProjectsCoded: soh.filter((r) => r.projectCode).length,
    incomingNoCode: incoming.filter((r) => !r.itemCode).length,
    outgoingNoCode: outgoing.filter((r) => !r.itemCode).length,
  }

  return { snapshotDate, split: SPLIT, partition, hasLocationSheet, locationCarried,
    inventory, ledger, soh, incoming, outgoing, warnings, stats }
}
