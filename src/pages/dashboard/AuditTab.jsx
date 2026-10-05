import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  selectAudit, scorecard, ratingsByMonth, highRiskAreas, rootCauseTable, summaryKpis,
  accuracyByMonth, varianceByMonth, itemVariance, findingsByMonth, agingBands,
  auditAsOf, findingAge, isDefect, isOpen, typeOfAudit,
  ratingGrade, seriesTrend, projectStandings, exposureLeaders, oldestOpenDays,
  auditWindow, criteriaBreakdown,
  AUDIT_PROJECTS, AUDIT_MONTHS, AUDIT_YEARS, AUDIT_RATINGS, UNCLASSIFIED,
} from '../../data/audit'
import { CRITERIA_META, FINDING_CRITERIA } from '../../data/auditCriteria'
import { Card, NoData, DataTable, Badge } from '../../components/ui'
import Select from '../../components/Select'
import {
  RatingsByMonthChart, HighRiskChart, AccuracyChart, VarianceByMonthChart,
  FindingsStatusChart, AgingChart, RatingGauge,
} from '../../components/AuditCharts'
import { num, peso, compact, fmtDate } from '../../lib/format'
import { seriesFor } from '../../lib/colors'
import { useTheme } from '../../context/ThemeContext'
import Icon from '../../lib/icons'

// The three sub-views are the three visible pages of the Power BI report
// ("MCC. PRC. WM. Project Warehouse Audit Report. 2026.pbix"), in its own order. Its
// hidden fourth page is the audit CALENDAR, drawn from sheets this app does not load —
// that is a scheduling view, not an audit result, and is left out on purpose.
//
// EACH VIEW OPENS WITH ONE HEADLINE PANEL, not a row of equal tiles. Six identically
// weighted boxes say every number matters the same amount, which in an audit programme
// is never true: the rating is the answer, the rest is why. So the panel gives the
// rating a ring and a verdict, the detail that explains it the column beside, and the
// supporting figures a strip underneath where they read as support rather than as
// rivals. Everything below the panel is then an asymmetric pair or a full-width table —
// never another 50/50 split, because a page of equal halves has no reading order.
const VIEWS = [
  { key: 'summary', label: 'Summary', icon: 'grade' },
  { key: 'accuracy', label: 'Record Accuracy', icon: 'inventory' },
  { key: 'findings', label: 'Findings', icon: 'alert' },
]

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pct0 = (v) => `${Math.round((v || 0) * 100)}%`
const pct1 = (v) => `${((v || 0) * 100).toFixed(1)}%`

// The two boundaries that change the verdict, notched onto every rating ring so the
// number is read against the scale. See RATING_BANDS in data/audit.js.
const GRADE_MARKS = [0.75, 0.85]

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

/* ------------------------------------------------------------- panel primitives --- */

/**
 * One supporting figure in a headline panel's bottom strip.
 *
 * Deliberately NOT a card. The strip's figures are read as a set — four readings of the
 * same programme — and giving each its own border, shadow and padding would make four
 * objects out of one instrument panel. They are separated by a hairline and nothing
 * else, which is what keeps the panel reading as a single surface.
 */
function Stat({ label, value, meta, tone }) {
  return (
    <div className="au-stat">
      <span className="au-stat-label">{label}</span>
      <span className="au-stat-value tabular" style={tone ? { color: tone } : undefined}>{value}</span>
      {meta && <span className="au-stat-meta">{meta}</span>}
    </div>
  )
}

/**
 * Period-on-period movement, in PERCENTAGE POINTS.
 *
 * "Up 1.1 points" and "up 1.3%" are different claims and only the first one is true of
 * a move from 88.4 to 89.5; the chip says `pts` so it cannot be read as the other.
 * Direction colour is semantic, not decorative — and `invert` exists because on a
 * findings count, up is the bad direction.
 */
function Delta({ trend, invert = false, unit = 'pts' }) {
  const { theme } = useTheme()
  const S = seriesFor(theme)
  if (!trend || trend.points === null) return null
  const good = invert ? trend.direction === 'down' : trend.direction === 'up'
  const color = trend.direction === 'flat' ? S.neutral : good ? S.available : S.total
  const arrow = trend.direction === 'flat' ? 'minus' : trend.direction === 'up' ? 'arrowUp' : 'arrowDown'
  return (
    <span className="au-delta" style={{ color }}>
      <Icon name={arrow} size={13} />
      {Math.abs(trend.points)} {unit}
      <em>vs {trend.previous.label} {trend.previous.year}</em>
    </span>
  )
}

/**
 * A ranked list with the magnitude drawn behind the row rather than beside it.
 *
 * A bar in its own column costs the width the names need and reads as a second chart;
 * as a tinted track behind the row it costs nothing and still answers "by how much".
 * Rows are clickable where `onPick` is given, which is how the project standings
 * double as a filter.
 */
function RankList({ rows, max, onPick, active, scroll = false }) {
  const top = max || Math.max(1, ...rows.map((r) => r.weight))
  if (!rows.length) return null
  return (
    // `scroll` caps the list where it would otherwise set the height of the whole row:
    // 24 projects beside a five-bar chart leaves the chart's card ending halfway up a
    // list that keeps going. Capped and scrolled, the pair reads as a pair — and every
    // project stays reachable, which matters because finding yours is the point.
    <ol className={`au-rank ${scroll ? 'au-rank-scroll' : ''}`}>
      {rows.map((r, i) => (
        <li key={r.key}>
          <button type="button" className={`au-rank-row ${active === r.key ? 'on' : ''} ${onPick ? '' : 'static'}`}
            onClick={onPick ? () => onPick(r) : undefined} disabled={!onPick}>
            <span className="au-rank-fill" style={{ width: `${Math.max(2, (r.weight / top) * 100)}%`, background: r.color }} />
            <span className="au-rank-no">{i + 1}</span>
            <span className="au-rank-name">
              {r.name}
              {r.meta && <em>{r.meta}</em>}
            </span>
            <span className="au-rank-value tabular" style={{ color: r.color }}>{r.value}</span>
          </button>
        </li>
      ))}
    </ol>
  )
}

/* -------------------------------------------------------------------- scorecard --- */
// The report renders this as a plain four-column table of two percentages. The meter is
// the addition, and it is what makes the five rows comparable at all: a criterion is
// scored out of its OWN weight, so 11 of 15 and 15 of 20 are the same performance and
// two different numbers. The meter shows the performance; the numbers beside it stay
// because they are what people quote in the meeting.
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
            <span className="sc-icon" style={{ color }}><Icon name={meta.icon || 'check'} size={15} /></span>
            <div className="sc-body">
              <div className="sc-head">
                <span className="sc-name">{r.criteria}</span>
                <span className="sc-figure tabular">
                  <b style={{ color }}>{pct0(r.rating)}</b><i>/{pct0(r.weight)}</i>
                </span>
              </div>
              <div className="sc-bar" title={`${pct1(r.rating)} earned of a ${pct0(r.weight)} weight`}>
                <span className="sc-bar-fill" style={{ width: `${Math.min(100, share * 100)}%`, background: color }} />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* --------------------------------------------------------------- table columns --- */
// `au-wrap` is the audit tables' own column flag: findings, root causes and action plans
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
  const standings = useMemo(() => projectStandings(data.ratings), [data.ratings])

  const asOf = auditAsOf()
  const grade = ratingGrade(kpis.rating)
  const gradeColor = { critical: S.outgoing, watch: S.damaged, good: S.available, strong: S.available }[grade.key]
  const ratingTrend = useMemo(() => seriesTrend(months), [months])
  const accuracyTrend = useMemo(() => seriesTrend(accuracy, 'accuracy'), [accuracy])
  // Best and worst month by accuracy — the spread the headline percentage hides. A
  // programme averaging 86% made of 56% and 100% is a different problem from one made
  // of 84% and 88%, and only the spread says which.
  const accuracyRange = useMemo(() => {
    if (!accuracy.length) return null
    const sorted = [...accuracy].sort((a, b) => a.accuracy - b.accuracy)
    return { worst: sorted[0], best: sorted[sorted.length - 1] }
  }, [accuracy])
  const itemsWithVariance = useMemo(() => items.filter((r) => r.variance !== 0).length, [items])
  const span = useMemo(() => auditWindow(data.ratings), [data.ratings])

  // Findings view: one inspection criterion at a time, the way the report's four
  // buttons do it — but chosen from the breakdown panel, which shows all four states
  // at once instead of hiding three behind a control.
  // Ordered by open count, NOT by the form's own criteria order: the panel is numbered,
  // and numbering four rows 1–4 while they read 96, 6, 30, 69 looks like a bug.
  const breakdown = useMemo(
    () => criteriaBreakdown(data.findings, FINDING_CRITERIA).sort((a, b) => b.open - a.open),
    [data.findings])
  const critFindings = useMemo(() => data.findings.filter((x) => x.criteria === criteria), [data.findings, criteria])
  const critMonths = useMemo(() => findingsByMonth(critFindings), [critFindings])
  const bands = useMemo(() => agingBands(critFindings, asOf), [critFindings, asOf])
  const critRow = breakdown.find((b) => b.criteria === criteria) || { open: 0, closed: 0, raised: 0, closureRate: 0 }

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
  const weakest = standings[standings.length - 1]
  const strongest = standings[0]

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
          <section className="au-hero">
            <div className="au-hero-focus">
              <RatingGauge value={kpis.rating} color={gradeColor} marks={GRADE_MARKS} caption="of 100%" />
              <div className="au-hero-say">
                <span className="au-eyebrow">Overall audit rating</span>
                <h2 className="au-hero-title">{grade.label}</h2>
                <Delta trend={ratingTrend} />
                <p className="au-hero-note">
                  {num(kpis.audits)} audit{kpis.audits === 1 ? '' : 's'} across {num(kpis.projects)} project{kpis.projects === 1 ? '' : 's'}
                  {span && <>, {span}</>}.
                  {strongest && weakest && standings.length > 1 && (
                    <> Strongest <b>{strongest.project}</b> at {pct0(strongest.rating)}; weakest <b>{weakest.project}</b> at {pct0(weakest.rating)}.</>
                  )}
                </p>
              </div>
            </div>

            <div className="au-hero-panel">
              <span className="au-eyebrow">Where the score goes</span>
              <Scorecard card={card} />
              <span className="au-hero-foot">Each meter is the score earned against that criterion’s own weight.</span>
            </div>

            <div className="au-hero-strip">
              <Stat label="Open findings" value={num(kpis.open)} tone={kpis.open ? S.total : undefined}
                meta={kpis.open ? `oldest ${num(oldestOpenDays(data.findings, asOf))} days` : 'nothing outstanding'} />
              <Stat label="Closure rate" value={pct0(kpis.closureRate)}
                tone={kpis.closureRate < 0.5 ? S.damaged : S.available}
                meta={`${num(kpis.closed)} closed to date`} />
              <Stat label="Record accuracy" value={pct1(kpis.accuracy)}
                tone={kpis.accuracy < 0.85 ? S.damaged : S.available}
                meta={`${compact(kpis.countedLines)} lines cycle-counted`} />
              <Stat label="Count exposure" value={`₱${compact(kpis.exposure)}`}
                meta="peso value of the gaps found" />
            </div>
          </section>

          <Card title="Final Rating per Month" icon="trend" iconColor={S.total}
            sub={months.length ? `${months.length} months on record · ${num(kpis.audits)} audits` : 'No audits in this selection'}
            right={ratingTrend && (
              <span className="au-headline-chip">
                <b className="tabular">{pct0(ratingTrend.latest.rating)}</b>
                <em>{ratingTrend.latest.label} {ratingTrend.latest.year}</em>
              </span>
            )}
            foot={<span className="muted">Each bar is the mean of that month’s audits. Green from 85%, amber from 75%, red below.</span>}>
            {months.length
              ? <RatingsByMonthChart data={months} average={kpis.rating} height={330} />
              : <NoData what="No audits in this period" why="Widen the project, type or date selection above." />}
          </Card>

          <div className="au-split wide-left">
            <Card title="Highest-Risk Audit Areas" icon="alert" iconColor={S.total}
              sub="Open findings by classification"
              foot={<span className="muted">Ranked by the count of findings still open — not by the report’s own Top-N measure, which ranks finding text alphabetically. See the changelog.</span>}>
              {risk.length
                ? <HighRiskChart data={risk} />
                : <NoData what="Nothing open" why="Every finding in this selection has been closed." />}
            </Card>

            <Card title="Project Standings" icon="location" iconColor={S.neutral}
              sub={`${num(standings.length)} project${standings.length === 1 ? '' : 's'} by average rating`}
              foot={<span className="muted">Click a project to filter the whole tab to it. The report has no equivalent — its Project slicer answers one project at a time.</span>}>
              {standings.length
                ? <RankList
                    rows={standings.map((p) => ({
                      key: p.project,
                      name: p.project,
                      meta: `${p.audits} audit${p.audits === 1 ? '' : 's'} · last ${fmtDate(p.latest)} at ${pct0(p.latestRating)}`,
                      value: pct0(p.rating),
                      weight: p.rating,
                      color: { critical: S.outgoing, watch: S.damaged, good: S.available, strong: S.available }[ratingGrade(p.rating).key],
                    }))}
                    max={1}
                    active={f.project}
                    scroll
                    onPick={(r) => setF((cur) => ({ ...cur, project: cur.project === r.key ? '' : r.key }))}
                  />
                : <NoData what="Nothing rated" why="No audit in this selection carries a rating." />}
            </Card>
          </div>

          <Card title="Open Findings by Root Cause" icon="reports" iconColor={S.neutral} pad={false}
            sub={`${num(causes.reduce((a, r) => a + r.count, 0))} open findings across ${causes.length} distinct causes`}
            right={themeSplit.length > 0 && (
              // The People/Process/Tools split used to be a card of its own holding one
              // three-bar chart. It is the same three numbers, and it belongs to this
              // table — so it rides in the header as a legend-sized reading instead of
              // costing a whole card for three bars.
              <span className="au-inline-split">
                {themeSplit.map((t, i) => (
                  <span key={t.name} className="au-chip">
                    <i style={{ background: [S.total, S.incoming, S.neutral][i % 3] }} />
                    {t.name} <b className="tabular">{num(t.value)}</b>
                  </span>
                ))}
              </span>
            )}>
            {causes.length
              ? <DataTable columns={ROOT_CAUSE_COLUMNS} rows={causes} pageSize={10} />
              : <div className="card-pad"><NoData what="Nothing open" why="No open finding in this selection." /></div>}
          </Card>
        </div>
      )}

      {/* ----------------------------------------------------- Record Accuracy */}
      {view === 'accuracy' && (
        <div className="mt overview-stack">
          <section className="au-hero">
            <div className="au-hero-focus">
              <RatingGauge value={kpis.accuracy} marks={GRADE_MARKS}
                color={kpis.accuracy < 0.85 ? S.damaged : S.available}
                caption="lines matched" />
              <div className="au-hero-say">
                <span className="au-eyebrow">Inventory record accuracy</span>
                <h2 className="au-hero-title">{kpis.accuracy < 0.85 ? 'Below the 85% target' : 'On target'}</h2>
                <Delta trend={accuracyTrend} />
                <p className="au-hero-note">
                  {span && <>{span}. </>}
                  {accuracyRange && (
                    <>Weakest month <b>{accuracyRange.worst.label} {accuracyRange.worst.year}</b> at {pct0(accuracyRange.worst.accuracy)},
                    strongest <b>{accuracyRange.best.label} {accuracyRange.best.year}</b> at {pct0(accuracyRange.best.accuracy)}. </>
                  )}
                  {num(itemsWithVariance)} of {num(items.length)} items counted came up short or over.
                </p>
              </div>
            </div>

            <div className="au-hero-panel">
              <span className="au-eyebrow">Largest exposure by item</span>
              {items.length
                ? <RankList rows={exposureLeaders(items, 5).map((r) => ({
                    key: r.name,
                    name: r.name,
                    meta: `${num(Math.abs(r.variance))} ${r.variance < 0 ? 'short' : 'over'} · ${r.lines} count${r.lines === 1 ? '' : 's'}`,
                    value: `₱${compact(r.varianceValue)}`,
                    weight: r.varianceValue,
                    color: S.value,
                  }))} />
                : <NoData what="Nothing counted" why="No cycle count in this selection." />}
              <span className="au-hero-foot">The table below sorts by units short; this sorts the same rows by money.</span>
            </div>

            <div className="au-hero-strip">
              <Stat label="Lines counted" value={num(kpis.countedLines)} meta={`${num(items.length)} distinct items`} />
              <Stat label="Lines matched" value={num(Math.round(kpis.accuracy * kpis.countedLines))}
                tone={S.available} meta="SAP agreed with the floor" />
              <Stat label="Lines missed" value={num(kpis.countedLines - Math.round(kpis.accuracy * kpis.countedLines))}
                tone={S.total} meta="system and floor disagreed" />
              <Stat label="Total exposure" value={`₱${compact(kpis.exposure)}`}
                meta={accuracy.length ? `across ${accuracy.length} counted months` : 'no counts in range'} />
            </div>
          </section>

          <Card title="Accuracy per Month" icon="trend" iconColor={S.total}
            sub="Counted lines that hit and missed, with the resulting accuracy"
            right={accuracyTrend && (
              <span className="au-headline-chip">
                <b className="tabular">{pct0(accuracyTrend.latest.accuracy)}</b>
                <em>{accuracyTrend.latest.label} {accuracyTrend.latest.year}</em>
              </span>
            )}
            foot={<span className="muted">Bars are counted lines (left axis, hit in green beneath miss in red); the line is accuracy (right axis). Stack height is how big that month’s count was.</span>}>
            {accuracy.length
              ? <AccuracyChart data={accuracy} height={340} />
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
          <section className="au-hero">
            <div className="au-hero-focus">
              <RatingGauge value={critRow.closureRate} marks={[0.5, 0.8]}
                color={critRow.closureRate < 0.5 ? S.outgoing : critRow.closureRate < 0.8 ? S.damaged : S.available}
                caption="closed" />
              <div className="au-hero-say">
                <span className="au-eyebrow">{CRITERIA_META[criteria]?.short || criteria}</span>
                <h2 className="au-hero-title">{num(critRow.open)} finding{critRow.open === 1 ? '' : 's'} still open</h2>
                <p className="au-hero-note">
                  {CRITERIA_META[criteria]?.note}{' '}
                  {critRow.open > 0 && <>The oldest has gone unresolved for <b>{num(oldestOpenDays(critFindings, asOf))} days</b>.</>}
                </p>
              </div>
            </div>

            <div className="au-hero-panel">
              <span className="au-eyebrow">Backlog by inspection area</span>
              {/* This replaced a four-button selector. A selector shows the state of the
                  one area you clicked; this shows all four and is still what you click,
                  which is the question the view exists to answer. */}
              <RankList
                rows={breakdown.map((b) => ({
                  key: b.criteria,
                  name: CRITERIA_META[b.criteria]?.short || b.criteria,
                  meta: `${num(b.raised)} raised · ${pct0(b.closureRate)} closed`,
                  value: num(b.open),
                  weight: b.open,
                  color: b.open === 0 ? S.available : b.closureRate < 0.5 ? S.outgoing : S.damaged,
                }))}
                active={criteria}
                onPick={(r) => { setCriteria(r.key); setBand(null) }}
              />
              <span className="au-hero-foot">Numbers are findings still open. Click an area to drive the charts below.</span>
            </div>

            <div className="au-hero-strip">
              <Stat label="Raised" value={num(critRow.raised)} meta="defects on record for this area" />
              <Stat label="Still open" value={num(critRow.open)} tone={critRow.open ? S.total : S.available}
                meta={`${num(bands.find((b) => b.key === '120+')?.count || 0)} over 120 days`} />
              <Stat label="Closed" value={num(critRow.closed)} tone={S.available} meta="resolved against an action plan" />
              <Stat label="Closure rate" value={pct0(critRow.closureRate)}
                tone={critRow.closureRate < 0.5 ? S.damaged : S.available} meta="of everything resolved either way" />
            </div>
          </section>

          <div className="au-split wide-left">
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
