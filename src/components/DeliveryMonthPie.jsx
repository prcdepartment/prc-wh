import { useMemo, useState } from 'react'
import { monthsFromParents, monthAt } from '../data/deliveryGantt'
import { Toggle } from './ui'
import { categoricalFor } from '../lib/colors'
import { useTheme } from '../context/ThemeContext'
import { num } from '../lib/format'

// ---------------------------------------------------------------------------
// THE RING BESIDE THE CHART — the month the position line is standing in.
//
// It used to be a card under the tracker with its own month arrows. The arrows are gone:
// the Gantt already has a control for "when", and having two was asking the reader to
// keep two notions of the current month in their head. Drag the line and the ring
// follows it, which also means the ring, the EOH column and the floor-space read-out are
// all answering for the same instant.
//
// IT COUNTS QUANTITY, NOT PESOS. The delivery workbook records a quantity and a unit of
// measure for each line and carries no price on any sheet, and the tracker no longer
// reads the stock workbook that had one. A peso figure would mean multiplying by a unit
// cost nobody quoted for these deliveries — it would look authoritative and be invented.
// The heading says "units", and the note under the chart says it again.
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
    return [...head, { name: `Other (${rest.length})`, qty: rest.reduce((a, s) => a + s.qty, 0), other: true }]
  }, [m, cut])

  const total = slices.reduce((a, s) => a + s.qty, 0)

  // Geometry. The viewBox is square and the ring is centred in it, so the SVG can be
  // sized purely by CSS without the arcs drifting off-centre.
  const R = 46
  const RI = 27
  let angle = 0
  const paths = slices.map((s, i) => {
    const sweep = total > 0 ? (s.qty / total) * Math.PI * 2 : 0
    const d = arc(50, 50, R, RI, angle, angle + sweep)
    angle += sweep
    return { d, s, colour: s.other ? 'var(--text-faint)' : PALETTE[i % PALETTE.length], pct: total > 0 ? (s.qty / total) * 100 : 0 }
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
        // Two different nothings, and they must not read alike: no delivery at all in
        // this month, versus deliveries whose quantities the source has not agreed.
        <p className="gsp-none">
          {m
            ? `${m.lines} deliver${m.lines === 1 ? 'y' : 'ies'} scheduled, every quantity still TBC.`
            : 'Nothing is scheduled in this month. Drag the position line to a month that has deliveries.'}
        </p>
      ) : (
        <>
          <svg className="gsp-ring" viewBox="0 0 100 100" role="img"
            aria-label={`${slices.length} categories, largest ${slices[0]?.name} at ${paths[0]?.pct.toFixed(0)}%`}>
            {paths.map((p, i) => (
              <path key={i} d={p.d} fill={p.colour}>
                <title>{`${p.s.name} — ${num(p.s.qty)} units, ${p.pct.toFixed(0)}%`}</title>
              </path>
            ))}
            <text className="gsp-mid" x="50" y="50">{num(total)}</text>
            <text className="gsp-mid-u" x="50" y="61">units</text>
          </svg>

          <ul className="gsp-legend">
            {paths.map((p, i) => (
              <li key={i} title={`${p.s.name} — ${num(p.s.qty)} units`}>
                <i style={{ background: p.colour }} />
                <span className="gsp-nm">{p.s.name}</span>
                <b>{p.pct.toFixed(0)}%</b>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="gsp-foot">
        Quantity, not value — the source carries no price.
        {undated > 0 && ` ${undated} undated deliver${undated === 1 ? 'y is' : 'ies are'} in no month.`}
      </p>
    </aside>
  )
}
