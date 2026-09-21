import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { can } from '../data/roles'
import { items, uomsOf } from '../data/insights'
import FilterSearch, { applyFilters } from '../components/FilterSearch'
import NewTransactionMenu from '../components/NewTransactionMenu'
import InventoryTab from './dashboard/InventoryTab'
import Icon from '../lib/icons'

// Each tab is its own dashboard over its own dataset; only the header, the
// + New Transaction menu and the filter bar are shared. Safekeeping and Excess are
// split out lazily — landing on Inventory (the default) shouldn't pay to parse them.
const SafekeepingTab = lazy(() => import('./dashboard/SafekeepingTab'))
const ExcessTab = lazy(() => import('./dashboard/ExcessTab'))
// Audit is split out for the same reason, and harder: it carries three of its own
// charts and the 3,244-line cycle-count table. None of that belongs in the chunk a
// user downloads to look at stock levels.
const AuditTab = lazy(() => import('./dashboard/AuditTab'))

// Both modals are click-triggered, and AddMaterialModal pulls in the ~830 KB item
// master. Splitting them keeps that weight off the dashboard's initial load entirely.
const AddMaterialModal = lazy(() => import('../components/AddMaterialModal'))
const AddSafekeepingRequestModal = lazy(() => import('../components/AddSafekeepingRequestModal'))

const TABS = [
  // The key stays `inventory` — it is the default tab and never appears in the URL,
  // and every pool/filter variable downstream is already named after it. Only the
  // label changes.
  { key: 'inventory', label: 'Warehouse', icon: 'inventory', title: 'Inventory Insights' },
  { key: 'safekeeping', label: 'Safekeeping', icon: 'vault', title: 'Safekeeping Insights' },
  // Audit is the one tab whose dataset is not stock at all — it is the Project
  // Warehouse Audit programme, scored per project per visit. It owns its own filter
  // bar (see `ownsFilters` below) because the shared search bar's tokens are item
  // codes and trades, which an audit row does not have.
  { key: 'audit', label: 'Audit', icon: 'grade', title: 'Project Warehouse Audit', ownsFilters: true },
  { key: 'excess', label: 'Excess', icon: 'excess', title: 'Excess Materials', locked: true },
  { key: 'scrap', label: 'Scrap', icon: 'scrap', title: 'Scrap Materials', locked: true },
]

// The three full sheets behind Safekeeping (~212 KB) have no business in the bundle a
// user gets just for landing on the Inventory tab (the default). Fetched only once this
// tab is actually selected, and cached at module scope like AddMaterialModal's item
// master, so switching back and forth after the first load never re-fetches.
let skCache = null
function useSafekeepingSoh(enabled) {
  const [soh, setSoh] = useState(skCache)
  useEffect(() => {
    if (!enabled || skCache) return
    let alive = true
    import('../data/safekeeping').then((m) => {
      skCache = m.soh
      if (alive) setSoh(skCache)
    })
    return () => { alive = false }
  }, [enabled])
  return soh
}

export default function Dashboard() {
  const { user } = useAuth()
  // The tab lives in the URL so /dashboard?tab=safekeeping is linkable — the old
  // /safekeeping route redirects there, and the browser Back button works across tabs.
  const [params, setParams] = useSearchParams()
  const requested = params.get('tab')
  const active = TABS.find((t) => t.key === requested && !t.locked) ? requested : 'inventory'
  const tab = TABS.find((t) => t.key === active)

  const [tokens, setTokens] = useState([])
  const [modal, setModal] = useState(null)

  // Both datasets carry itemCode / tradeL1 / tradeL2, so the one filter bar narrows
  // whichever tab is showing without needing a per-tab token vocabulary.
  const invPool = useMemo(() => applyFilters(items, tokens), [tokens])
  const skSoh = useSafekeepingSoh(active === 'safekeeping')
  const skPool = useMemo(() => (skSoh ? applyFilters(skSoh, tokens) : []), [skSoh, tokens])
  const pool = active === 'safekeeping' ? skPool : invPool

  // Derived from the ACTIVE tab's pool, not always the inventory one — the Safekeeping
  // tab's quantity cards have to answer "units of what?" from safekeeping lines, and
  // reading the inventory pool's units there would label them with the wrong UOM.
  const uoms = useMemo(() => uomsOf(pool), [pool])
  // Quantity cards default to a generic "units" label; when the filter search
  // narrows the selection to a single unit of measure, show that UOM instead.
  const qtyUnit = uoms.length === 1 ? uoms[0] : 'units'

  // Receipt is a warehouse action; a Safekeeping transfer is raised by Procurement.
  // A role with neither permission still sees the menu, disabled.
  const canReceipt = can(user.role, 'createMovement') || user.role === 'admin'
  const canSafekeeping = can(user.role, 'createSafekeepingRequest') || user.role === 'admin'
  const allowedForms = [canReceipt && 'material', canSafekeeping && 'safekeeping'].filter(Boolean)

  const selectTab = (key) => {
    const next = new URLSearchParams(params)
    if (key === 'inventory') next.delete('tab')
    else next.set('tab', key)
    // ?view is the Inventory tab's own sub-view; leaving it behind on another tab
    // would silently restore a stale view when the user comes back.
    next.delete('view')
    setParams(next, { replace: true })
  }

  return (
    <>
      {/* Search bar and the + New Transaction trigger share the FIRST row now, right
          under the topbar — "where do I look" and "where do I act" both answered
          before the tab strip even says which module you're in. The button sits at
          the row's right-most end, beside the search bar rather than beside the
          tabs. */}
      <div className="dash-toolbar-row" data-tour="header">
        {/* A tab that owns its filters gets a spacer, not the material search bar:
            applying an item-code token to an audit finding would narrow nothing and
            imply the two datasets are the same one. */}
        {tab.ownsFilters
          ? <div className="dash-toolbar-spacer" />
          : <FilterSearch tokens={tokens} onChange={setTokens} resultCount={pool.length} uoms={uoms}
              noun={active === 'safekeeping' ? 'line' : 'material'} />}
        <NewTransactionMenu
          canCreate={allowedForms.length > 0}
          allowed={allowedForms}
          onPick={(item) => setModal(item.form)}
        />
      </div>

      {/* Tab strip. On its own row now that the toolbar above carries the search and
          the New Transaction trigger. */}
      <div className="dash-tabs mt-sm" role="tablist" data-tour="dash-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={t.key === active}
            className={`dash-tab ${t.key === active ? 'active' : ''} ${t.locked ? 'locked' : ''}`}
            disabled={t.locked}
            title={t.locked ? `${t.label} — coming in Phase 2` : `${t.label} dashboard`}
            onClick={() => selectTab(t.key)}
          >
            <Icon name={t.icon} size={17} />
            <span>{t.label}</span>
            {t.locked && <span className="dash-tab-lock">🔒</span>}
          </button>
        ))}
      </div>

      <div className="mt">
        {active === 'inventory' && <InventoryTab pool={invPool} qtyUnit={qtyUnit} />}
        <Suspense fallback={<div className="page-loading">Loading…</div>}>
          {/* skSoh gates on the data fetch, not just the tab's own code chunk — without
              it the tab would mount and render its first empty-pool frame before its
              212 KB of sheet data has actually arrived. */}
          {active === 'safekeeping' && (skSoh ? <SafekeepingTab pool={skPool} qtyUnit={qtyUnit} /> : <div className="page-loading">Loading…</div>)}
          {active === 'audit' && <AuditTab />}
          {active === 'excess' && <ExcessTab />}
        </Suspense>
      </div>

      <Suspense fallback={null}>
        {modal === 'material' && <AddMaterialModal onClose={() => setModal(null)} />}
        {modal === 'safekeeping' && <AddSafekeepingRequestModal onClose={() => setModal(null)} requestor={user.name} />}
      </Suspense>
    </>
  )
}
