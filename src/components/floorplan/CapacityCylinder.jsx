import { useState } from 'react'
import { num } from '../../lib/format'
import Icon from '../../lib/icons'

// A stacked capacity cylinder, seen slightly from above and filled from the base up,
// after the HyperOS storage meter. Shared by both map levels: level 1 stacks
// warehouse / safekeeping / free space, level 2 stacks the five material areas.
//
// The 3D is honest about being decoration — every band's height is exactly its share of
// the total, so this is a stacked bar that happens to be round. Hovering a band, or its
// row in the key, draws a leader line out to the figures.
//
// `segments` is ordered base-first and the LAST one is treated as the empty remainder:
// it is drawn as clear glass rather than a filled slab.

const VB = { w: 330, h: 470 }
const CX = 106
const RX = 74
const RY = 21
const Y_TOP = 40
const Y_BASE = 404
const H = Y_BASE - Y_TOP
const LEADER_X = 198

// One slab: a straight wall closed by the FRONT half of the ellipse at each end, so the
// bottom bulges toward the viewer and the top is capped by its own full ellipse.
const slab = (yTop, yBot) =>
  `M ${CX - RX} ${yTop} L ${CX - RX} ${yBot}` +
  ` A ${RX} ${RY} 0 0 0 ${CX + RX} ${yBot}` +
  ` L ${CX + RX} ${yTop}` +
  ` A ${RX} ${RY} 0 0 1 ${CX - RX} ${yTop} Z`

export default function CapacityCylinder({ segments, positions, subtitle, unit = 'pos.' }) {
  const [hot, setHot] = useState(null)

  let cursor = Y_BASE
  const bands = segments.map((seg, i) => {
    const h = (Math.max(0, seg.pct) / 100) * H
    const yBot = cursor
    const yTop = cursor - h
    cursor = yTop
    return { ...seg, empty: i === segments.length - 1, yTop, yBot, h, mid: (yTop + yBot) / 2 }
  })
  const filled = bands.filter((b) => !b.empty)
  const topOfFill = filled.length ? Math.min(...filled.map((b) => b.yTop)) : Y_BASE
  const empty = bands[bands.length - 1]

  return (
    <div className="cap-widget cap-3d is-bare">
      {subtitle && (
        <div className="cap-widget-head">
          <div className="cap-widget-sub">{subtitle}</div>
        </div>
      )}

      <div className="cap-3d-stage">
        <svg viewBox={`0 0 ${VB.w} ${VB.h}`} preserveAspectRatio="xMidYMid meet" role="img"
          aria-label={`Capacity across ${num(positions)} positions: ${bands.map((b) => `${b.label} ${Math.round(b.pct)}%`).join(', ')}`}>
          <defs>
            {/* curvature: dark at both edges, a highlight left of centre */}
            <linearGradient id="cap-curve" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#000" stopOpacity="0.38" />
              <stop offset="18%" stopColor="#000" stopOpacity="0.08" />
              <stop offset="34%" stopColor="#fff" stopOpacity="0.20" />
              <stop offset="55%" stopColor="#000" stopOpacity="0.02" />
              <stop offset="82%" stopColor="#000" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#000" stopOpacity="0.42" />
            </linearGradient>
            <linearGradient id="cap-glass" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--cap-av)" stopOpacity="0.22" />
              <stop offset="34%" stopColor="var(--cap-av)" stopOpacity="0.06" />
              <stop offset="100%" stopColor="var(--cap-av)" stopOpacity="0.20" />
            </linearGradient>
            <radialGradient id="cap-shadow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#000" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#000" stopOpacity="0" />
            </radialGradient>
          </defs>

          <ellipse className="cap-ground" cx={CX} cy={Y_BASE + RY + 12} rx={RX * 1.02} ry={RY * 0.5} fill="url(#cap-shadow)" />

          {/* the clear remainder */}
          {empty && empty.h > 0.6 && (
            <g
              className={`cap-band is-empty${hot === empty.key ? ' is-hot' : ''}`}
              onMouseEnter={() => setHot(empty.key)} onMouseLeave={() => setHot(null)}
            >
              <path className="cap-glass-wall" d={slab(empty.yTop, empty.yBot)} fill="url(#cap-glass)" />
              <path className="cap-glass-edge" d={slab(empty.yTop, empty.yBot)} fill="none" />
            </g>
          )}

          {/* filled layers, base upward, so each cap covers the wall below it */}
          {filled.map((b) => b.h > 0.4 && (
            <g
              key={b.key}
              className={`cap-band${hot === b.key ? ' is-hot' : ''}${hot && hot !== b.key ? ' is-cool' : ''}`}
              onMouseEnter={() => setHot(b.key)} onMouseLeave={() => setHot(null)}
              style={{ '--band': b.colour }}
            >
              <path className="cap-wall" d={slab(b.yTop, b.yBot)} />
              <path className="cap-wall-shade" d={slab(b.yTop, b.yBot)} fill="url(#cap-curve)" />
              <ellipse className="cap-cap" cx={CX} cy={b.yTop} rx={RX} ry={RY} />
              <ellipse className="cap-cap-shade" cx={CX} cy={b.yTop} rx={RX} ry={RY} />
            </g>
          ))}

          <ellipse className="cap-rim" cx={CX} cy={Y_TOP} rx={RX} ry={RY} />
          {topOfFill < Y_BASE && <ellipse className="cap-waterline" cx={CX} cy={topOfFill} rx={RX} ry={RY} />}

          {/* leader line + figures, on hover only */}
          {bands.map((b) => hot === b.key && b.h > 0.4 && (
            <g key={`l${b.key}`} className="cap-leader" style={{ '--band': b.colour }} pointerEvents="none">
              <circle cx={CX + RX * 0.62} cy={b.mid} r="3.6" />
              <polyline points={`${CX + RX * 0.62},${b.mid} ${CX + RX + 14},${b.mid} ${LEADER_X},${b.mid}`} />
              <text className="cap-leader-l" x={LEADER_X + 8} y={b.mid - 4}>{b.label.toUpperCase()}</text>
              <text className="cap-leader-v" x={LEADER_X + 8} y={b.mid + 15}>
                {Math.round(b.pct)}%
                <tspan className="cap-leader-s" dx="7">{num(b.used)} {unit}</tspan>
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div className="cap-3d-legend">
        {bands.map((b) => (
          <button
            key={b.key}
            className={`cap-3d-item${hot === b.key ? ' is-hot' : ''}`}
            style={{ '--band': b.colour }}
            onMouseEnter={() => setHot(b.key)} onMouseLeave={() => setHot(null)}
            onClick={b.onClick}
            type="button"
          >
            <span className="cap-3d-chip"><Icon name={b.icon} size={13} /></span>
            <span className="cap-3d-l">{b.label}</span>
            <span className="cap-3d-p tabular">{Math.round(b.pct)}%</span>
            <span className="cap-3d-n tabular">{num(b.used)} {unit}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
