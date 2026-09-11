import { useMemo, useState } from 'react'
import { monthsFromParents, monthAt } from '../data/deliveryGantt'
import { priceCoverage } from '../data/deliveryValue'
import { Toggle } from './ui'
import { categoricalFor } from '../lib/colors'
import { useTheme } from '../context/ThemeContext'
import { num, peso, compact } from '../lib/format'

// ---------------------------------------------------------------------------
// THE RING BESIDE THE CHART — the month the position line is standing in.
//
// It used to be a card under the tracker with its own month arrows. The arrows are gone:
// the Gantt already has a control for "when", and having two was asking the reader to
// keep two notions of the current month in their head. Drag the line and the ring
// follows it, which also means the ring, the EOH column and the floor-space read-out are
// all answering for the same instant.
//
// IT SHOWS MODELLED VALUE. The delivery workbook carries a quantity and a unit of
// measure and no price at all, so every peso here comes from deliveryValue.js — three of
// the seven materials priced off the real inventory list, four assumed outright because
// the list does not stock them. That is a mock-up and the card says so: the footer names
// how many of the month's materials are assumptions rather than letting a peso total
// pass as measured.
//
// Quantity is still carried and still shown per slice, because the units are what take
// floor space and the value is what takes budget — a reader planning either wants both.
//
// DRAWN BY HAND rather than with the shared DistributionDonut. That component is built
// for a card-width ring with leader labels and a legend; at the ~200px this column gets
// it falls back through its width tiers and still wants more room than there is. A pie
// this small needs no labels on it at all — the legend beside it carries the names — so
// the honest version is a few arcs and a list.

const CUTS = [
  { value: 'materials', label: 'Material', icon: 'layers' },
  { value: 'projects', label: 'Project', icon: 'location' },
]

// A slice as an SVG path. Starts at 12 o'clock and runs clockwise, which is the reading
// order for a share — and the arcs are drawn as a donut so the middle can hold the total.
function arc(cx, cy, rOuter, rInner, from, to) {
  const pt = (r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)]
  // A slice at or above a full turn cannot be drawn as one arc — two half circles
  // instead, or the path collapses to nothing and a 100% share renders empty.
  const full = to - from >= Math.PI * 2 - 1e-6
  if (full) {
    const [x0, y0] = pt(rOuter, 0)
    const [x1, y1] = pt(rOuter, Math.PI)
    const [i0, i1] = pt(rInner, 0)
    const [j0, j1] = pt(rInner, Math.PI)
    return `M${x0} ${y0}A${rOuter} ${rOuter} 0 1 1 ${x1} ${y1}A${rOuter} ${rOuter} 0 1 1 ${x0} ${y0}`
      + `M${i0} ${i1}A${rInner} ${rInner} 0 1 0 ${j0} ${j1}A${rInner} ${rInner} 0 1 0 ${i0} ${i1}`
  }
  const large = to - from > Math.PI ? 1 : 0
  const [ax, ay] = pt(rOuter, from)
  const [bx, by] = pt(rOuter, to)
  const [cx2, cy2] = pt(rInner, to)
  const [dx, dy] = pt(rInner, from)
  return `M${ax} ${ay}A${rOuter} ${rOuter} 0 ${large} 1 ${bx} ${by}`
    + `L${cx2} ${cy2}A${rInner} ${rInner} 0 ${large} 0 ${dx} ${dy}Z`
}

// Everything past the fifth slice becomes one "Other" wedge. A 200px ring cannot show
// nine shares legibly, and a list of nine 1% entries is noise rather than detail — the
// exact split is in the panel behind any bar.
const MAX_SLICES = 5

export default function DeliveryMonthPie({ parents, cursor }) {
  const { theme } = useTheme()
  const PALETTE = categoricalFor(theme)
  const [cut, setCut] = useState('materials')

  const { months, undated } = useMemo(() => monthsFromParents(parents), [parents])
  const m = useMemo(() => monthAt(months, cursor), [months, cursor])

  const slices = useMemo(() => {
    const all = (m && m[cut]) || []
    if (all.length <= MAX_SLICES) return all
    const head = all.slice(0, MAX_SLICES)
    const rest = all.slice(MAX_SLICES)
    return [...head, {
      name: `Other (${rest.length})`,
      qty: rest.reduce((a, s) => a + s.qty, 0),
      value: rest.reduce((a, s) => a + s.value, 0),
      other: true,
    }]
  }, [m, cut])

  // THE RING DIVIDES VALUE. Quantity rides along for the legend tooltips.
  const total = slices.reduce((a, s) => a + s.value, 0)
  const totalQty = slices.reduce((a, s) => a + s.qty, 0)
  const cover = useMemo(() => priceCoverage(m?.materialNames || []), [m])

  // Geometry. The viewBox is square and the ring is centred in it, so the SVG can be
  // sized purely by CSS without the arcs drifting off-centre.
  const R = 46
  const RI = 27
  let angle = 0
  const paths = slices.map((s, i) => {
    const sweep = total > 0 ? (s.value / total) * Math.PI * 2 : 0
    const d = arc(50, 50, R, RI, angle, angle + sweep)
    angle += sweep
    return { d, s, colour: s.other ? 'var(--text-faint)' : PALETTE[i % PALETTE.length], pct: total > 0 ? (s.value / total) * 100 : 0 }
  })

  return (
    <aside className="gsp" aria-label="Deliveries in the month at the position line">
      <div className="gsp-head">
        <span className="gsp-when">{m ? m.label : 'No deliveries'}</span>
        <span className="gsp-sub">
          {m
            ? <>{num(m.total)} units · {m.lines} deliver{m.lines === 1 ? 'y' : 'ies'}</>
            : 'in the month at the line'}
        </span>
      </div>

      <Toggle options={CUTS} value={cut} onChange={setCut} size="sm" className="gsp-cut toggle-icons" />

      {!m || total <= 0 ? (
        // THREE different nothings, and they must not read alike. An empty ring means
        // "nothing due", which is the opposite of two of them.
        <p className="gsp-none">
          {!m
            ? 'Nothing scheduled this month.'
            : totalQty <= 0
              ? `${m.lines} deliver${m.lines === 1 ? 'y' : 'ies'}, quantities TBC.`
              : `${num(totalQty)} units due, no modelled price.`}
        </p>
      ) : (
        <>
          <svg className="gsp-ring" viewBox="0 0 100 100" role="img"
            aria-label={`${slices.length} categories by modelled value, largest ${slices[0]?.name} at ${paths[0]?.pct.toFixed(0)}%`}>
            {paths.map((p, i) => (
              <path key={i} d={p.d} fill={p.colour}>
                <title>{`${p.s.name} — ${peso(p.s.value)} modelled, ${p.pct.toFixed(0)}% of the month · ${num(p.s.qty)} units`}</title>
              </path>
            ))}
            {/* Peso in the hole, because the ring is dividing pesos. Abbreviated: the
                figures run into the millions and the hole is 54px across. */}
            <text className="gsp-mid" x="50" y="49">{'₱' + compact(total)}</text>
            <text className="gsp-mid-u" x="50" y="60">modelled</text>
          </svg>

          {/* Value AND share per row. The percentage alone said how the month divides
              up but not how big it is, so a 60% slice of a quiet month read the same as
              60% of a busy one. The peso figure is abbreviated because the column is
              ~190px wide; the exact figure and the unit count are on the row's tooltip. */}
          <ul className="gsp-legend">
            {paths.map((p, i) => (
              <li key={i} title={`${p.s.name} — ${peso(p.s.value)} modelled · ${num(p.s.qty)} units · ${p.pct.toFixed(1)}% of the month`}>
                <i style={{ background: p.colour }} />
                <span className="gsp-nm">{p.s.name}</span>
                <b className="gsp-val">{'₱' + compact(p.s.value)}</b>
                <b className="gsp-pct">{p.pct.toFixed(0)}%</b>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* The priced/assumed split is the one thing that must not go unsaid — a peso
          total made mostly of assumptions cannot read like a measured one — so it is a
          count, not a paragraph. */}
      <p className="gsp-foot">
        <strong>Modelled value.</strong>{' '}
        {cover.list + cover.assumed + cover.none > 0
          ? <>{cover.list} priced{cover.assumed > 0 ? `, ${cover.assumed} assumed` : ''}{cover.none > 0 ? `, ${cover.none} unpriced` : ''}.</>
          : 'No price in the source.'}
        {undated > 0 && ` ${undated} undated.`}
      </p>
    </aside>
  )
}
