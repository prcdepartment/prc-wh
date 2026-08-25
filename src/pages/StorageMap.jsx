import { useMemo, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { items } from '../data/insights'
import {
  SITE_AREAS, WH_AREAS, AREA_BY_ID, RACKS, CANTILEVER, FLOOR_AREA,
  areaCapacity, rackOccupancy, areaItems, siteItems, slotItems, placement,
} from '../data/warehouseMap'
import SitePlan from '../components/floorplan/SitePlan'
import WarehousePlan from '../components/floorplan/WarehousePlan'
import RackElevation from '../components/floorplan/RackElevation'
import LocationPanel from '../components/floorplan/LocationPanel'
import { Card } from '../components/ui'
import FacilityCapacityGauge from '../components/FacilityCapacityGauge'
import { num } from '../lib/format'
import Icon from '../lib/icons'
// Imported here rather than from main.jsx so the floor plan's own styles ship with the
// floor plan's lazy chunk — and so this module stops adding to an index.css that other
// work is editing at the same time.
import '../styles/floorplan.css'

// ============================================================================
// Warehouse Floor Plan — three levels, from the CW Taytay Warehouse Plan deck.
//
//   site       Site development plan: the shed plus the outdoor material areas.
//   warehouse  Warehouse top view: the five material areas and eleven rack runs.
//   rack       One rack, drawn as a front elevation, bay by bay and level by level.
//
// The level, the selected area and the open rack all live in the query string, so
// every view is linkable and the browser Back button walks back up the levels.
// ============================================================================

const LEVELS = [
  { id: 'site', label: 'Site', icon: 'map' },
  { id: 'warehouse', label: 'Warehouse', icon: 'warehouse' },
  { id: 'rack', label: 'Racking', icon: 'layers' },
]

const rackLabel = (id) =>
  id === 'CANT' ? CANTILEVER.name
    : id === 'FLOOR' ? FLOOR_AREA.name
    : id.startsWith('HV') ? `HV Line ${id.slice(2)}`
    : `Rack ${id.slice(1)}`

export default function StorageMap() {
  const [params, setParams] = useSearchParams()
  const level = params.get('level') || 'site'
  const area = params.get('area') || null
  const rack = params.get('rack') || null
  const [hovered, setHovered] = useState(null)
  const [cell, setCell] = useState(null)

  // Both warehouse view options live in the query string so a view can be linked.
  // Portrait and sections-on are the defaults, so only the non-default states appear.
  const landscape = params.get('rot') === 'l'
  const showSections = params.get('sections') !== '0'

  // Rebuilt when hydration swaps the rows in — the same trigger the dashboard's
  // insight lists use. Without it the map would stay frozen at the empty pre-login
  // dataset, which is the bug the Inventory tab had.
  const plan = useMemo(() => placement(), [items.length])

  useEffect(() => { setCell(null) }, [rack])

  const go = (next) => {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) v == null ? p.delete(k) : p.set(k, v)
    setParams(p)
  }

  // Rack-level derivations live up here with the other hooks: the level branches
  // below return early, and a hook called after one of those returns would change the
  // hook order between renders.
  const rid = rack || 'R1'
  const rk = RACKS.find((r) => r.id === rid)
  const areaId = rk?.area || 'safekeeping'

  const allInRack = useMemo(() => {
    if (rid === 'FLOOR') return slotItems('FLOOR', '', '')
    const out = []
    for (const [key, list] of Object.entries(plan.slots)) {
      if (key.startsWith(`${rid}|`)) out.push(...list)
    }
    return out
  }, [rid, plan])

  const cellItems = useMemo(() => {
    if (!cell) return null
    const [bay, lvl] = cell.split('|')
    return {
      list: slotItems(rid, +bay, +lvl),
      label: rid === 'CANT' ? `Bay ${bay} · Arm ${lvl}` : `Bay ${bay} · Level ${lvl}`,
    }
  }, [cell, rid, plan])

  /* ------------------------------------------------------------- site level */

  if (level === 'site') {
    const sel = area && SITE_AREAS.find((a) => a.id === area)
    const pool = sel ? (sel.id === 'warehouse' ? items.filter((i) => !plan.byLine.get(i.id) || plan.byLine.get(i.id).level !== 'site') : siteItems(sel.id)) : []
    const mrf = siteItems('mrf')

    return (
      <Shell level={level} area={area} rack={rack} go={go}>
        <Card title="Site" icon="map" className="fp-map-card" right={<span className="fp-scale">Central Warehouse Taytay · scale MTS</span>}>
          <div className="fp-stage">
            <SitePlan
              selected={area}
              hovered={hovered}
              onHover={setHovered}
              onSelect={(id) => go({ area: area === id ? null : id })}
              onDrill={() => go({ level: 'warehouse', area: null })}
            />
          </div>
        </Card>

        {sel ? (
          <LocationPanel
            title={sel.name}
            sub={sel.id === 'warehouse' ? 'Everything held inside the shed' : 'Outdoor material area'}
            role={sel.role}
            note={sel.note}
            pool={pool}
            emptyText="Nothing on the current stock sheet is held in this area."
            actions={sel.drill && (
              <button className="btn btn-sm btn-primary" onClick={() => go({ level: 'warehouse', area: null })}>
                Enter warehouse <Icon name="chevronRight" size={14} />
              </button>
            )}
          />
        ) : (
          <Card title="Warehouse Capacity" icon="warehouse" className="fp-side-card fp-cap-card">
            <FacilityCapacityGauge bare />
          </Card>
        )}
      </Shell>
    )
  }

  /* -------------------------------------------------------- warehouse level */

  if (level === 'warehouse') {
    const sel = area && AREA_BY_ID[area]
    const pool = sel ? areaItems(sel.id) : []
    const cap = sel ? areaCapacity(sel.id) : null
    const racksIn = sel ? RACKS.filter((r) => r.area === sel.id) : []

    return (
      <Shell level={level} area={area} rack={rack} go={go}>
        <Card
          title="Warehouse Plan — Top View"
          icon="warehouse"
          right={
            <div className="fp-map-tools">
              <button
                className={`btn btn-sm${showSections ? ' btn-primary' : ''}`}
                onClick={() => go({ sections: showSections ? '0' : null })}
                title={showSections ? 'Hide the section-area highlights' : 'Show the section-area highlights'}
                aria-pressed={showSections}
              >
                <Icon name="layers" size={14} /> Sections
              </button>
              <button
                className="btn btn-sm"
                onClick={() => go({ rot: landscape ? null : 'l' })}
                title={landscape ? 'Rotate to portrait — matches the site plan' : 'Rotate to landscape — the reference deck’s presentation'}
              >
                <Icon name="reorganize" size={14} /> Rotate
              </button>
            </div>
          }
        >
          <div className={`fp-stage ${landscape ? 'fp-stage-wide' : 'fp-stage-portrait'}`}>
            <WarehousePlan
              selected={area}
              hovered={hovered}
              onHover={setHovered}
              orient={landscape ? 'landscape' : 'portrait'}
              showSections={showSections}
              onSelect={(id) => go({ area: area === id ? null : id })}
              onOpenRack={(id) => go({ level: 'rack', rack: id, area: id === 'CANT' || id === 'FLOOR' ? 'safekeeping' : RACKS.find((r) => r.id === id)?.area || area })}
            />
          </div>
        </Card>

        {sel ? (
          <LocationPanel
            title={sel.name}
            sub={`${racksIn.length ? `Racks ${racksIn.map((r) => r.n).join(', ')}` : 'Shelving room'}`}
            role={sel.role}
            note={sel.note}
            pool={pool}
            capacity={cap}
            actions={
              <div className="fp-rack-jump">
                {racksIn.map((r) => (
                  <button key={r.id} className="btn btn-sm" onClick={() => go({ level: 'rack', rack: r.id })}>{r.n}</button>
                ))}
                {sel.id === 'safekeeping' && (
                  <>
                    <button className="btn btn-sm" onClick={() => go({ level: 'rack', rack: 'CANT' })}>Cant.</button>
                    <button className="btn btn-sm" onClick={() => go({ level: 'rack', rack: 'FLOOR' })}>Floor</button>
                  </>
                )}
              </div>
            }
          />
        ) : (
          <Card title="Material Areas" icon="layers">
            <div className="fp-pick">Pick an area on the plan, or a row below.</div>
            <div className="fp-arealist">
              {WH_AREAS.map((a) => {
                const c = areaCapacity(a.id)
                const p = areaItems(a.id)
                const pct = c.positions ? Math.round((c.used / c.positions) * 100) : 0
                return (
                  <button key={a.id} className={`fp-arearow fp-t-${a.role}`} onClick={() => go({ area: a.id })}
                    onMouseEnter={() => setHovered(a.id)} onMouseLeave={() => setHovered(null)}>
                    <div className="fp-arearow-main">
                      <div className="n">{a.name}</div>
                      <div className="s">{num(p.length)} lines · {num(c.positions)} {c.unit}</div>
                    </div>
                    <div className="fp-arearow-bar" title={`${pct}% of positions in use`}>
                      <span style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <span className="tabular fp-arearow-pct">{pct}%</span>
                  </button>
                )
              })}
            </div>
          </Card>
        )}
      </Shell>
    )
  }

  /* ------------------------------------------------------------- rack level */

  const areaDef = AREA_BY_ID[areaId]
  const occ = rk ? rackOccupancy(rid) : null

  return (
    <Shell level={level} area={areaId} rack={rid} go={go}>
      <Card
        title={`${rackLabel(rid)} — ${rid === 'FLOOR' ? 'Block Stacking' : 'Front Elevation'}`}
        icon="layers"
        right={
          <div className="fp-rack-jump">
            {RACKS.filter((r) => r.area === areaId).map((r) => (
              <button key={r.id} className={`btn btn-sm${r.id === rid ? ' btn-primary' : ''}`} onClick={() => go({ rack: r.id })}>{r.n}</button>
            ))}
            {areaId === 'safekeeping' && (
              <>
                <button className={`btn btn-sm${rid === 'CANT' ? ' btn-primary' : ''}`} onClick={() => go({ rack: 'CANT' })}>Cant.</button>
                <button className={`btn btn-sm${rid === 'FLOOR' ? ' btn-primary' : ''}`} onClick={() => go({ rack: 'FLOOR' })}>Floor</button>
              </>
            )}
          </div>
        }
      >
        <div className="fp-stage fp-stage-elev">
          <RackElevation rackId={rid} selectedCell={cell} onSelectCell={setCell} floorCount={allInRack.length} />
        </div>
        <div className="fp-legend fp-legend-cells">
          <span className="fp-legend-i"><i className="fp-cellsw is-available" />Available</span>
          <span className="fp-legend-i"><i className="fp-cellsw is-occupied" />Occupied</span>
        </div>
      </Card>

      <LocationPanel
        title={cellItems ? cellItems.label : rackLabel(rid)}
        sub={cellItems ? rackLabel(rid) : areaDef?.name}
        role={areaDef?.role}
        pool={cellItems ? cellItems.list : allInRack}
        capacity={!cellItems && occ ? { ...occ, unit: 'pallet positions' } : null}
        emptyText={cellItems ? 'This position is empty.' : 'Nothing is held here.'}
        actions={cellItems && <button className="btn btn-sm btn-ghost" onClick={() => setCell(null)}>Show whole rack</button>}
      />
    </Shell>
  )
}

/* -------------------------------------------------------------------- shell */

function Shell({ level, area, rack, go, children }) {
  const areaName = area ? (AREA_BY_ID[area]?.name || SITE_AREAS.find((a) => a.id === area)?.name) : null

  return (
    <>
      <div className="fp-topbar" data-tour="floor">
        {/* A stepper rather than a tab strip: the three levels are a drill-down, and
            numbered nodes joined by a rail say that better than three equal pills. */}
        <div className="fp-steps" role="tablist" aria-label="Map level">
          {LEVELS.map((l, i) => {
            const reachable = l.id === 'site' || l.id === 'warehouse' || (l.id === 'rack' && !!rack)
            const active = level === l.id
            const done = LEVELS.findIndex((x) => x.id === level) > i
            return (
              <button
                key={l.id}
                role="tab"
                aria-selected={active}
                className={`fp-step${active ? ' is-on' : ''}${done ? ' is-done' : ''}`}
                disabled={!reachable}
                onClick={() => go(l.id === 'site' ? { level: null, area: null, rack: null } : l.id === 'warehouse' ? { level: 'warehouse', rack: null } : { level: 'rack' })}
              >
                <span className="fp-step-dot">
                  {done ? <Icon name="check" size={13} /> : <Icon name={l.icon} size={14} />}
                </span>
                <span className="fp-step-l">{l.label}</span>
              </button>
            )
          })}
        </div>
        <div className="fp-crumb">
          <button onClick={() => go({ level: null, area: null, rack: null })}>Site</button>
          {(level === 'warehouse' || level === 'rack') && (
            <>
              <Icon name="chevronRight" size={13} />
              <button onClick={() => go({ level: 'warehouse', rack: null })}>Central Warehouse</button>
            </>
          )}
          {areaName && level !== 'site' && (
            <>
              <Icon name="chevronRight" size={13} />
              <button onClick={() => go({ level: 'warehouse', area, rack: null })}>{areaName}</button>
            </>
          )}
          {level === 'rack' && rack && (
            <>
              <Icon name="chevronRight" size={13} />
              <span>{rackLabel(rack)}</span>
            </>
          )}
        </div>
      </div>
      <div className="fp-layout">{children}</div>
    </>
  )
}
