import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  selectAudit, scorecard, ratingsByMonth, highRiskAreas, rootCauseTable, summaryKpis,
  accuracyByMonth, varianceByMonth, itemVariance, findingsByMonth, agingBands,
  auditAsOf, findingAge, isDefect, isOpen, typeOfAudit,
  AUDIT_PROJECTS, AUDIT_MONTHS, AUDIT_YEARS, AUDIT_RATINGS, UNCLASSIFIED,
} from '../../data/audit'
import { CRITERIA_META, FINDING_CRITERIA } from '../../data/auditCriteria'
import { Card, KpiCard, Segmented, NoData, DataTable, Badge } from '../../components/ui'
import Select from '../../components/Select'
import {
  RatingsByMonthChart, HighRiskChart, AccuracyChart, VarianceByMonthChart,
  FindingsStatusChart, AgingChart, RootCauseSplitChart,
} from '../../components/AuditCharts'
import { num, peso, compact, fmtDate } from '../../lib/format'
import { seriesFor } from '../../lib/colors'
import { useTheme } from '../../context/ThemeContext'
import Icon from '../../lib/icons'

// The three sub-views are the three visible pages of the Power BI report
// ("MCC. PRC. WM. Project Warehouse Audit Report. 2026.pbix"), in its own order. Its
// hidden fourth page is the audit CALENDAR, drawn from sheets this app does not load —
// that is a scheduling view, not an audit result, and is left out on purpose.
const VIEWS = [
  { key: 'summary', label: 'Summary', icon: 'grade' },
  { key: 'accuracy', label: 'Record Accuracy', icon: 'inventory' },
  { key: 'findings', label: 'Findings', icon: 'alert' },
]

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pct0 = (v) => `${Math.round((v || 0) * 100)}%`
const pct1 = (v) => `${((v || 0) * 100).toFixed(1)}%`

/* ------------------------------------------------------------------ filter bar --- */
// The Audit tab does NOT use the dashboard's shared FilterSearch: that bar's tokens are
// item codes and trades over stock lines, and an audit row has neither. These four are
// the report's own slicers — Project Name, Project Type and the Date-of-Audit
// year/month hierarchy — as plain single-value selects, which is the filter idiom the
// rest of this app already uses.
function AuditFilters({ f, onChange }) {
  const monthsInYear = useMemo(() => {
    const months = AUDIT_MONTHS.filter((m) => !f.year || m.startsWith(f.year))
    return months.map((m) => MONTH_NAMES[Number(m.slice(5, 7)) - 1])
  }, [f.year])

  const on = Boolean(f.project || f.type || f.year || f.month)
  return (
    <div className="audit-filters">
      <span className="audit-filters-label"><Icon name="filter" size={14} /> Audit selection</span>
      <Select value={f.project} options={AUDIT_PROJECTS} placeholder="All Projects" size="sm"
        onChange={(v) => onChange({ ...f, project: v })} />
      <Select value={f.type} options={['Vertical', 'Horizontal', UNCLASSIFIED]} placeholder="All Project Types" size="sm"
        onChange={(v) => onChange({ ...f, type: v })} />
      <Select value={f.year} options={AUDIT_YEARS} placeholder="All Years" size="sm"
        onChange={(v) => onChange({ ...f, year: v, month: '' })} />
      <Select value={f.month} options={monthsInYear} placeholder="All Months" size="sm" align="right"
        onChange={(v) => onChange({ ...f, month: v })} />
      {on && (
        <button className="btn btn-sm btn-ghost" onClick={() => onChange({ project: '', type: '', year: '', month: '' })}>
          Clear
        </button>
      )}
    </div>
  )
}

/** The filter state as selectAudit()'s shape. Month without a year spans every year. */
function toSelection(f) {
  const monthNum = f.month ? String(MONTH_NAMES.indexOf(f.month) + 1).padStart(2, '0') : ''
  const sel = {
    projects: f.project ? [f.project] : [],
    types: f.type ? [f.type] : [],
  }
  if (f.year && monthNum) {
    // Last day of the month, without a calendar table: day 0 of the next month.
    const last = new Date(Number(f.year), Number(monthNum), 0).getDate()
    sel.from = `${f.year}-${monthNum}-01`
    sel.to = `${f.year}-${monthNum}-${String(last).padStart(2, '0')}`
  } else if (f.year) {
    sel.from = `${f.year}-01-01`
    sel.to = `${f.year}-12-31`
  }
  return { sel, monthNum }
}

/* -------------------------------------------------------------------- scorecard --- */
// The report renders this as a plain four-column table. The bar is the addition: a
// criterion's rating is a score out of its OWN weight, so "11% of 15%" and "15% of 20%"
// are not comparable as numbers but are immediately comparable as a filled bar. The
// number kept alongside is the one people quote in the meeting.
function Scorecard({ card }) {
  const { theme } = useTheme()
  const S = seriesFor(theme)
  if (!card.rows.length) return <NoData what="No audit scored" why="No audit in the current selection has a rating on file." />

  return (
    <div className="scorecard">
      {card.rows.map((r) => {
        const share = r.weight ? r.rating / r.weight : 0
        const color = share < 0.75 ? S.outgoing : share < 0.9 ? S.damaged : S.available
        const meta = CRITERIA_META[r.criteria] || {}
        return (
          <div className="sc-row" key={r.criteria}>
            <span className="sc-no">{r.num}</span>
            <span className="sc-icon" style={{ color }}><Icon name={meta.icon || 'check'} size={16} /></span>
            <div className="sc-body">
              <div className="sc-name">{r.criteria}</div>
              <div className="sc-note">{meta.note}</div>
              <div className="sc-bar" title={`${pct1(r.rating)} earned of a ${pct0(r.weight)} weight`}>
                <span className="sc-bar-fill" style={{ width: `${Math.min(100, share * 100)}%`, background: color }} />
              </div>
            </div>
            <span className="sc-weight tabular">{pct0(r.weight)}</span>
            <span className="sc-rating tabular" style={{ color }}>{pct0(r.rating)}</span>
          </div>
        )
      })}
      <div className="sc-row sc-total">
        <span className="sc-no" />
        <span className="sc-icon" />
        <div className="sc-body"><div className="sc-name">Total</div></div>
        <span className="sc-weight tabular">{pct0(card.weight)}</span>
        <span className="sc-rating tabular">{pct0(card.rating)}</span>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- table columns --- */
// `wrap` is the audit tables' own column flag: findings, root causes and action plans
// are whole paragraphs of the auditor's prose, and the shared table's nowrap default
// would push them off the right edge of the page.
const ROOT_CAUSE_COLUMNS = [
  { key: 'classification', label: 'Audit Finding', width: 190,
    render: (r) => <span className="au-strong">{r.classification}</span> },
  { key: 'theme', label: 'Theme', width: 90,
    render: (r) => (r.theme ? <Badge tone={r.theme === 'People' ? 'warn' : r.theme === 'Process' ? 'info' : 'neutral'}>{r.theme}</Badge> : <span className="faint">—</span>) },
  { key: 'rootCause', label: 'Root Cause', sortable: false,
    render: (r) => <div className="au-wrap">{r.rootCause || <span className="faint">not recorded</span>}</div> },
  { key: 'projects', label: 'Projects', width: 130, sortable: false,
    render: (r) => <div className="au-wrap au-faint">{r.projects.join(', ')}</div> },
  { key: 'count', label: 'Findings', num: true, width: 84, render: (r) => num(r.count) },
]

const ITEM_COLUMNS = [
  { key: 'name', label: 'Item Description',
    render: (r) => (
      <div className="au-item">
        <span className="au-strong">{r.name}</span>
        <span className="au-faint">{r.itemCode || '—'}{r.uoms.length ? ` · ${r.uoms.join(' / ')}` : ''}{r.lines > 1 ? ` · ${r.lines} counts` : ''}</span>
      </div>
    ) },
  { key: 'systemQty', label: 'System Qty', num: true, width: 110, render: (r) => num(r.systemQty) },
  { key: 'actualQty', label: 'Actual Qty', num: true, width: 110, render: (r) => num(r.actualQty) },
  { key: 'variance', label: 'Variance', num: true, width: 110,
    render: (r) => <span className={r.variance < 0 ? 'au-neg' : r.variance > 0 ? 'au-pos' : 'faint'}>{r.variance === 0 ? '—' : num(r.variance)}</span> },
  { key: 'varianceValue', label: 'Exposure', num: true, width: 120,
    render: (r) => (r.varianceValue ? peso(r.varianceValue) : <span className="faint">—</span>) },
]

/* ------------------------------------------------------------------------ tab --- */
export default function AuditTab() {
  const { theme } = useTheme()
  const S = seriesFor(theme)
  const [params, setParams] = useSearchParams()
  const requested = params.get('view')
  const view = VIEWS.some((v) => v.key === requested) ? requested : 'summary'

  const [f, setF] = useState({ project: '', type: '', year: '', month: '' })
  const [criteria, setCriteria] = useState(FINDING_CRITERIA[0])
  const [band, setBand] = useState(null)

  const { sel, monthNum } = useMemo(() => toSelection(f), [f])

  // A month picked without a year means "every February on record", which the
  // from/to bounds cannot express — so that one case filters after selection.
  const data = useMemo(() => {
    const picked = selectAudit(sel)
    if (!f.year && monthNum) {
      const inMonth = (r) => r.date.slice(5, 7) === monthNum
      return { ratings: picked.ratings.filter(inMonth), findings: picked.findings.filter(inMonth), counts: picked.counts.filter(inMonth) }
    }
    return picked
  }, [sel, monthNum, f.year])

  const kpis = useMemo(() => summaryKpis(data), [data])
  const card = useMemo(() => scorecard(data.ratings), [data.ratings])
  const months = useMemo(() => ratingsByMonth(data.ratings), [data.ratings])
  const risk = useMemo(() => highRiskAreas(data.findings), [data.findings])
  const causes = useMemo(() => rootCauseTable(data.findings), [data.findings])
  const accuracy = useMemo(() => accuracyByMonth(data.counts), [data.counts])
  const variance = useMemo(() => varianceByMonth(data.counts), [data.counts])
  const items = useMemo(() => itemVariance(data.counts), [data.counts])

  // Findings page: narrowed to one inspection criterion, the way the report's four
  // buttons do it. Record Accuracy is not among them — it has a whole page of its own.
  const critFindings = useMemo(() => data.findings.filter((x) => x.criteria === criteria), [data.findings, criteria])
  const critMonths = useMemo(() => findingsByMonth(critFindings), [critFindings])
  const asOf = auditAsOf()
  const bands = useMemo(() => agingBands(critFindings, asOf), [critFindings, asOf])
  const themeSplit = useMemo(() => {
    const open = data.findings.filter((x) => isDefect(x) && isOpen(x))
    return ['People', 'Process', 'Tools'].map((name) => ({
      name,
      value: open.filter((x) => x.rootCause.toLowerCase() === name.toLowerCase() || x.rootCause.toLowerCase().startsWith(`${name.toLowerCase()} -`)).length,
    })).filter((r) => r.value > 0)
  }, [data.findings])

  const detail = useMemo(() => {
    const rows = band ? band.rows : critFindings.filter(isDefect)
    return [...rows].sort((a, b) => (a.status === b.status ? b.date.localeCompare(a.date) : a.status === 'Open' ? -1 : 1))
  }, [band, critFindings])

  const selectView = (key) => {
    const next = new URLSearchParams(params)
    if (key === 'summary') next.delete('view')
    else next.set('view', key)
    setParams(next, { replace: true })
  }

  // Nothing loaded at all is a different statement from "your filter matched nothing",
  // and Settings -> Data source is where the reason for the first one lives.
  if (!AUDIT_RATINGS.length) {
    return (
      <div className="mt">
        <NoData what="No audit data loaded"
          why="public.audit_ratings came back empty. Check Settings → Data source, then run the audit migration and re-paste the seed files." />
      </div>
    )
  }

  const scope = [f.project || 'all projects', f.type && f.type.toLowerCase(), f.month, f.year]
    .filter(Boolean).join(' · ')

  const FINDING_DETAIL_COLUMNS = [
    { key: 'date', label: 'Audited', width: 108, render: (r) => fmtDate(r.date) },
    { key: 'project', label: 'Project', width: 140,
      render: (r) => <div className="au-wrap"><span className="au-strong">{r.project}</span><span className="au-faint">{typeOfAudit(r)}</span></div> },
    { key: 'classification', label: 'Audit Finding', width: 160,
      render: (r) => <span className="au-strong">{r.classification}</span> },
    { key: 'finding', label: 'Finding', sortable: false, render: (r) => <div className="au-wrap">{r.finding}</div> },
    { key: 'rootCause', label: 'Root Cause', sortable: false, render: (r) => <div className="au-wrap">{r.rootCause || <span className="faint">not recorded</span>}</div> },
    { key: 'actionPlan', label: 'Action Plan', sortable: false, render: (r) => <div className="au-wrap">{r.actionPlan || <span className="faint">none on file</span>}</div> },
    { key: 'status', label: 'Status', width: 116,
      sortValue: (r) => (r.status === 'Open' ? `0${1e6 - (findingAge(r, asOf) ?? 0)}` : `1${r.status}`),
      render: (r) => (r.status === 'Open'
        ? <div className="au-wrap"><Badge tone="danger">Open</Badge><span className="au-faint">{num(findingAge(r, asOf))} days</span></div>
        : <div className="au-wrap"><Badge tone="ok">{r.status}</Badge>{r.closeDate && <span className="au-faint">{fmtDate(r.closeDate)}</span>}</div>) },
  ]

  return (
    <>
      <div className="sub-tabs" role="tablist">
        {VIEWS.map((v) => (
          <button key={v.key} role="tab" aria-selected={v.key === view}
            className={`sub-tab ${v.key === view ? 'active' : ''}`} onClick={() => selectView(v.key)}>
            <Icon name={v.icon} size={15} />
            <span>{v.label}</span>
          </button>
        ))}
      </div>

      <AuditFilters f={f} onChange={(next) => { setF(next); setBand(null) }} />

      {/* ------------------------------------------------------------- Summary */}
      {view === 'summary' && (
        <div className="mt overview-stack">
          <div className="kpi-grid">
            <KpiCard label="Audits Conducted" value={num(kpis.audits)} unit={`${kpis.projects} projects`}
              icon="doc" color={S.neutral}
              tooltip="An audit is one project inspected on one date. Each scores the same five weighted criteria." />
            <KpiCard label="Overall Rating" value={pct0(kpis.rating)} unit="of 100%"
              icon="grade" color={kpis.rating < 0.75 ? S.outgoing : kpis.rating < 0.85 ? S.damaged : S.available}
              tooltip="The average audit score across the selection — the sum of the five weighted criteria ratings." />
            <KpiCard label="Open Findings" value={num(kpis.open)} unit="awaiting closure"
              icon="alert" color={S.total}
              tooltip="Defects raised and not yet closed. Excludes “Compliant” rows, which record that a criterion was checked and nothing was wrong." />
            <KpiCard label="Closure Rate" value={pct0(kpis.closureRate)} unit={`${num(kpis.closed)} closed`}
              icon="check" color={kpis.closureRate < 0.5 ? S.damaged : S.available}
              tooltip="Closed findings as a share of everything raised and resolved either way. N/A rows are excluded from both sides." />
            <KpiCard label="Record Accuracy" value={pct0(kpis.accuracy)} unit={`${compact(kpis.countedLines)} lines counted`}
              icon="inventory" color={kpis.accuracy < 0.85 ? S.damaged : S.available}
              tooltip="Share of cycle-counted lines the auditor marked HIT — SAP agreed with the floor." />
            <KpiCard label="Count Exposure" value={`₱${compact(kpis.exposure)}`} unit="variance value found"
              icon="reports" color={S.value}
              tooltip="Total peso value of the gaps the cycle counts uncovered, as recorded on the count sheet." />
          </div>

          <div className="grid grid-2 audit-grid">
            <Card title="Inspection Criteria" icon="grade" iconColor={S.neutral}
              sub={`Weighted scorecard · ${scope}`}>
              <Scorecard card={card} />
            </Card>

            <Card title="Final Rating per Month" icon="trend" iconColor={S.total}
              sub={months.length ? `${months.length} months on record · ${num(kpis.audits)} audits` : 'No audits in this selection'}
              foot={<span className="muted">Each bar is the mean of that month’s audits. Green from 85%, amber from 75%, red below.</span>}>
              {months.length
                ? <RatingsByMonthChart data={months} average={kpis.rating} />
                : <NoData what="No audits in this period" why="Widen the project, type or date selection above." />}
            </Card>
          </div>

          <div className="grid grid-2 audit-grid">
            <Card title="Highest-Risk Audit Areas" icon="alert" iconColor={S.total}
              sub="Open findings by classification"
              foot={<span className="muted">Ranked by the count of findings still open — not by the report’s own Top-N measure, which ranks finding text alphabetically. See the changelog.</span>}>
              {risk.length
                ? <HighRiskChart data={risk} />
                : <NoData what="Nothing open" why="Every finding in this selection has been closed." />}
            </Card>

            <Card title="Open Risk by Root Cause" icon="flow" iconColor={S.incoming}
              sub={themeSplit.length ? 'People, Process or Tools — as classified by the auditor' : 'The auditor recorded no People/Process/Tools theme here'}>
              {themeSplit.length
                ? <RootCauseSplitChart data={themeSplit} />
                : <NoData what="No theme recorded" why="Root causes in this selection are free text with no People/Process/Tools prefix." />}
            </Card>
          </div>

          <Card title="Open Findings by Root Cause" icon="reports" iconColor={S.neutral} pad={false}
            sub={`${num(causes.reduce((a, r) => a + r.count, 0))} open findings across ${causes.length} distinct causes`}>
            {causes.length
              ? <DataTable columns={ROOT_CAUSE_COLUMNS} rows={causes} pageSize={10} />
              : <div className="card-pad"><NoData what="Nothing open" why="No open finding in this selection." /></div>}
          </Card>
        </div>
      )}

      {/* ----------------------------------------------------- Record Accuracy */}
      {view === 'accuracy' && (
        <div className="mt overview-stack">
          <div className="kpi-grid kpi-grid-4">
            <KpiCard label="Lines Counted" value={num(kpis.countedLines)} unit="cycle-count lines"
              icon="inventory" color={S.neutral}
              tooltip="Every item line counted during an audit in this selection." />
            <KpiCard label="Record Accuracy" value={pct1(kpis.accuracy)}
              unit={`${num(Math.round(kpis.accuracy * kpis.countedLines))} hit`}
              icon="check" color={kpis.accuracy < 0.85 ? S.damaged : S.available}
              tooltip="Share of lines marked HIT by the auditor. The count sheet's own verdict, not a recomputation." />
            <KpiCard label="Lines Missed" value={num(kpis.countedLines - Math.round(kpis.accuracy * kpis.countedLines))}
              unit="SAP disagreed with the floor" icon="alert" color={S.total}
              tooltip="Lines where the system quantity did not match the physical count." />
            <KpiCard label="Total Exposure" value={`₱${compact(kpis.exposure)}`} unit="variance value"
              icon="reports" color={S.value}
              tooltip="The peso value of every gap found, as the count sheet records it — absolute, so shorts and overs both add to it." />
          </div>

          <Card title="Inventory Record Accuracy" icon="trend" iconColor={S.total}
            sub="Counted lines that hit and missed, with the resulting accuracy"
            foot={<span className="muted">Bars are counted lines (left axis, hit in green beneath miss in red); the line is accuracy (right axis). Stack height is how big that month’s count was.</span>}>
            {accuracy.length
              ? <AccuracyChart data={accuracy} />
              : <NoData what="No counts in this selection" why="No cycle count was recorded for these projects and dates." />}
          </Card>

          <Card title="Financial Impact to Inventory Balance" icon="reports" iconColor={S.value}
            sub="Variance value by calendar month, both years combined"
            foot={<span className="muted">A bar merges the same month across years — February is 2025 and 2026 together — matching the source report. The tooltip names the years behind each one.</span>}>
            {variance.length
              ? <VarianceByMonthChart data={variance} />
              : <NoData what="No variance recorded" why="No cycle count in this selection found a value gap." />}
          </Card>

          <Card title="Variance by Item" icon="layers" iconColor={S.neutral} pad={false}
            sub={`${num(items.length)} items counted · biggest shortfall first`}>
            {items.length
              ? <DataTable columns={ITEM_COLUMNS} rows={items} pageSize={12} />
              : <div className="card-pad"><NoData what="Nothing counted" why="No count lines in this selection." /></div>}
          </Card>
        </div>
      )}

      {/* ------------------------------------------------------------ Findings */}
      {view === 'findings' && (
        <div className="mt overview-stack">
          <div className="audit-crit-bar">
            <Segmented size="sm" value={criteria} onChange={(v) => { setCriteria(v); setBand(null) }}
              options={FINDING_CRITERIA.map((c) => ({
                value: c, label: CRITERIA_META[c]?.short || c, icon: CRITERIA_META[c]?.icon,
              }))} />
            <span className="muted audit-crit-note">{CRITERIA_META[criteria]?.note}</span>
          </div>

          <div className="grid grid-2 audit-grid">
            <Card title="Raised and Closed per Month" icon="trend" iconColor={S.total}
              sub={`${CRITERIA_META[criteria]?.short || criteria} · ${scope}`}
              foot={<span className="muted">Raised above the line, closed below it. The orange line is the running total of open findings — it counts what was raised, so closing one does not pull it down.</span>}>
              {critMonths.length
                ? <FindingsStatusChart data={critMonths} />
                : <NoData what="No findings here" why="This criterion raised nothing in the current selection." />}
            </Card>

            <Card title="Aging of Open Findings" icon="clock" iconColor={S.incoming}
              sub={`${num(bands.reduce((a, b) => a + b.count, 0))} open · as of ${fmtDate(asOf)}`}
              foot={<span className="muted">
                Days since the audit that raised the finding. Click a band to list it below.
                {band && <> Showing <b>{band.label}</b> — <button className="link-btn" onClick={() => setBand(null)}>show all</button>.</>}
              </span>}>
              {bands.some((b) => b.count)
                ? <AgingChart bands={bands} onPick={(b) => setBand((cur) => (cur?.key === b.key ? null : bands.find((x) => x.key === b.key)))} />
                : <NoData what="Nothing open" why="Every finding for this criterion has been closed." />}
            </Card>
          </div>

          <Card title={band ? `Findings Open ${band.label}` : 'Audit Findings'} icon="doc" iconColor={S.neutral} pad={false}
            sub={`${num(detail.length)} record${detail.length === 1 ? '' : 's'} · ${CRITERIA_META[criteria]?.short || criteria}`}>
            {detail.length
              ? <DataTable columns={FINDING_DETAIL_COLUMNS} rows={detail} pageSize={8}
                  initialSort={{ key: 'status', dir: 'asc' }} />
              : <div className="card-pad"><NoData what="No findings" why="Nothing matches this criterion and selection." /></div>}
          </Card>
        </div>
      )}
    </>
  )
}
