// The six charts of the Audit tab.
//
// Kept out of charts.jsx on purpose: those are the stock dashboard's charts, drawn over
// quantities and pesos, and every one of them is imported by the Warehouse tab that
// loads on first paint. These six are only ever needed once someone opens Audit, and
// they measure different things — percentages of a 100-point score, counted lines that
// hit or missed, and defects that are open or closed — so sharing a file would only mean
// sharing a bundle.
//
// Conventions are the stock charts': the `axis`/`gridColor` tick style, a `Box` tooltip
// on `var(--surface)`, `isAnimationActive={false}` everywhere (the dashboards redraw on
// every filter keystroke and animating that is motion sickness), and colours taken from
// the themed role maps in lib/colors rather than written inline.
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  Cell, LabelList, Line, ReferenceLine,
} from 'recharts'
import { useEffect, useState } from 'react'
import { num, peso, compact } from '../lib/format'
import { seriesFor, movementFor, categoricalFor } from '../lib/colors'
import { useTheme } from '../context/ThemeContext'

const axis = { fontSize: 11, fill: 'var(--text-muted)', fontWeight: 600 }
const gridColor = 'var(--border)'
const pct0 = (v) => `${Math.round((v || 0) * 100)}%`

// Thirteen months of value labels need about 40px of column each. On a phone the
// audit series gets 26, and at that width the labels overprint each other — "88%" and
// "90%" merged into one unreadable smear at 375px, which is worse than no label at all.
// So below the tablet breakpoint the printed values come off and the axis plus the
// tooltip carry the numbers instead. Written as a media-query listener rather than a
// one-time width read so rotating a phone re-decides it.
function useNarrow(query = '(max-width: 900px)') {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  )
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia(query)
    const on = () => setNarrow(mq.matches)
    mq.addEventListener('change', on)
    on()
    return () => mq.removeEventListener('change', on)
  }, [query])
  return narrow
}

function Box({ children }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', boxShadow: 'var(--shadow-lg)', fontSize: 12, maxWidth: 320 }}>
      {children}
    </div>
  )
}

// A month tick that also carries its year, on the FIRST month of each year only.
// The audit series spans two years with a gap in the middle (nothing between Sep 2025
// and Mar 2026), so "Feb Mar Apr May Aug Sep Mar Apr" without the year underneath is
// genuinely ambiguous about where one year ends — the report draws a banded year axis
// for the same reason.
// `narrow` thins the run rather than shrinking it. Thirteen month names need ~26px
// each on a phone and "Feb" is 24 — so at 375px the axis rendered as one word,
// "FebMaAprMaAugSep…". Every other month is drawn instead, and a month that OPENS A
// YEAR is always drawn whatever its parity, because it is the tick carrying the year
// underneath it and dropping it would leave the chart spanning two unlabelled years.
function MonthYearTick({ x, y, payload, data, narrow }) {
  const row = data[payload.index]
  const prev = data[payload.index - 1]
  const newYear = !prev || prev.year !== row?.year
  if (narrow && !newYear && payload.index % 2 !== 0) return null
  return (
    <g transform={`translate(${x},${y})`}>
      <text dy={13} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--text-muted)">{payload.value}</text>
      {newYear && <text dy={27} textAnchor="middle" fontSize={10} fontWeight={800} fill="var(--text)">{row.year}</text>}
    </g>
  )
}

// A vertical rule at each year boundary, so the two years read as two blocks rather
// than one 13-month run.
function YearDividers({ data, ...rest }) {
  return data.map((d, i) => (i > 0 && data[i - 1].year !== d.year
    ? <ReferenceLine key={d.key} x={d.label} stroke={gridColor} strokeDasharray="4 4" {...rest} />
    : null))
}

/* ------------------------------------------------------------------ Summary --- */

/**
 * Final audit rating per month. The bar is the month's average overall rating out of
 * 100%, and the reference line is the whole selection's average — without it a run of
 * 74/80/77 reads as "bad" or "fine" depending only on the reader's mood.
 */
export function RatingsByMonthChart({ data, average, height = 300 }) {
  const { theme } = useTheme()
  const S = seriesFor(theme)
  const narrow = useNarrow()
  // Colour carries the grade, so the eye finds the bad months before reading a number:
  // under 75% is the outgoing deep red, 75–85% the warning yellow, 85%+ the green that
  // means "available/healthy" everywhere else in the app.
  const colorFor = (v) => (v < 0.75 ? S.outgoing : v < 0.85 ? S.damaged : S.available)

  return (
    <ResponsiveContainer width="100%" height={height}>
      {/* The right margin holds the average line's label. At 12px it was clipped to
          "a" by the plot edge — the label is the only thing that makes the dashed rule
          legible, so the gutter is its width, not a decoration. */}
      <BarChart data={data} margin={{ top: 24, right: 62, bottom: 18, left: 4 }} barCategoryGap="18%">
        <CartesianGrid vertical={false} stroke={gridColor} strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={<MonthYearTick data={data} narrow={narrow} />} tickLine={false}
          axisLine={{ stroke: gridColor }} interval={0} height={40} />
        <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={pct0} width={44} domain={[0, 1]} />
        <Tooltip cursor={{ fill: 'var(--surface-2)', radius: 6 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const d = payload[0].payload
            return (
              <Box>
                <div style={{ fontWeight: 700, marginBottom: 3 }}>{d.label} {d.year}</div>
                <div style={{ color: colorFor(d.rating), fontWeight: 700 }}>{pct0(d.rating)} final rating</div>
                <div className="muted">average of {d.audits} audit{d.audits === 1 ? '' : 's'}</div>
              </Box>
            )
          }} />
        {average !== undefined && (
          <ReferenceLine y={average} stroke={S.neutral} strokeDasharray="5 4"
            label={{ value: `avg ${pct0(average)}`, position: 'right', fontSize: 10, fontWeight: 700, fill: 'var(--text-muted)' }} />
        )}
        <YearDividers data={data} />
        <Bar dataKey="rating" radius={[6, 6, 0, 0]} maxBarSize={54} isAnimationActive={false}>
          {data.map((d) => <Cell key={d.key} fill={colorFor(d.rating)} fillOpacity={0.9} />)}
          {!narrow && <LabelList dataKey="rating" position="top" formatter={pct0}
            style={{ fontSize: 10, fontWeight: 800, fill: 'var(--text)' }} />}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/**
 * Top high-risk areas — open findings per classification, worst first.
 *
 * Horizontal because the category names are long phrases ("Storage of
 * Chemicals/hazardous Items"); a vertical bar chart would either clip them or turn
 * them 45°.
 */
export function HighRiskChart({ data, height }) {
  const { theme } = useTheme()
  const S = seriesFor(theme)
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <ResponsiveContainer width="100%" height={height || Math.max(180, data.length * 46 + 30)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 52, bottom: 4, left: 4 }}>
        <CartesianGrid horizontal={false} stroke={gridColor} strokeDasharray="3 3" />
        <XAxis type="number" tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={axis} tickLine={false} axisLine={false} width={168} />
        <Tooltip cursor={{ fill: 'var(--surface-2)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const d = payload[0].payload
            return (
              <Box>
                <div style={{ fontWeight: 700, marginBottom: 3 }}>{d.name}</div>
                <div>{num(d.value)} open finding{d.value === 1 ? '' : 's'}</div>
                <div className="muted">across {d.projects} project{d.projects === 1 ? '' : 's'} · {d.criteria}</div>
              </Box>
            )
          }} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={26} isAnimationActive={false}>
          {/* The worst area is the brand red; the rest fade back through the deep red
              so the ranking is visible without reading the axis. */}
          {data.map((d, i) => (
            <Cell key={d.name} fill={i === 0 ? S.total : S.outgoing} fillOpacity={0.35 + 0.65 * (d.value / max)} />
          ))}
          <LabelList dataKey="value" position="right"
            style={{ fontSize: 11, fontWeight: 800, fill: 'var(--text)' }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/* --------------------------------------------------- Inventory Record Accuracy --- */

/**
 * Counted lines that hit and missed, stacked, with the resulting accuracy on the
 * right-hand scale.
 *
 * The stack is what makes the line readable: a 56% month and a 96% month can hold the
 * same number of MISS lines, and only the stack's height says which one was a big count.
 */
export function AccuracyChart({ data, height = 320 }) {
  const { theme } = useTheme()
  const S = seriesFor(theme)
  const M = movementFor(theme)
  const narrow = useNarrow()
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 24, right: 8, bottom: 18, left: 0 }} barCategoryGap="20%">
        <CartesianGrid vertical={false} stroke={gridColor} strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={<MonthYearTick data={data} narrow={narrow} />} tickLine={false}
          axisLine={{ stroke: gridColor }} interval={0} height={40} />
        {/* Headroom on the line-count axis, deliberately generous. The accuracy line
            lives on the RIGHT axis and sits high whenever accuracy is high, which is
            exactly when a big count sits high on the left one — June (724 lines, 91%)
            put the stack's "724" label underneath the line's "91%" and neither could be
            read. Scaling the left axis to 1.5x its own maximum keeps the tallest stack
            clear of the line's label band at every selection. */}
        <YAxis yAxisId="left" tick={axis} tickLine={false} axisLine={false} tickFormatter={compact}
          width={46} domain={[0, (max) => Math.ceil(max * 1.5 / 100) * 100]} />
        <YAxis yAxisId="right" orientation="right" tick={axis} tickLine={false} axisLine={false}
          tickFormatter={pct0} width={44} domain={[0, 1]} />
        <Tooltip cursor={{ fill: 'var(--surface-2)', radius: 6 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const d = payload[0].payload
            return (
              <Box>
                <div style={{ fontWeight: 700, marginBottom: 3 }}>{d.label} {d.year}</div>
                <div style={{ color: M.available, fontWeight: 700 }}>{num(d.hit)} hit</div>
                <div style={{ color: M.total, fontWeight: 700 }}>{num(d.miss)} miss</div>
                <div className="muted">{num(d.lines)} lines counted · {pct0(d.accuracy)} accurate</div>
              </Box>
            )
          }} />
        <YearDividers data={data} yAxisId="left" />
        <Bar yAxisId="left" dataKey="hit" stackId="lines" fill={S.available} fillOpacity={0.85}
          maxBarSize={46} isAnimationActive={false} />
        <Bar yAxisId="left" dataKey="miss" stackId="lines" fill={S.total} fillOpacity={0.9}
          radius={[5, 5, 0, 0]} maxBarSize={46} isAnimationActive={false}>
          {!narrow && <LabelList dataKey="lines" position="top" formatter={compact}
            style={{ fontSize: 10, fontWeight: 700, fill: 'var(--text-muted)' }} />}
        </Bar>
        <Line yAxisId="right" type="monotone" dataKey="accuracy" stroke={M.total} strokeWidth={2.6}
          dot={{ r: 3, fill: M.total }} activeDot={{ r: 5 }} isAnimationActive={false}>
          {!narrow && <LabelList dataKey="accuracy" position="top" formatter={pct0}
            style={{ fontSize: 10, fontWeight: 800, fill: 'var(--text)' }} />}
        </Line>
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/**
 * Financial impact per calendar month — the peso exposure the counts uncovered.
 *
 * Bars are by month ACROSS YEARS (February 2025 and February 2026 are one bar), which
 * is how the Power BI report draws it and is a seasonal read rather than a timeline.
 * The tooltip names the years the bar merges, because the chart itself cannot.
 */
export function VarianceByMonthChart({ data, height = 300 }) {
  const { theme } = useTheme()
  const S = seriesFor(theme)
  const narrow = useNarrow('(max-width: 620px)')
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 24, right: 12, bottom: 4, left: 8 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke={gridColor} strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: gridColor }} interval={0} />
        <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={(v) => `₱${compact(v)}`} width={56} />
        <Tooltip cursor={{ fill: 'var(--surface-2)', radius: 6 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const d = payload[0].payload
            return (
              <Box>
                <div style={{ fontWeight: 700, marginBottom: 3 }}>{d.label}</div>
                <div style={{ color: S.value, fontWeight: 700 }}>{peso(d.value)}</div>
                <div className="muted">{num(d.lines)} lines counted · {d.years.join(' and ')}</div>
              </Box>
            )
          }} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={64} fill={S.total} fillOpacity={0.85}
          isAnimationActive={false}>
          {!narrow && <LabelList dataKey="value" position="top" formatter={(v) => `₱${compact(v)}`}
            style={{ fontSize: 10, fontWeight: 800, fill: 'var(--text)' }} />}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/* ----------------------------------------------------------- Audit Findings --- */

/**
 * Findings raised and closed per month, with the running total of open ones.
 *
 * Signed columns: raised above the zero rule, resolved below it, so a month where the
 * team closed more than the audit raised is visibly a net win. The line is the running
 * total of OPEN findings and never falls — see findingsByMonth() in data/audit.js for
 * why that is the right shape rather than a bug.
 */
export function FindingsStatusChart({ data, height = 330 }) {
  const { theme } = useTheme()
  const S = seriesFor(theme)
  const M = movementFor(theme)
  const narrow = useNarrow()
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 24, right: 8, bottom: 18, left: 0 }} barCategoryGap="20%" stackOffset="sign">
        <CartesianGrid vertical={false} stroke={gridColor} strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={<MonthYearTick data={data} narrow={narrow} />} tickLine={false}
          axisLine={{ stroke: gridColor }} interval={0} height={40} />
        <YAxis yAxisId="left" tick={axis} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
        <YAxis yAxisId="right" orientation="right" tick={axis} tickLine={false} axisLine={false}
          width={40} allowDecimals={false} />
        <Tooltip cursor={{ fill: 'var(--surface-2)', radius: 6 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const d = payload[0].payload
            return (
              <Box>
                <div style={{ fontWeight: 700, marginBottom: 3 }}>{d.label} {d.year}</div>
                <div style={{ color: S.total, fontWeight: 700 }}>{num(d.open)} raised, still open</div>
                <div style={{ color: S.neutral, fontWeight: 700 }}>{num(-d.closed)} closed</div>
                <div className="muted">{num(d.cumulative)} open in total by then · {d.audits} audit{d.audits === 1 ? '' : 's'}</div>
              </Box>
            )
          }} />
        <ReferenceLine yAxisId="left" y={0} stroke={gridColor} />
        <YearDividers data={data} yAxisId="left" />
        <Bar yAxisId="left" dataKey="open" stackId="net" fill={S.total} fillOpacity={0.9}
          radius={[5, 5, 0, 0]} maxBarSize={40} isAnimationActive={false} />
        <Bar yAxisId="left" dataKey="closed" stackId="net" fill={S.neutral} fillOpacity={0.55}
          radius={[0, 0, 5, 5]} maxBarSize={40} isAnimationActive={false} />
        <Line yAxisId="right" type="monotone" dataKey="cumulative" stroke={M.incoming} strokeWidth={2.6}
          dot={{ r: 3, fill: M.incoming }} activeDot={{ r: 5 }} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/**
 * How long the still-open findings have been open.
 *
 * The ramp runs from the healthy green through the warning yellow to brand red, the
 * same escalation the stock dashboard's aging bars use, so "over 120 days" reads as
 * overdue without needing a legend.
 */
export function AgingChart({ bands, height = 300, onPick }) {
  const { theme } = useTheme()
  const S = seriesFor(theme)
  const RAMP = [S.available, S.damaged, S.damaged, S.incoming, S.total]
  const total = bands.reduce((a, b) => a + b.count, 0)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={bands} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }}>
        <CartesianGrid horizontal={false} stroke={gridColor} strokeDasharray="3 3" />
        <XAxis type="number" tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="label" tick={axis} tickLine={false} axisLine={false} width={104} />
        <Tooltip cursor={{ fill: 'var(--surface-2)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const d = payload[0].payload
            return (
              <Box>
                <div style={{ fontWeight: 700, marginBottom: 3 }}>{d.label} open</div>
                <div>{num(d.count)} finding{d.count === 1 ? '' : 's'}</div>
                {total > 0 && <div className="muted">{Math.round(d.count / total * 100)}% of the {num(total)} open</div>}
              </Box>
            )
          }} />
        <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={30} isAnimationActive={false}
          cursor={onPick ? 'pointer' : undefined} onClick={onPick ? (d) => onPick(d.payload) : undefined}>
          {bands.map((b, i) => <Cell key={b.key} fill={RAMP[i] || S.total} fillOpacity={0.88} />)}
          <LabelList dataKey="count" position="right"
            style={{ fontSize: 11, fontWeight: 800, fill: 'var(--text)' }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/**
 * Root-cause split — how much of the open risk is People, Process or Tools.
 *
 * A small horizontal bar rather than a pie: three categories, and the question is
 * "which is biggest by how much", which a bar answers and a pie does not.
 */
export function RootCauseSplitChart({ data, height = 170 }) {
  const { theme } = useTheme()
  const C = categoricalFor(theme)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 52, bottom: 4, left: 4 }}>
        <CartesianGrid horizontal={false} stroke={gridColor} strokeDasharray="3 3" />
        <XAxis type="number" tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={axis} tickLine={false} axisLine={false} width={84} />
        <Tooltip cursor={{ fill: 'var(--surface-2)' }}
          content={({ active, payload }) => (active && payload?.length
            ? <Box><b>{payload[0].payload.name}</b> — {num(payload[0].value)} open findings</Box>
            : null)} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={24} isAnimationActive={false}>
          {data.map((d, i) => <Cell key={d.name} fill={C[i % C.length]} fillOpacity={0.9} />)}
          <LabelList dataKey="value" position="right"
            style={{ fontSize: 11, fontWeight: 800, fill: 'var(--text)' }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
