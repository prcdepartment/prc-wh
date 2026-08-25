import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import Icon from '../../lib/icons'
import { DB } from '../../data/processFlow'
import { MIN_FIT } from './FlowDiagram'

// An entity-relationship diagram of the live schema, laid out by dependency rather
// than by hand: a table's column is decided by whether it points at something, is
// pointed at, or neither.
//
//   left   — tables with no foreign keys in either direction. Mostly the imported
//            warehouse sheets: self-contained, and joined to each other by item code
//            in the application rather than by a database key.
//   middle — every table that holds a foreign key.
//   right  — the two things everything points AT: the inventory line and the user
//            account.
//
// Laying it out this way makes the shape of the database readable at a glance, and it
// makes one absence visible: audit_log is a TRANSACTIONAL table and it still lands in
// the left column, with no line leaving it, because it records a user's email as
// ordinary text instead of referencing an account. That is a finding, not a layout
// quirk — hence the column heading names the rule (no foreign keys) rather than
// describing the tables, which would have mislabelled the audit log as a sheet.

const W = 244
const COL_GAP = 92
const BOX_GAP = 14
const HEAD = 30
const ROW = 17
const PAD = 18

const GROUP_TONE = { identity: 'accent', reference: 'info', transactional: 'warn' }

function useElementWidth(ref) {
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => setW(el.clientWidth)
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return w
}

// The rows a box shows: the primary key, then every foreign key. Everything else is
// summarised as a count and read in the detail panel — a box listing thirty-one
// columns would be a spreadsheet, not a diagram.
function rowsFor(t) {
  const rows = []
  if (t.pk.length) rows.push({ kind: 'pk', label: t.pk.join(' + '), type: 'primary key' })
  t.foreignKeys.forEach((f) =>
    rows.push({ kind: 'fk', label: f.fromColumn, type: '→ ' + f.to + '.' + f.toColumn })
  )
  return rows
}
const boxHeight = (t) => HEAD + rowsFor(t).length * ROW + 20

export default function ErdDiagram({ onSelect, selectedName, query = '', height = 620 }) {
  const viewRef = useRef(null)
  const viewWidth = useElementWidth(viewRef)
  const [zoom, setZoom] = useState(null) // null = fit

  const model = useMemo(() => {
    const tables = DB.tables
    const hasFk = (t) => t.foreignKeys.length > 0
    const isParent = (t) => t.referencedBy.length > 0

    const left = tables.filter((t) => !hasFk(t) && !isParent(t))
    const middle = tables.filter((t) => hasFk(t))
    const right = tables.filter((t) => !hasFk(t) && isParent(t))

    // auth.users is not one of our tables — it belongs to Supabase Auth — but six of
    // our tables point at it, so leaving it out would draw six arrows into blank space.
    const external = {
      name: 'auth.users',
      external: true,
      group: 'identity',
      purpose:
        'Supabase Auth’s own account table. We never write to it and cannot add columns to it; ' +
        'our profiles table exists precisely to hold the fields it does not.',
      pk: ['id'],
      columns: [
        { name: 'id', type: 'uuid', pk: true },
        { name: 'email', type: 'text' },
        { name: 'encrypted_password', type: 'text' },
      ],
      foreignKeys: [],
      referencedBy: DB.relationships.filter((r) => r.toSchema === 'auth'),
      policies: [],
      indexes: [],
      triggers: DB.triggers.filter((t) => t.table === 'auth.users'),
    }

    const cols = [
      { id: 'ref', title: 'No foreign keys either way', items: left },
      { id: 'fk', title: 'Tables holding foreign keys', items: middle },
      { id: 'parent', title: 'Referenced by others', items: [...right, external] },
    ]

    const placed = {}
    let maxH = 0
    cols.forEach((col, ci) => {
      let y = PAD + HEAD
      col.x = PAD + ci * (W + COL_GAP)
      col.items.forEach((t) => {
        const h = boxHeight(t)
        placed[t.name] = { table: t, x: col.x, y, w: W, h, col: col.id }
        y += h + BOX_GAP
      })
      col.height = y
      maxH = Math.max(maxH, y)
    })

    const edges = DB.relationships.map((r) => {
      const from = placed[r.from]
      const to = placed[r.toSchema === 'auth' ? 'auth.users' : r.to]
      return from && to ? { ...r, from, to } : null
    })

    return {
      cols,
      placed,
      edges: edges.filter(Boolean),
      width: PAD * 2 + cols.length * W + (cols.length - 1) * COL_GAP,
      height: maxH + PAD,
    }
  }, [])

  const fit = viewWidth > 0 ? Math.min(1, (viewWidth - 4) / model.width) : 1
  const scale = zoom ?? Math.max(MIN_FIT, fit)

  const q = query.trim().toLowerCase()
  const hit = (t) =>
    q.length > 1 &&
    (t.name.toLowerCase().includes(q) || t.columns.some((c) => c.name.toLowerCase().includes(q)))

  // Which foreign key the reader is following. Highlighting on hover of the whole box
  // would light up five lines at once on the inventory table and tell them nothing.
  const [hoverEdge, setHoverEdge] = useState(null)

  const drag = useRef(null)

  return (
    <div className="pf-diagram">
      <div className="pf-diagram-bar">
        <div className="pf-zoom">
          <button className="icon-btn sm" onClick={() => setZoom((z) => Math.max(0.4, (z ?? fit) - 0.12))} title="Zoom out" aria-label="Zoom out">
            <Icon name="minus" size={15} />
          </button>
          <span className="pf-zoom-val">{Math.round(scale * 100)}%</span>
          <button className="icon-btn sm" onClick={() => setZoom((z) => Math.min(1.8, (z ?? fit) + 0.12))} title="Zoom in" aria-label="Zoom in">
            <Icon name="plus" size={15} />
          </button>
          <button className={`btn btn-sm ${zoom === null ? 'btn-primary' : ''}`} onClick={() => setZoom(null)}>Fit</button>
        </div>
        <div className="pf-erd-key">
          <span><b>1</b>—<b>∞</b> one to many</span>
          <span><b>1</b>—<b>1</b> one to one</span>
        </div>
      </div>

      <div
        className="pf-viewport"
        ref={viewRef}
        style={{ height }}
        onPointerDown={(e) => {
          if (e.target.closest('.pf-erd-box')) return
          const vp = viewRef.current
          drag.current = { x: e.clientX, y: e.clientY, left: vp.scrollLeft, top: vp.scrollTop }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          const vp = viewRef.current
          if (!d || !vp) return
          vp.scrollLeft = d.left - (e.clientX - d.x)
          vp.scrollTop = d.top - (e.clientY - d.y)
        }}
        onPointerUp={() => { drag.current = null }}
        onPointerLeave={() => { drag.current = null }}
      >
        <div className="pf-canvas" style={{ width: model.width * scale, height: model.height * scale }}>
          <div
            className="pf-canvas-inner"
            style={{ width: model.width, height: model.height, transform: `scale(${scale})` }}
          >
            <svg className="pf-edges" width={model.width} height={model.height} aria-hidden="true">
              {model.edges.map((e, i) => {
                const x1 = e.from.x + e.from.w
                const y1 = e.from.y + HEAD / 2 + 8
                const x2 = e.to.x
                const y2 = e.to.y + e.to.h / 2
                const c = Math.max(30, (x2 - x1) / 2)
                const on = hoverEdge === i
                return (
                  <g key={i} className={`pf-erd-edge ${on ? 'on' : ''}`}>
                    <path d={`M ${x1} ${y1} C ${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2} ${y2}`} />
                    <text x={x1 + 8} y={y1 - 5} className="pf-card">∞</text>
                    <text x={x2 - 14} y={y2 - 5} className="pf-card">1</text>
                  </g>
                )
              })}
            </svg>

            {model.cols.map((col) => (
              <div key={col.id} className="pf-erd-coltitle" style={{ left: col.x, top: PAD, width: W }}>
                {col.title}
              </div>
            ))}

            {Object.values(model.placed).map(({ table: t, x, y, w, h }) => (
              <div
                key={t.name}
                className={
                  'pf-erd-box' +
                  ` grp-${t.group}` +
                  (t.external ? ' external' : '') +
                  (selectedName === t.name ? ' selected' : '') +
                  (hit(t) ? ' hit' : '')
                }
                style={{ left: x, top: y, width: w, height: h }}
                role="button"
                tabIndex={0}
                onClick={() => onSelect && onSelect(t)}
                onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSelect && onSelect(t) } }}
              >
                <div className="pf-erd-head">
                  <span className="pf-erd-name">{t.name}</span>
                  <span className={`pf-erd-grp tone-${GROUP_TONE[t.group] || 'info'}`}>
                    {t.external ? 'auth' : t.group === 'transactional' ? 'txn' : t.group === 'reference' ? 'ref' : 'id'}
                  </span>
                </div>
                {rowsFor(t).map((r, ri) => (
                  <div
                    key={ri}
                    className={`pf-erd-row ${r.kind}`}
                    onMouseEnter={() => {
                      if (r.kind !== 'fk') return
                      const idx = model.edges.findIndex((e) => e.from.table.name === t.name && e.fromColumn === r.label)
                      setHoverEdge(idx === -1 ? null : idx)
                    }}
                    onMouseLeave={() => setHoverEdge(null)}
                  >
                    <Icon name={r.kind === 'pk' ? 'grade' : 'transfer'} size={11} />
                    <span className="pf-erd-col">{r.label}</span>
                    <span className="pf-erd-type">{r.type}</span>
                  </div>
                ))}
                <div className="pf-erd-foot">
                  {t.columns.length} columns
                  {t.policies.length ? ` · ${t.policies.length} policies` : t.external ? '' : ' · no policies'}
                  {t.triggers.length ? ` · ${t.triggers.length} trigger${t.triggers.length > 1 ? 's' : ''}` : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
