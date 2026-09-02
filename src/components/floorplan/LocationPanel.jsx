import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { totals } from '../../data/warehouseMap'
import { CompactTable } from '../MaterialList'
import { num, peso } from '../../lib/format'
import Icon from '../../lib/icons'

const STATUS_COLOR = {
  Healthy: 'var(--ok)',
  Low: 'var(--warn)',
  Overstocked: 'var(--brand-gray-soft)',
  'Out of Stock': 'var(--danger)',
}

const PAGE = 40

// The "what is stored here" panel. Every level of the map feeds it the same shape:
// a title, an optional capacity read-out, and the material lines in that location.
// The six figures for a location. Exported so the racking level can put them under its
// elevation — that card had a lot of dead space below the drawing, and moving them there
// leaves the whole right-hand column to the list.
export function LocationStats({ pool }) {
  const t = totals(pool)
  return (
    <div className="fp-stats">
      <div className="fp-stat"><span className="l">Material lines</span><span className="v tabular">{num(t.lines)}</span></div>
      <div className="fp-stat"><span className="l">Stock on hand</span><span className="v tabular">{num(t.qty)}</span></div>
      <div className="fp-stat"><span className="l">Available</span><span className="v tabular">{num(t.available)}</span></div>
      <div className="fp-stat"><span className="l">Reserved</span><span className="v tabular">{num(t.reserved)}</span></div>
      <div className="fp-stat"><span className="l">Stock value</span><span className="v tabular">{peso(t.value)}</span></div>
      <div className="fp-stat"><span className="l">Needs attention</span><span className="v tabular">{num(t.low)}</span></div>
    </div>
  )
}

export default function LocationPanel({
  title, sub, role, pool, capacity, note, actions, emptyText, showStats = true, columns,
}) {
  const nav = useNavigate()
  const [shown, setShown] = useState(PAGE)
  const t = totals(pool)
  const pct = capacity && capacity.positions ? Math.round((capacity.used / capacity.positions) * 100) : null

  return (
    <div className="fp-panel">
      <div className="fp-panel-head">
        <div className="fp-panel-title">
          {role && <i className={`fp-swatch fp-sw-${role}`} />}
          <div>
            <div className="t">{title}</div>
            {sub && <div className="s">{sub}</div>}
          </div>
        </div>
        {actions}
      </div>

      {note && <div className="fp-note">{note}</div>}

      {showStats && <LocationStats pool={pool} />}

      {capacity && capacity.positions > 0 && (
        <div className="fp-cap">
          <div className="spread">
            <span className="fp-cap-l">
              Space — {num(capacity.used)} of {num(capacity.positions)} {capacity.unit} in use
            </span>
            <span className="fp-cap-v tabular">{pct}%</span>
          </div>
          <div className="fp-cap-bar"><span style={{ width: `${Math.min(pct, 100)}%` }} /></div>
          <div className="fp-cap-hint">
            {capacity.positions - capacity.used > 0
              ? `${num(capacity.positions - capacity.used)} positions free`
              : /* At 100% the bar has nothing left to say, and an area can hold far more
                   lines than it has positions — a pallet position carries several SKUs.
                   The density figure is what actually distinguishes "just full" from
                   "badly over-subscribed". */
                `Every position is in use, at about ${(t.lines / capacity.positions).toFixed(1)} lines per position`}
            {' · '}capacity is counted off the racking drawing.{' '}
            {/* Since the 2026-09-02 snapshot most lines carry the bin the warehouse
                itself recorded, so this says which part of the map is read and which
                is still inferred rather than disclaiming the whole thing. */}
            {capacity.recorded === capacity.lines
              ? 'Every line here is at its recorded bin.'
              : capacity.recorded > 0
              ? `${num(capacity.recorded)} of ${num(capacity.lines)} lines are at their recorded bin; the rest are modelled.`
              : 'No bin was recorded for these lines, so their bays are modelled.'}
          </div>
        </div>
      )}

      {/* `columns` switches to the dashboard's own compact masterlist table, so a row
          here lines up column-for-column with a row on the Inventory Overview. */}
      {columns ? (
        <div className="fp-list fp-list-table">
          {pool.length === 0
            ? <div className="empty">{emptyText || 'No material lines are held here.'}</div>
            : <CompactTable rows={pool.slice(0, shown)} columns={columns} onRowClick={(r) => nav(`/inventory/${r.id}`)} />}
          {pool.length > shown && (
            <button className="btn btn-sm btn-ghost fp-more" onClick={() => setShown(shown + PAGE)}>
              Show {Math.min(PAGE, pool.length - shown)} more of {num(pool.length)}
            </button>
          )}
        </div>
      ) : (
      <div className="fp-list">
        {pool.length === 0 && <div className="empty">{emptyText || 'No material lines are held here.'}</div>}
        {pool.slice(0, shown).map((r) => {
          const sc = STATUS_COLOR[r.stockStatus] || 'var(--border-strong)'
          return (
            <div key={r.id} className="fp-row" onClick={() => nav(`/inventory/${r.id}`)} style={{ borderLeftColor: sc }}>
              <div className="fp-row-main">
                <div className="fp-row-top">
                  <span className="mono">{r.itemCode}</span>
                  <span className="fp-row-status" style={{ background: `color-mix(in srgb, ${sc} 14%, transparent)`, color: sc }}>
                    {r.stockStatus}
                  </span>
                </div>
                <div className="fp-row-desc">{r.description}</div>
                <div className="fp-row-meta">{r.tradeL1} › {r.tradeL2}</div>
              </div>
              <div className="fp-row-qty">
                <div className="v tabular">{num(r.availableQty)}</div>
                <div className="u">{r.uom} available</div>
              </div>
              <Icon name="chevronRight" size={16} className="fp-row-go" />
            </div>
          )
        })}
        {pool.length > shown && (
          <button className="btn btn-sm btn-ghost fp-more" onClick={() => setShown(shown + PAGE)}>
            Show {Math.min(PAGE, pool.length - shown)} more of {num(pool.length)}
          </button>
        )}
      </div>
      )}
    </div>
  )
}
