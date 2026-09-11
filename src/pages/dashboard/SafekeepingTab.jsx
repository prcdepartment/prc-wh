import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { soh, TRADES, SHEET_PROJECTS } from '../../data/safekeeping'
import { KPIS, bySkScope, SK_SCOPES, SHEET_VIEWS } from '../../data/safekeepingInsights'
import { Card, KpiCard, Segmented, Toggle, NoData } from '../../components/ui'
import { CardListPanel, DescCell } from '../../components/MaterialList'
import Select from '../../components/Select'
import DataSheet from '../../components/DataSheet'
import DeliveryTracker from '../../components/DeliveryTracker'
import { DistributionDonut } from '../../components/charts'
import { num } from '../../lib/format'
import { seriesFor } from '../../lib/colors'
import { useTheme } from '../../context/ThemeContext'
import Icon from '../../lib/icons'

// Two sub-views over Safekeeping's own dataset — Overview (what's held and where, plus
// the delivery schedule at the bottom) and Masterlist (the source sheets in full,
// filterable). The old separate Activity view is gone: the Delivery Tracker it held now
// lives at the foot of Overview.
const VIEWS = [
  { key: 'overview', label: 'Overview', icon: 'box' },
  { key: 'masterlist', label: 'Masterlist', icon: 'reports' },
]

// Four cards, not five. "Total Line Items" counted SOH rows, not a warehouse fact
// any of the other four cards' figures depend on — dropping it, Projects/Total
// SOH/Incoming/Outgoing read as one coherent "what's in safekeeping" sentence.
const SK_CARDS = [
  { key: 'distinctProjects', role: 'reserved', label: 'Projects in Safekeeping', icon: 'location', unit: 'projects', tip: 'Distinct projects with materials currently stored at the warehouse.' },
  { key: 'totalSoh', role: 'available', label: 'Total Safekeeping SOH', icon: 'inventory', qty: true, tip: 'Total quantity currently held in safekeeping across every project.' },
  { key: 'totalIn', role: 'incoming', label: 'Incoming', icon: 'incoming', qty: true, tip: 'Quantity received into safekeeping, per the SOH sheet’s In column.' },
  { key: 'totalOut', role: 'outgoing', label: 'Outgoing', icon: 'outgoing', qty: true, tip: 'Quantity pulled out of safekeeping, per the SOH sheet’s Out column.' },
]

// The donut folds everything past the 8th slice into "Others", which lands at index 8.
const ROLLUP_N = 8
function rollup(data, n = ROLLUP_N) {
  if (data.length <= n) return data
  const top = data.slice(0, n)
  const rest = data.slice(n)
  const agg = rest.reduce((a, b) => ({ qty: a.qty + b.qty, count: a.count + b.count, share: a.share + b.share }), { qty: 0, count: 0, share: 0 })
  return [...top, { name: 'Others', label: `Others (${rest.length})`, ...agg, soh: agg.qty, value: 0, valueShare: 0, uom: '' }]
}

// The Distribution list, in the masterlist's compressed Full format — the same look as
// the Warehouse tab's distribution list. Safekeeping lines carry no unit price and there
// is no material profile page to open, so the rows are static (no click): item code, the
// stacked Material Description (detailed description + trade · item group as muted
// secondary lines), SOH and Class.
const SK_DIST_COLUMNS = [
  { key: 'itemCode', label: 'Item Code', mono: true, width: 84, render: (r) => r.itemCode },
  { key: 'description', label: 'Material Description',
    render: (r) => <DescCell title={r.description} subs={[r.detailedDescription, [r.trade, r.itemGroup].filter(Boolean).join(' · ')]} /> },
  { key: 'soh', label: 'SOH', num: true, width: 72, render: (r) => `${num(r.soh)}${r.uom ? ` ${r.uom}` : ''}` },
  { key: 'class', label: 'Class', width: 60, render: (r) => (r.class ? `Class ${r.class}` : '—') },
]

// Distribution list shows the full list by default on a wide screen; on a phone it starts
// collapsed and expands when the donut, a slice or the centre is pressed.
const defaultSkSel = () =>
  (typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches
    ? null
    : { name: 'All lines', all: true })

/* ------------------------------------------------------------ Source sheet tables --- */
// Trade → Item Group vocabulary read off the SOH sheet itself (safekeeping's grouping is
// sheet-specific, not the app's shared trade taxonomy), so a combination that exists in
// the data can never be missing from the cascade.
const ITEM_GROUPS_BY_TRADE = (() => {
  const map = {}
  for (const r of soh) (map[r.trade] ??= new Set()).add(r.itemGroup)
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, [...v].sort()]))
})()
const ALL_ITEM_GROUPS = [...new Set(soh.map((r) => r.itemGroup))].sort()

function SourceTables({ view }) {
  const [search, setSearch] = useState('')
  const [trade, setTrade] = useState('')
  const [itemGroup, setItemGroup] = useState('')
  const [project, setProject] = useState('')
  const hasTradeFields = view.groupBy.some((g) => g.key === 'trade')

  // Switching sheets drops any Trade/Item Group filter the new sheet cannot apply.
  useEffect(() => { if (!hasTradeFields) { setTrade(''); setItemGroup('') } }, [hasTradeFields])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return view.rows().filter((r) => {
      if (project && r.project !== project) return false
      if (hasTradeFields && trade && r.trade !== trade) return false
      if (hasTradeFields && itemGroup && r.itemGroup !== itemGroup) return false
      if (q && !`${r.itemCode} ${r.description} ${r.detailedDescription}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [view, search, trade, itemGroup, project, hasTradeFields])

  const filtersOn = Boolean(search || trade || itemGroup || project)
  const reset = () => { setSearch(''); setTrade(''); setItemGroup(''); setProject('') }

  // In Full view the group path each row belongs to has no band to live in, so it rides
  // under the description — the same trick the masterlist uses. `descKeys` names which
  // fields fold into that secondary line (SOH shows trade · item group); it defaults to
  // the sheet's Section grouping when a sheet does not set it.
  const columns = useMemo(() => {
    const descKeys = view.descKeys || view.groupBy.map((g) => g.key)
    return view.columns.map((c) => (c.desc
      ? { ...c, sub: (r) => [r.detailedDescription, descKeys.map((k) => r[k] || '—').join(' · ')].filter(Boolean).join('  ·  ') }
      : c))
  }, [view])

  return (
    <DataSheet
      columns={columns}
      rows={rows}
      groupBy={view.groupBy}
      aggKey={view.value === 'soh' ? 'soh' : 'qty'}
      aggLabel={view.value === 'soh' ? 'SOH' : 'units'}
      defaultGrouping="full"
      note={view.note}
      filtersOn={filtersOn}
      resetFilters={reset}
      filters={
        <>
          <div className="field lookup inv-search">
            <div className="lookup-box">
              <Icon name="search" size={14} className="lookup-ico" />
              <input className="input lookup-input" placeholder="Search item code or description…"
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <Select value={project} options={SHEET_PROJECTS} placeholder="All Projects" size="sm" onChange={setProject} />
          {hasTradeFields && (
            <>
              <Select value={trade} options={TRADES} placeholder="All Trades" size="sm"
                onChange={(v) => { setTrade(v); setItemGroup('') }} />
              <Select value={itemGroup} options={trade ? (ITEM_GROUPS_BY_TRADE[trade] || []) : ALL_ITEM_GROUPS}
                placeholder="All Item Groups" size="sm" onChange={setItemGroup} align="right" />
            </>
          )}
        </>
      }
    />
  )
}

// `pool` and `qtyUnit` come from the dashboard shell, which owns the filter bar shared
// across all three dashboard tabs.
export default function SafekeepingTab({ pool, qtyUnit = 'units' }) {
  const { theme } = useTheme()
  const S = seriesFor(theme)
  const [params, setParams] = useSearchParams()
  const requested = params.get('view')
  const view = VIEWS.some((v) => v.key === requested) ? requested : 'overview'

  const [scope, setScope] = useState('project')
  const [sheet, setSheet] = useState('soh')
  const [skSel, setSkSel] = useState(defaultSkSel)

  const k = useMemo(() => KPIS(pool), [pool])
  const scopeField = SK_SCOPES.find((s) => s.value === scope)?.key || 'project'
  const scopeRows = useMemo(() => bySkScope(pool, scope, qtyUnit), [pool, scope, qtyUnit])
  const donutRows = useMemo(() => rollup(scopeRows), [scopeRows])
  const sheetView = SHEET_VIEWS.find((v) => v.value === sheet) || SHEET_VIEWS[0]

  // "Others" is the rollup bucket, not a real category — it resolves to every line
  // NOT in one of the named slices, matching the same rule the Warehouse tab's
  // distribution card uses.
  const skRows = useMemo(() => {
    if (!skSel) return []
    if (skSel.all) return [...pool].sort((a, b) => b.soh - a.soh)
    const named = new Set(donutRows.filter((d) => d.name !== 'Others').map((d) => d.name))
    const match = skSel.name === 'Others' ? (r) => !named.has(r[scopeField] || '—') : (r) => (r[scopeField] || '—') === skSel.name
    return pool.filter(match).sort((a, b) => b.soh - a.soh)
  }, [skSel, scopeField, donutRows, pool])

  const selectView = (key) => {
    const next = new URLSearchParams(params)
    if (key === 'overview') next.delete('view')
    else next.set('view', key)
    setParams(next, { replace: true })
  }

  return (
    <>
      <div className="sub-tabs" role="tablist" data-tour="sk-views">
        {VIEWS.map((v) => (
          <button key={v.key} role="tab" aria-selected={v.key === view}
            className={`sub-tab ${v.key === view ? 'active' : ''}`} onClick={() => selectView(v.key)}>
            <Icon name={v.icon} size={15} />
            <span>{v.label}</span>
          </button>
        ))}
      </div>

      {/* ---------------------------------------------------------------- Overview */}
      {view === 'overview' && (
        <div className="mt overview-stack">
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
            {SK_CARDS.map((c) => (
              <KpiCard key={c.key} label={c.label} value={num(k[c.key])}
                unit={c.qty ? qtyUnit : c.unit} icon={c.icon} color={S[c.role]} tooltip={c.tip} />
            ))}
          </div>

          {/* Same UI as the Warehouse tab's Inventory Distribution card: a donut on
              the left, leader-labelled, and the ranked list on the right — clicking a
              slice fills the panel with the safekeeping lines in that category. */}
          <Card title="Safekeeping Distribution" icon="reports" className="distribution-card" data-tour="sk-dist"
            right={
              <div className="chart-controls">
                <Toggle size="sm" options={SK_SCOPES} value={scope}
                  onChange={(v) => { setScope(v); setSkSel(defaultSkSel()) }} />
              </div>
            }>
            <div className="card-split">
              <div className="card-split-main">
                {donutRows.length === 0
                  ? <NoData what="No safekeeping lines loaded" why="Nothing matches the current filter, or the safekeeping sheet is empty." />
                  : <DistributionDonut data={donutRows} metric="qty" hideLegend={false} showValue={false} unit={qtyUnit} leaderLines wide
                      onSliceClick={(d) => setSkSel((s) => (s?.name === d.name ? null : { name: d.name }))}
                      onCenterClick={() => setSkSel({ name: 'All lines', all: true })}
                      selectedName={skSel?.all ? undefined : skSel?.name} />}
              </div>
              <CardListPanel
                selection={skSel ? { label: skSel.name } : null}
                rows={skRows} columns={SK_DIST_COLUMNS} onClear={() => setSkSel(null)} noun="line"
                hint="Click a slice of the ring — or the centre — to list the safekeeping lines." />
            </div>
          </Card>

          {/* The Delivery Tracker sits at the foot of the Overview — the schedule of
              movement in and out of the yard, sourced from the real Warehouse Schedule
              sheet. It used to be its own Activity sub-view. The monthly breakdown ring
              is inside that card now, beside the chart and driven by its position line,
              rather than a second card under it. */}
          <DeliveryTracker />
        </div>
      )}

      {/* --------------------------------------------------------------- Masterlist
          The three source sheets in full, with the same search + filter bar
          convention as the Inventory Master List. There is no unit price or movement
          history to compute aging or ABC analysis from, so browsing the real sheets
          IS the "which lines need attention" view. */}
      {view === 'masterlist' && (
        <div className="mt" data-tour="sk-masterlist">
          <Card pad={false}
            title="Safekeeping Masterlist" icon="reports" iconColor={S.neutral}
            right={<Segmented size="sm" options={SHEET_VIEWS} value={sheet} onChange={setSheet} />}>
            <SourceTables key={sheet} view={sheetView} />
          </Card>
        </div>
      )}
    </>
  )
}
