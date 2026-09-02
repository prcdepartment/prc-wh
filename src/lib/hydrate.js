// Loads the warehouse dataset from Postgres into the modules under src/data/.
//
// WHY IT WORKS THIS WAY
// The data modules compute their view models eagerly at import time and ~20 pages
// import them directly (`import { items } from '../data/insights'`). Rewriting every
// page to await a query would be an enormous, breakage-prone change for a dataset
// this small (~1,600 rows, well under a megabyte). So instead:
//
//   1. every source array is filled IN PLACE — never reassigned — so existing
//      imports keep pointing at the same live array;
//   2. hydrate() runs ONCE in src/main.jsx BEFORE ReactDOM.render, so React never
//      observes the pre-hydration state and no component needs a loading branch.
//
// Postgres is the ONLY source of data. src/data/*.js ship as empty shells because
// this repository is public and the dataset is confidential, so if this fails the app
// has no data at all and must say so rather than showing convincing zeroes. The
// return value carries the reason, which Settings and the Login page surface.
import { supabase, isConfigured } from './supabase'

import { inventory } from '../data/inventory'
import { LEDGER, rebuildLedgerSpan } from '../data/ledger'
import { SOH_ROWS, INCOMING_ROWS, OUTGOING_ROWS } from '../data/safekeepingSheets'
import { DELIVERY_TRACKER_ROWS } from '../data/deliveryTrackerSheet'
import { PROJECTS, rebuildProjectCodes } from '../data/projects'
import { rebuildItems } from '../data/insights'
import { rebuildSafekeeping } from '../data/safekeeping'
import { rebuildDeliveryRows } from '../data/deliveryTracker'
import { setTransactions } from '../data/transactions'

// PostgREST caps a request at 1000 rows by default; page through anything larger.
const PAGE = 1000

export async function fetchAll(table, orderBy) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    let query = supabase.from(table).select('*').range(from, from + PAGE - 1)
    if (orderBy) query = query.order(orderBy)
    const { data, error } = await query
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...data)
    if (data.length < PAGE) return rows
  }
}

const fill = (target, rows) => {
  target.length = 0
  target.push(...rows)
}
// Postgres dates come back as 'YYYY-MM-DD' or null — the shape the data modules expect.
const day = (v) => (v ? String(v).slice(0, 10) : '')

// ---- row mappers: snake_case columns → the camelCase shapes src/data uses -------
const toInventory = (r) => ({
  id: r.id, itemCode: r.item_code, description: r.description, detailedDescription: r.detailed_description,
  tradeL1: r.trade_l1, tradeL2: r.trade_l2, materialType: r.material_type, uom: r.uom,
  totalQty: +r.total_qty, beginningQty: +r.beginning_qty, periodIn: +r.period_in, periodOut: +r.period_out,
  availableQty: +r.available_qty, reservedQty: +r.reserved_qty, incomingQty: +r.incoming_qty,
  outgoingQty: +r.outgoing_qty, damagedQty: +r.damaged_qty, minLevel: +r.min_level,
  issueFrequency: +r.issue_frequency, lastMovementOffset: +r.last_movement_offset,
  unitPrice: +r.unit_price, discountedPrice: +r.discounted_price, inventoryValue: +r.inventory_value,
  conditionClass: r.condition_class, brand: r.brand || '', model: r.model || '',
  location: r.location || '', binCount: +r.bin_count || 0,
  zone: r.zone, rack: r.rack, shelf: r.shelf, bin: r.bin,
})

const toLedger = (r) => ({
  dir: r.direction, off: r.day_offset, c: r.item_code, d: r.description, q: +r.qty,
  u: r.uom, p: r.project, r: r.doc_ref, cls: r.class, cond: r.condition,
})

const toSoh = (r) => ({
  id: r.id, refCode: r.ref_code, project: r.project, projectCode: r.project_code, trade: r.trade,
  tradeL1: r.trade_l1, itemGroup: r.item_group, itemCode: r.item_code, description: r.description,
  detailedDescription: r.detailed_description, uom: r.uom,
  boh: +r.boh, in: +r.qty_in, out: +r.qty_out, soh: +r.soh, unitPrice: +r.unit_price,
  class: r.class, remarks: r.remarks,
})

const toSkLog = (r) => ({
  id: r.id, project: r.project, projectCode: r.project_code, date: day(r.doc_date), docRef: r.doc_ref,
  category: r.category, itemCode: r.item_code, description: r.description,
  detailedDescription: r.detailed_description, uom: r.uom, qty: +r.qty,
  class: r.class, condition: r.condition, remarks: r.remarks,
})

const toDelivery = (r) => ({
  no: r.no, category: r.category, item: r.item, project: r.project, batch: r.batch, qty: r.qty, uom: r.uom,
  targetDate: day(r.target_date), targetText: r.target_text, location: r.location, warehouse: r.warehouse,
  status: r.status, opsRemarks: r.ops_remarks, dpPayment: r.dp_payment, prcRemarks: r.prc_remarks,
})

const toMovement = (r) => ({
  id: r.id, itemId: r.item_id, itemCode: r.item_code, description: r.description, type: r.type,
  qty: +r.qty, uom: r.uom, project: r.project, ref: r.doc_ref, status: r.status,
  user: r.created_by_email || '—', date: new Date(r.moved_at || r.created_at),
})

const toReservation = (r) => ({
  id: r.id, itemId: r.item_id, itemCode: r.item_code, description: r.description, qty: +r.qty, uom: r.uom,
  project: r.project, status: r.status, user: r.created_by_email || '—',
  date: new Date(r.created_at), requiredDate: r.required_date ? new Date(r.required_date) : null,
})

const toPurchaseRequest = (r) => ({
  id: r.id, itemId: r.item_id, itemCode: r.item_code, description: r.description,
  qtyNeeded: +r.qty_needed, uom: r.uom, reason: r.reason, estCost: +r.est_cost,
  status: r.status, by: r.created_by_email || '—', date: new Date(r.created_at),
})

const toMaterialRequest = (r) => ({
  id: r.id, itemId: r.item_id, itemCode: r.item_code, description: r.description, qty: +r.qty, uom: r.uom,
  project: r.project, purpose: r.purpose, status: r.status,
  date: new Date(r.created_at), requiredDate: r.required_date ? new Date(r.required_date) : null,
})

const toApproval = (r) => ({
  id: r.id, type: r.type, category: r.category, subject: r.subject, itemId: r.item_id,
  project: r.project, requestedBy: r.requested_by, date: new Date(r.created_at),
})

const toAudit = (r) => ({
  id: r.id, user: r.user_email, action: r.action, detail: r.detail, date: new Date(r.created_at),
})

// Last hydration result, for the "Data source" readout on the Settings page.
export const hydrationStatus = { source: 'empty', error: null, counts: {}, at: null }

/**
 * Load everything from Postgres.
 * @returns {Promise<{source: 'postgres'|'empty', error: string|null, counts: object}>}
 */
export async function hydrate() {
  const result = await run()
  Object.assign(hydrationStatus, result, { at: new Date() })
  return result
}

async function run() {
  const noData = (error) => ({ source: 'empty', error, counts: {} })
  if (!isConfigured) return noData('Supabase is not configured (missing VITE_SUPABASE_* env vars)')

  // No session → RLS returns nothing anyway. AuthContext.signIn re-hydrates
  // once there is one.
  const { data: session } = await supabase.auth.getSession()
  if (!session.session) return noData('not signed in')

  try {
    const [inv, led, soh, skIn, skOut, del, proj, mov, res, pr, mr, appr, audit] = await Promise.all([
      fetchAll('inventory', 'id'),
      fetchAll('ledger', 'id'),
      fetchAll('safekeeping_soh', 'id'),
      fetchAll('safekeeping_incoming', 'id'),
      fetchAll('safekeeping_outgoing', 'id'),
      fetchAll('delivery_tracker', 'no'),
      fetchAll('projects', 'code'),
      fetchAll('movements', 'id'),
      fetchAll('reservations', 'id'),
      fetchAll('purchase_requests', 'id'),
      fetchAll('material_requests', 'id'),
      fetchAll('approvals', 'id'),
      fetchAll('audit_log', 'id'),
    ])

    // Postgres is the only source there is — src/data/ ships empty shells since the
    // repository went public — so these are filled unconditionally. An empty table
    // genuinely means "no data", and the app should say so rather than pretend.
    fill(inventory, inv.map(toInventory))
    fill(LEDGER, led.map(toLedger))
    fill(SOH_ROWS, soh.map(toSoh))
    fill(INCOMING_ROWS, skIn.map(toSkLog))
    fill(OUTGOING_ROWS, skOut.map(toSkLog))
    fill(DELIVERY_TRACKER_ROWS, del.map(toDelivery))
    fill(PROJECTS, proj.map((r) => ({ code: r.code, name: r.name })))

    // Transactional tables are authoritative even when empty — that is the point.
    setTransactions({
      movements: mov.map(toMovement),
      reservations: res.map(toReservation),
      purchaseRequests: pr.map(toPurchaseRequest),
      materialRequests: mr.map(toMaterialRequest),
      approvals: appr.map(toApproval),
      auditLog: audit.map(toAudit),
    })

    // Recompute everything derived, in dependency order.
    rebuildLedgerSpan()
    rebuildItems()
    rebuildSafekeeping()
    rebuildDeliveryRows()
    rebuildProjectCodes()

    return {
      source: 'postgres',
      error: null,
      counts: {
        inventory: inv.length, ledger: led.length, safekeeping: soh.length + skIn.length + skOut.length,
        delivery: del.length, movements: mov.length, reservations: res.length,
      },
    }
  } catch (e) {
    // Network failure, missing table, RLS denial — never a blank app.
    return noData(e.message)
  }
}
