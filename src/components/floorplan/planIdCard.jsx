import Icon from '../../lib/icons'
import { wrapLabel } from './planText'

// An area's identity plate, drawn INSIDE the plan SVG.
//
// Drawing it in the plan's own coordinate space is what makes a leader line free: both
// ends are already in the same units, so joining a block to its plate is one polyline.
// The trade-off is that type scales with the drawing, so `u` (viewBox units per rendered
// pixel) is passed in and every size is set against it.
//
// Four fields: colour + icon, name, floor area, and occupancy as a bar plus a figure.
// Where nothing records a capacity the track is drawn empty and the figure is a dash —
// an area with no capacity basis must not read as 0% full.

export const CARD_W = 172
export const CARD_H = 42
const PAD = 9
const ICON = 13

export default function PlanIdCard({ x, y, area, m2, pct, u = 1, active }) {
  const s = (px) => px * u
  const textX = x + PAD + s(ICON) + s(6)
  const textW = CARD_W - (PAD + s(ICON) + s(6)) - PAD
  const nameSize = s(9.5)
  const nameLines = wrapLabel(area.name.toUpperCase(), textW, nameSize).slice(0, 2)
  const nameStep = nameSize * 1.15
  const metaSize = s(9.5)

  // The plate GROWS for a wrapped name. At a fixed height the second line of
  // MATERIAL RECOVERY FACILITY ran straight into the floor-area row beneath it.
  const padY = s(8)
  const gap = s(6)
  const nameBlock = nameLines.length * nameStep
  const cardH = padY + nameBlock + gap + metaSize + padY
  const metaY = y + padY + nameBlock + gap + metaSize * 0.85

  const barW = 40
  const barX = x + CARD_W - PAD - barW - s(26)
  const has = pct != null

  return (
    <g className={`fp-id fp-t-${area.role}${active ? ' is-active' : ''}`} pointerEvents="none">
      <rect className="fp-id-bg" x={x} y={y} width={CARD_W} height={cardH} rx="7" />
      <rect className="fp-id-bar" x={x} y={y + s(7)} width="3" height={cardH - s(14)} rx="1.5" />

      {/* icon centred on the name block, not on the whole plate */}
      <g transform={`translate(${x + PAD + 2} ${y + padY + nameBlock / 2 - s(ICON) / 2})`}>
        <Icon name={area.icon} size={s(ICON)} />
      </g>
      <text className="fp-id-name" x={textX} y={y + padY + nameSize * 0.85} style={{ fontSize: nameSize }}>
        {nameLines.map((l, i) => <tspan key={i} x={textX} dy={i === 0 ? 0 : nameStep}>{l}</tspan>)}
      </text>

      {/* floor area, then the occupancy bar and its figure */}
      <text className="fp-id-m2" x={x + PAD + 2} y={metaY} style={{ fontSize: s(8.5) }}>
        {m2 == null ? '—' : `${Math.round(m2).toLocaleString()} m²`}
      </text>
      <rect className="fp-id-track" x={barX} y={metaY - s(4.5)} width={barW} height={s(4.5)} rx={s(2.25)} />
      {has && pct > 0 && (
        <rect
          className="fp-id-fill" x={barX} y={metaY - s(4.5)}
          width={Math.max(s(3), (Math.min(pct, 100) / 100) * barW)} height={s(4.5)} rx={s(2.25)}
        />
      )}
      <text
        className={has ? 'fp-id-pct' : 'fp-id-none'}
        x={x + CARD_W - PAD} y={metaY} textAnchor="end" style={{ fontSize: metaSize }}
      >{has ? `${Math.round(pct)}%` : '—'}</text>
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
