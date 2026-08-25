import Icon from '../../lib/icons'
import { wrapLabel } from './planText'

// An area's identity plate, drawn INSIDE the plan SVG.
//
// It lives in the plan's own coordinate space rather than as HTML over the top, which is
// what makes the leader line free: both ends are already in the same units, so joining a
// block on the drawing to its plate is one polyline. The trade-off is that the type
// scales with the drawing, so `u` (viewBox units per rendered pixel) is passed in and
// every size is set against it.
//
// Four fields, and only four: colour + icon, name, floor area, occupancy.

export const CARD_W = 196
export const CARD_H = 50
const PAD = 11
const ICON = 18
const GAP = 9

// Where a stack of plates sits: the drawing's top-right corner, like a title block.
export const stackAt = (vbW, n, gap = 7) => ({
  x: vbW - CARD_W - 12,
  y: 12,
  h: n * CARD_H + (n - 1) * gap,
})

export default function PlanIdCard({ x, y, area, m2, pct, u = 1, active }) {
  const s = (px) => px * u
  const textX = x + PAD + s(ICON) + GAP
  const textW = CARD_W - (PAD + s(ICON) + GAP) - PAD
  // A long name (MATERIAL RECOVERY FACILITY) is wider than the plate at heading size.
  // Shrinking it to fit one line would drop it to ~6 px on screen, so it wraps to two
  // instead and the plate is sized for that.
  const nameSize = s(10.5)
  const nameLines = wrapLabel(area.name.toUpperCase(), textW, nameSize).slice(0, 2)
  const nameStep = nameSize * 1.15
  const metaSize = s(9.5)
  // Centre the whole text block — name lines plus the meta row — in the plate.
  const blockH = nameLines.length * nameStep + s(4) + metaSize
  const top = y + (CARD_H - blockH) / 2

  return (
    <g className={`fp-id fp-t-${area.role}${active ? ' is-active' : ''}`} pointerEvents="none">
      <rect className="fp-id-bg" x={x} y={y} width={CARD_W} height={CARD_H} rx="6" />
      <rect className="fp-id-bar" x={x} y={y} width="4" height={CARD_H} rx="2" />
      <g transform={`translate(${x + PAD} ${y + CARD_H / 2 - s(ICON) / 2})`}>
        <Icon name={area.icon} size={s(ICON)} />
      </g>
      <text className="fp-id-name" x={textX} y={top + nameSize * 0.85} style={{ fontSize: nameSize }}>
        {nameLines.map((l, i) => <tspan key={i} x={textX} dy={i === 0 ? 0 : nameStep}>{l}</tspan>)}
      </text>
      <text
        className="fp-id-meta" x={textX}
        y={top + nameLines.length * nameStep + s(4) + metaSize * 0.85}
        style={{ fontSize: metaSize }}
      >
        <tspan>{m2 == null ? '—' : `${Math.round(m2).toLocaleString()} m²`}</tspan>
        <tspan className="fp-id-sep" dx={s(6)}>·</tspan>
        {pct == null
          ? <tspan className="fp-id-none" dx={s(6)}>no capacity data</tspan>
          : <tspan className="fp-id-pct" dx={s(6)}>{Math.round(pct)}% occupied</tspan>}
      </text>
    </g>
  )
}

// Leader line from a point on the drawing to a plate's left edge: out horizontally,
// then straight to the plate, so it never crosses the block it came from.
export function Leader({ from, to }) {
  const midX = (from[0] + to[0]) / 2
  return (
    <g className="fp-leader" pointerEvents="none">
      <circle cx={from[0]} cy={from[1]} r="3.5" />
      <polyline points={`${from[0]},${from[1]} ${midX},${from[1]} ${to[0]},${to[1]}`} />
    </g>
  )
}
