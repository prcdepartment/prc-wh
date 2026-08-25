import { useState } from 'react'
import { facilityCapacity } from '../data/warehouseMap'
import { num } from '../lib/format'
import Icon from '../lib/icons'

// A SPACE reading (pallet/shelf positions occupied), not a stock reading, so it lives on
// the floor plan that defines those positions.
//
// Drawn as a cylinder seen slightly from above, filling from the base up the way a
// storage meter does: Warehouse-owned racks first (MEPFS, Structural, Architectural,
// High Value), then the Safekeeping area, and whatever neither has filled is left as
// clear glass at the top. See facilityCapacity() in warehouseMap.js for the numbers.
//
// The 3D is honest about being decoration: every layer's height is exactly its share of
// the total positions, so the cylinder reads as a stacked bar that happens to be round.

const VB = { w: 320, h: 470 }
const CX = 108
const RX = 76
const RY = 22
const Y_TOP = 40
const Y_BASE = 404
const H = Y_BASE - Y_TOP
const LEADER_X = 206

const LAYERS = [
  { key: 'warehouse', label: 'Warehouse', icon: 'warehouse', colour: 'var(--cap-wh)' },
  { key: 'safekeeping', label: 'Safekeeping', icon: 'vault', colour: 'var(--cap-sk)' },
  { key: 'available', label: 'Available', icon: 'box', colour: 'var(--cap-av)' },
]

// One stacked slab: a straight side wall closed by the FRONT half of the ellipse at each
// end, so the bottom bulges toward the viewer and the top is capped by its own full
// ellipse drawn over it.
const slab = (yTop, yBot) =>
  `M ${CX - RX} ${yTop} L ${CX - RX} ${yBot}` +
  ` A ${RX} ${RY} 0 0 0 ${CX + RX} ${yBot}` +
  ` L ${CX + RX} ${yTop}` +
  ` A ${RX} ${RY} 0 0 1 ${CX - RX} ${yTop} Z`

export default function FacilityCapacityGauge({ bare }) {
  const [hot, setHot] = useState(null)
  const cap = facilityCapacity()

  const pct = { warehouse: cap.warehousePct, safekeeping: cap.safekeepingPct, available: cap.availablePct }
  const used = { warehouse: cap.warehouseUsed, safekeeping: cap.safekeepingUsed, available: cap.available }

  // Stack from the base upward. Each layer keeps the y range it occupies so the leader
  // line can start at its own mid-height.
  let cursor = Y_BASE
  const bands = LAYERS.map((l) => {
    const h = (pct[l.key] / 100) * H
    const yBot = cursor
    const yTop = cursor - h
    cursor = yTop
    return { ...l, yTop, yBot, h, mid: (yTop + yBot) / 2, pct: pct[l.key], used: used[l.key] }
  })
  const filled = bands.filter((b) => b.key !== 'available')
  const empty = bands.find((b) => b.key === 'available')
  const topOfFill = filled.length ? Math.min(...filled.map((b) => b.yTop)) : Y_BASE

  return (
    <div className={`cap-widget cap-3d${bare ? ' is-bare' : ''}`}>
      <div className="cap-widget-head">
        {bare
          ? <div className="cap-widget-sub">Space occupancy across {num(cap.positions)} pallet and shelf positions</div>
          : (
            <div>
              <div className="card-title">Warehouse Capacity</div>
              <div className="card-sub">{num(cap.positions)} pallet/shelf positions across the warehouse</div>
            </div>
          )}
      </div>

      <div className="cap-3d-stage">
        <svg viewBox={`0 0 ${VB.w} ${VB.h}`} preserveAspectRatio="xMidYMid meet" role="img"
          aria-label={`Warehouse capacity: ${Math.round(cap.warehousePct)}% warehouse, ${Math.round(cap.safekeepingPct)}% safekeeping, ${Math.round(cap.availablePct)}% available`}>
          <defs>
            {/* curvature: dark at both edges, clear through the middle */}
            <linearGradient id="cap-curve" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#000" stopOpacity="0.38" />
              <stop offset="18%" stopColor="#000" stopOpacity="0.08" />
              <stop offset="34%" stopColor="#fff" stopOpacity="0.20" />
              <stop offset="55%" stopColor="#000" stopOpacity="0.02" />
              <stop offset="82%" stopColor="#000" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#000" stopOpacity="0.42" />
            </linearGradient>
            {/* the same, weaker, for the clear glass above the fill */}
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

          {/* ground shadow */}
          <ellipse className="cap-ground" cx={CX} cy={Y_BASE + RY + 12} rx={RX * 1.02} ry={RY * 0.5} fill="url(#cap-shadow)" />

          {/* the clear part: glass walls plus the rim at the very top */}
          {empty && empty.h > 0.6 && (
            <g
              className={`cap-band is-empty${hot === 'available' ? ' is-hot' : ''}`}
              onMouseEnter={() => setHot('available')} onMouseLeave={() => setHot(null)}
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

          {/* top rim, always drawn so the vessel reads as open */}
          <ellipse className="cap-rim" cx={CX} cy={Y_TOP} rx={RX} ry={RY} />

          {/* the line where fill meets air, kept crisp */}
          {topOfFill < Y_BASE && (
            <ellipse className="cap-waterline" cx={CX} cy={topOfFill} rx={RX} ry={RY} />
          )}

          {/* leader line + plate, on hover only */}
          {bands.map((b) => hot === b.key && b.h > 0.4 && (
            <g key={`l${b.key}`} className="cap-leader" style={{ '--band': b.colour }} pointerEvents="none">
              <circle cx={CX + RX * 0.62} cy={b.mid} r="3.6" />
              <polyline points={`${CX + RX * 0.62},${b.mid} ${CX + RX + 16},${b.mid} ${LEADER_X},${b.mid}`} />
              <text className="cap-leader-l" x={LEADER_X + 8} y={b.mid - 4}>{b.label.toUpperCase()}</text>
              <text className="cap-leader-v" x={LEADER_X + 8} y={b.mid + 15}>
                {Math.round(b.pct)}%
                <tspan className="cap-leader-s" dx="7">{num(b.used)} pos.</tspan>
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* the key — the leader plates are hover-only, so the names live here too */}
      <div className="cap-3d-legend">
        {bands.map((b) => (
          <button
            key={b.key}
            className={`cap-3d-item${hot === b.key ? ' is-hot' : ''}`}
            style={{ '--band': b.colour }}
            onMouseEnter={() => setHot(b.key)} onMouseLeave={() => setHot(null)}
            type="button"
          >
            <span className="cap-3d-chip"><Icon name={b.icon} size={13} /></span>
            <span className="cap-3d-l">{b.label}</span>
            <span className="cap-3d-p tabular">{Math.round(b.pct)}%</span>
            <span className="cap-3d-n tabular">{num(b.used)} pos.</span>
          </button>
        ))}
      </div>
    </div>
  )
}
