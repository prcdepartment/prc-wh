import {
  WH_VB, WH_BUILDING, WH_CANOPY, WH_AREAS, WH_ROOMS, WH_OPEN, AREA_BY_ID,
  RACKS, CANTILEVER, FLOOR_AREA, areaCapacity, whAreaM2,
} from '../../data/warehouseMap'
import PlanDefs from './planDefs'
import PlanText from './planText'
import PlanIdCard, { Leader, CARD_W, CARD_H } from './planIdCard'

// Level 2 — WAREHOUSE PLAN, TOP VIEW (reference slide 9).
//
// ORIENTATION. All geometry is stored portrait, the way the underlying CAD is drawn.
// Portrait is also the orientation that lines up with the shed on the site plan, so it
// is the default. `landscape` applies the deck's own 90° clockwise presentation
// instead. Everything goes through `mr`/`mp` below, so the rotation lives in exactly
// one place and labels stay upright in both.
//
// DEPTH. Three tiers, deliberately: the rooms and circulation floor are unclickable
// context and get no outline at all; the section-area highlights are a soft wash you
// can switch off; the racks and floor bays — the things you click — are solid,
// textured and outlined.

const HV_AREA = WH_AREAS.find((a) => a.id === 'highvalue')
const pts = (p) => p.map((q) => q.join(',')).join(' ')
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// Context regions carry no outline any more, so two that touch would read as one
// blob. A one-unit inset puts a hairline of floor between them instead of a border.
const inset = (r, d = 1) => ({ x: r.x + d, y: r.y + d, w: Math.max(0, r.w - d * 2), h: Math.max(0, r.h - d * 2) })

// Icon and label scale with the block. The shorter side governs, because that is what
// has to contain them; the icon carries the identification and the wordmark stays
// quiet beneath it. A run only one rack deep gets no icon at all — there is no room.
const iconFor = (across) => (across < 46 ? 0 : clamp(across * 0.28, 0, 34))

// A gutter is added to the RIGHT of the drawing so the hover plate has somewhere to go
// that is not on top of the plan. It is part of the viewBox permanently rather than
// appearing with the plate: growing the viewBox on hover would resize the whole drawing
// under the pointer.
const GUTTER = 190

export default function WarehousePlan({
  selected, onSelect, onOpenRack, hovered, onHover, orient = 'portrait',
}) {
  const landscape = orient === 'landscape'
  const plan = landscape ? { w: WH_VB.h, h: WH_VB.w } : WH_VB
  const vb = { w: plan.w + GUTTER, h: plan.h }

  // Portrait (ix, iy) -> the shown orientation. Landscape is the deck's rotation:
  // x = maxIy - iy, y = ix, so the office end sits on the left and the runs read
  // left-to-right.
  const mr = landscape
    ? (r) => ({ x: WH_VB.h - r.y - r.h, y: r.x, w: r.h, h: r.w })
    : (r) => r
  const mp = landscape
    ? (p) => p.map(([x, y]) => [WH_VB.h - y, x])
    : (p) => p

  const b = mr(WH_BUILDING)
  const canopy = mr(WH_CANOPY)

  function RackShape({ rack }) {
    const r = mr(rack.rect)
    const active = selected === rack.area
    const dim = !!selected && selected !== rack.area
    // Bay divisions run along the rack's LENGTH, which is whichever axis is longer
    // once the rotation is applied.
    const alongY = r.h >= r.w
    const step = (alongY ? r.h : r.w) / rack.bays
    const depth = alongY ? r.w : r.h
    return (
      <g
        className={`fp-rack fp-${rack.area}${active ? ' is-active' : ''}${dim ? ' is-dim' : ''}`}
        role="button" tabIndex={0} aria-label={`${rack.name}, ${rack.bays} bays`}
        onClick={(e) => { e.stopPropagation(); onOpenRack(rack.id) }}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpenRack(rack.id))}
        onMouseEnter={() => onHover(rack.area)}
        onMouseLeave={() => onHover(null)}
      >
        <title>{`${rack.name} — ${rack.bays} bays × ${rack.levels} levels`}</title>
        <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="1.5" />
        {Array.from({ length: rack.bays - 1 }, (_, i) => (
          alongY
            ? <line key={i} x1={r.x} y1={r.y + (i + 1) * step} x2={r.x + r.w} y2={r.y + (i + 1) * step} className="fp-bay-div" />
            : <line key={i} x1={r.x + (i + 1) * step} y1={r.y} x2={r.x + (i + 1) * step} y2={r.y + r.h} className="fp-bay-div" />
        ))}
        {/* The number sits at one END of the run, never its middle: Structural and
            Architectural are each one rack deep, so their area label runs straight
            through the centre of the very rack it names.
            Which end depends on the orientation. Portrait puts it at the top, where
            nothing else sits. Landscape puts it at the far end, because there the area
            titles are horizontal and run across the heads of the rack runs.
            The size is capped to the run's DEPTH too: back-to-back pairs are 17 units
            apart, and a 15 px glyph box does not fit between two of them. */}
        {/* Only if the run is deep enough to hold a numeral. The high-value shelving
            lines are 8 units deep — a fifth of a rack run — so eight labels there just
            sat on top of each other. Those are identified by hover, by the panel's jump
            buttons, and by the elevation they open. */}
        {depth >= 12 && (
          <text
            x={alongY ? r.x + r.w / 2 : r.x + r.w - 12}
            y={alongY ? r.y + 11 : r.y + r.h / 2 + 0.5}
            textAnchor="middle" dominantBaseline="middle" className="fp-rack-t"
            style={{ fontSize: alongY ? 15 : clamp(depth * 0.62, 9, 15) }}
          >{rack.n}</text>
        )}
      </g>
    )
  }

  const cant = mr(CANTILEVER.rect)
  const cantAlongY = cant.h >= cant.w
  const cantStep = (cantAlongY ? cant.h : cant.w) / CANTILEVER.bays
  const floor = mr(FLOOR_AREA.rect)

  // The hovered section's identity plate. Floor area is computed from the drawing's own
  // scale (~76 mm per raster pixel); occupancy is positions in use over positions the
  // racking drawing provides. Both are real; only which line sits in which bay is not.
  // Hover only, deliberately. The plate sits over the top-right of the drawing, so
  // leaving it up for a SELECTED area parked it permanently on the heads of racks 10
  // and 11 — and a selected area already has the full panel beside the map.
  const plateBox = { x: plan.w + (GUTTER - CARD_W) / 2, y: 16 }
  const hotArea = (hovered && AREA_BY_ID[hovered]) || null
  const plate = hotArea && (() => {
    const r = mr(hotArea.hull[0])
    const c = areaCapacity(hotArea.id)
    return {
      area: hotArea,
      from: [r.x + r.w / 2, r.y + r.h / 2],
      m2: whAreaM2(hotArea),
      pct: c.positions ? (c.used / c.positions) * 100 : null,
    }
  })()

  return (
    <svg className="fp-svg" viewBox={`0 0 ${vb.w} ${vb.h}`} role="img" aria-label="Central Warehouse Taytay warehouse plan, top view">
      <PlanDefs
        extra={
          <pattern id="fp-secure" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="7" stroke="currentColor" strokeWidth="1.4" opacity="0.4" />
          </pattern>
        }
      />

      {/* canopy line and building envelope */}
      <rect className="fp-canopy" x={canopy.x} y={canopy.y} width={canopy.w} height={canopy.h} />
      <rect className="fp-shell" x={b.x} y={b.y} width={b.w} height={b.h} rx="3" />

      {/* circulation floor — context, no outline, no label */}
      <polygon className="fp-open" points={pts(mp(WH_OPEN.poly))} />

      {/* rooms and working areas — context, no outline */}
      {WH_ROOMS.map((m) => {
        const r = inset(mr(m.rect))
        return (
          <g key={m.id} className={`fp-room${m.accent ? ' is-accent' : ''}`}>
            <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="3" />
            <PlanText
              x={r.x + r.w / 2} y={r.y + r.h / 2}
              text={m.name} maxW={r.w - 8} size={10} lh={11.5} cls="fp-room-t"
            />
          </g>
        )
      })}

      {/* Section-area blocks. Always rendered so they stay hoverable, but painted only
          when hovered or selected — the plan reads as pure racking at rest, which is
          what the old Sections toggle was for. They sit BEFORE the racks in the DOM, so
          a rack on top of a hull still receives the pointer. */}
      {WH_AREAS.map((a) => {
        const active = selected === a.id
        const hov = hovered === a.id
        return (
          <g
            key={a.id}
            className={`fp-hull fp-${a.role}${active ? ' is-active' : ''}${hov ? ' is-hover' : ''}`}
            role="button" tabIndex={0} aria-label={a.name}
            onClick={() => onSelect(a.id)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(a.id))}
            onMouseEnter={() => onHover(a.id)}
            onMouseLeave={() => onHover(null)}
          >
            <title>{a.name}</title>
            {a.poly
              ? <polygon points={pts(mp(a.poly))} />
              : a.hull.map((hh, i) => { const r = mr(hh); return <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx="4" /> })}
            {a.secure && a.hull.map((hh, i) => { const r = mr(hh); return (
              <rect key={`s${i}`} x={r.x} y={r.y} width={r.w} height={r.h} rx="4" fill="url(#fp-secure)" className="fp-secure-fill" />
            ) })}
          </g>
        )
      })}

      {/* the safekeeping area's two non-pallet storage forms — both clickable */}
      <g
        className={`fp-rack fp-safekeeping fp-cant${selected === 'safekeeping' ? ' is-active' : ''}`}
        role="button" tabIndex={0} aria-label="Cantilever run"
        onClick={(e) => { e.stopPropagation(); onOpenRack('CANT') }}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpenRack('CANT'))}
      >
        <title>Cantilever — long goods, {CANTILEVER.bays} bays × {CANTILEVER.arms} arm levels</title>
        <rect x={cant.x} y={cant.y} width={cant.w} height={cant.h} rx="1.5" />
        {Array.from({ length: CANTILEVER.bays - 1 }, (_, i) => (
          cantAlongY
            ? <line key={i} x1={cant.x} y1={cant.y + (i + 1) * cantStep} x2={cant.x + cant.w} y2={cant.y + (i + 1) * cantStep} className="fp-bay-div" />
            : <line key={i} x1={cant.x + (i + 1) * cantStep} y1={cant.y} x2={cant.x + (i + 1) * cantStep} y2={cant.y + cant.h} className="fp-bay-div" />
        ))}
      </g>

      <g
        className={`fp-floorarea fp-safekeeping${selected === 'safekeeping' ? ' is-active' : ''}`}
        role="button" tabIndex={0} aria-label={FLOOR_AREA.name}
        onClick={(e) => { e.stopPropagation(); onOpenRack('FLOOR') }}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpenRack('FLOOR'))}
      >
        <title>{FLOOR_AREA.name} — block-stacked goods</title>
        <rect x={floor.x} y={floor.y} width={floor.w} height={floor.h} rx="3" />
        <rect x={floor.x} y={floor.y} width={floor.w} height={floor.h} rx="3" className="fp-tex" fill="url(#fpt-safekeeping)" />
      </g>

      {/* rack runs */}
      {RACKS.map((r) => <RackShape key={r.id} rack={r} />)}

      {/* Nothing is labelled on the drawing itself any more. Hovering a coloured
          section draws a leader line from it to an identity plate in the top-right
          corner, which is where the names, floor areas and occupancy now live. */}
      {plate && (
        <>
          <Leader from={plate.from} to={[plateBox.x, plateBox.y + CARD_H / 2]} />
          <PlanIdCard
            x={plateBox.x} y={plateBox.y}
            area={plate.area} m2={plate.m2} pct={plate.pct}
            u={1.25} active
          />
        </>
      )}
    </svg>
  )
}
