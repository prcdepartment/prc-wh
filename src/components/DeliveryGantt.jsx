import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  buildGanttRows, visibleRows, timelineRange, timelineTicks, tickGroups, TICK_LABEL,
  TIMELINE_UNITS, rowAt, capacityAt, cursorEdge, startOfDay, M2_PER_POSITION,
  ganttToday, hasRealMinStock, MIN_STOCK_COVER_PCT,
} from '../data/deliveryGantt'
import { deliveryExcluded } from '../data/deliveryTracker'
import { num, fmtDate, fmtTargetText, fmtTower } from '../lib/format'
import { seriesFor } from '../lib/colors'
import { useTheme } from '../context/ThemeContext'
import { whAreaM2, WH_AREAS } from '../data/warehouseMap'
import Icon from '../lib/icons'
import { Toggle, NoData } from './ui'
import DeliveryMonthPie from './DeliveryMonthPie'
import '../styles/gantt.css'

// ---------------------------------------------------------------------------
// GEOMETRY
//
// Row heights are FIXED now, and that is the constraint everything else answers to.
// A row is one lane per shown direction: two lanes in Both mode, one in In or Out
// mode. Nothing stacks into extra sub-rows any more, so the whole chart's height is
// simply (rows x lane height), which is what lets it be sized to the display instead
// of running past the fold.
//
// The cost of a single track is that two bars landing on the same stretch of timeline
// can no longer be drawn side by side. They are MERGED instead — one bar, the summed
// quantity, the members in its tooltip — which is honest and reads better than a
// pile-up. See packTrack.
const LANE_H = 22
// 16 of the lane's 22px. Every bar is now one style, so there is no thin inset bar to
// leave room for and the lane can be used properly — but LANE_H stays at 22 on purpose,
// because the row height is what keeps the whole chart inside the display.
const BAR_H = 16
const BAR_TOP = Math.round((LANE_H - BAR_H) / 2)

// MIN_BAR is what a bar needs to be seen and hovered, not what its number needs — the
// number sits outside when the bar is too small to hold it.
const MIN_BAR = 16

// Header: two label bands plus a rail along the bottom that belongs to the cursor
// handle alone (in the tick band its width covers a month's label; at the very top it
// lands on the Today chip, which starts on the same date).
const HEAD_BANDS = 40
const CURSOR_RAIL = 22 // kept in step with .gtt-thead::after in gantt.css
const HEAD_H = HEAD_BANDS + CURSOR_RAIL

// Quantity-label width, and it is MEASURED, not estimated — packTrack reserves space
// with it, so an under-estimate puts two numbers on top of each other.
//
// Re-measured 2026-09-11 when the bar quantity moved to Barlow Condensed 11px/500 (it
// was Montserrat 9.5px/800 at 7.3px per character). Taken off the rendered DOM across
// all 72 on-screen labels: a digit is 5.20px wide and a comma less, so the widest case
// is an all-digit string. 5.25 rounds that up, which is the safe direction — over-
// reserving leaves a small gap, under-reserving collides.
//
// Change the size, weight or family of `.gb-n` in gantt.css and this must be measured
// again. The narrower face is also why far more labels now sit INSIDE their bar.
const CHAR_W = 5.25
const LABEL_PAD = 7
const labelWidth = (txt) => txt.length * CHAR_W + LABEL_PAD

const CAPWIN_W = 168
// Height of the DEDICATED STRIP the travelling read-out lives in, at the end of the
// content, so the window covers no row once the chart fits the display.
//
// 60 as of 2026-09-11, down from 104, because the read-out was cut from six lines to
// two and is now 52px tall (46px under the mobile rule) — 52 + its 5px bottom offset
// = 57, and 60 leaves a little room. The 44px that came back went to the rows, which
// is the point: the strip is reserved space, so an oversized one is chart height spent
// on nothing.
//
// Measured at BOTH widths, because the narrow variant has bitten before. Change the
// read-out and re-measure all three numbers together: its rendered height, its bottom
// offset in gantt.css, and this.
const FOOT_H = 60

const SAFEKEEPING_M2 = whAreaM2(WH_AREAS.find((a) => a.id === 'safekeeping'))

export const LANE_MODES = [
  { value: 'both', label: 'Both', icon: 'transfer' },
  { value: 'in', label: 'In', icon: 'incoming' },
  { value: 'out', label: 'Out', icon: 'outgoing' },
]

// ---------------------------------------------------------------------------
// BAR PACKING — one track per lane, merging what collides.
//
// Scheduled and recorded deliveries share ONE track and ONE style now. The chart used
// to draw them differently — an outlined "planned" bar with a thinner filled "recorded"
// bar inside it — but the delivery schedule carries no actual-vs-planned pairing, so
// that distinction was asserting a status the data does not record. What the bars carry
// instead is DIRECTION by colour and ELAPSED-OR-NOT by opacity.
//
// The source kind still exists in the data and still shapes each bar's tooltip; it just
// no longer changes how the bar looks.

// End of today. A bar whose span has fully elapsed by this instant is drawn solid; one
// that has not is drawn washed out. A delivery dated today counts as elapsed, which is
// why this is the END of the day and not its start.
//
// THREADED, not a module constant. It used to be cursorEdge(TODAY) evaluated once at
// import, which pinned the whole chart to the stock snapshot date and never moved. The
// today line is now the real current date (ganttToday), so the edge has to arrive from
// the render that knows what day it is — which is why makeItem, packTrack and layoutRow
// all take it. A module constant would also be stale for anyone leaving the tab open
// past midnight.
const isPast = (end, todayEdge) => end.getTime() <= todayEdge

const sumQty = (members) => {
  const known = members.filter((m) => m.qty != null)
  return { qty: known.length ? known.reduce((a, m) => a + m.qty, 0) : null, tbc: members.length - known.length }
}

function makeItem(members, scale, totalW, todayEdge) {
  const start = new Date(Math.min(...members.map((m) => m.start.getTime())))
  const end = new Date(Math.max(...members.map((m) => m.end.getTime())))
  const x0 = scale(start.getTime())
  const x1 = scale(end.getTime())
  const trueW = x1 - x0
  const w = Math.max(trueW, MIN_BAR)
  // Wide enough to draw honestly? Keep its left edge. Otherwise centre the
  // minimum-width bar on the span so it still points at the right date.
  const x = trueW >= MIN_BAR ? x0 : (x0 + x1) / 2 - MIN_BAR / 2

  const { qty, tbc } = sumQty(members)
  const label = qty == null ? 'TBC' : num(qty)
  const lw = labelWidth(label)
  const inside = w >= lw + 4
  // Outside labels go to the right, and flip left only when the right would run past
  // the end of the timeline — which would widen the scrollable content past the last
  // column for the sake of one number.
  const leftSide = !inside && x + w + lw + 4 > totalW && x - lw - 4 >= 0
  const left = inside ? x : (leftSide ? x - lw - 4 : x)
  const right = inside ? x + w : (leftSide ? x + w : x + w + lw + 4)
  return {
    members, start, end, x, w, trueW, stretched: trueW < MIN_BAR,
    qty, tbcCount: tbc, label, inside, leftSide, left, right,
    past: isPast(end, todayEdge),
  }
}

// Lay a lane's bars on ONE track, merging any that would touch (their labels counted).
// Repeats until nothing merges, because a merge widens the label and can open a new
// overlap.
//
// Two bars are never merged ACROSS the today line. Opacity is what tells elapsed from
// scheduled, so a merged bar has to be wholly one or the other or it could not be drawn
// truthfully — and the line is a real boundary in the reader's head, not a tick.
function packTrack(bars, scale, totalW, todayEdge) {
  if (!bars.length) return []
  let items = bars.map((b) => makeItem([b], scale, totalW, todayEdge)).sort((a, b) => a.left - b.left)
  for (let guard = 0; guard < 50; guard++) {
    const out = []
    let merged = false
    for (const it of items) {
      const prev = out[out.length - 1]
      if (prev && prev.past === it.past && it.left < prev.right + 3) {
        out[out.length - 1] = makeItem([...prev.members, ...it.members], scale, totalW, todayEdge)
        merged = true
      } else out.push(it)
    }
    items = out
    if (!merged) break
  }

  // SEPARATION PASS — for the collisions merging is not allowed to resolve.
  //
  // Two bars on opposite sides of the today line are never merged (opacity is what
  // distinguishes them, so a merged bar has to be wholly one or the other). But their
  // spans can abut, and a bar narrower than MIN_BAR is drawn at MIN_BAR centred on its
  // span — so it reaches past its own span's edges and lands on its neighbour. Measured
  // on the 2026-09-10 data at Month zoom: two such overlaps, 4px and 32px.
  //
  // Only STRETCHED bars are moved, and that is the whole justification: a stretched bar
  // is already drawn wider than the span it represents, so its pixel position is an
  // approximation before this pass touches it. Nudging it a few pixels is strictly less
  // wrong than drawing it on top of another delivery, and its exact dates are in the
  // tooltip either way. A bar wide enough to be drawn honestly is never moved — if two
  // of those collide, the check reports it rather than this silently hiding it.
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1]
    const it = items[i]
    if (it.left >= prev.right + 3) continue

    // FIRST, try moving the NUMBER rather than the bar. Every collision measured on the
    // 2026-09-10 data at Quarter zoom was the same shape: an elapsed bar ending at today
    // with its number outside on the right, reaching into a scheduled bar whose estimate
    // window straddles today. The two bars genuinely overlap in time and both must stay
    // where they are; it is only the label that is in the wrong place. Flipping it to the
    // bar's own left side resolves it and moves no data.
    if (!prev.inside && !prev.leftSide) {
      const lw = labelWidth(prev.label)
      const newLeft = prev.x - lw - 4
      const clearsBefore = i < 2 || newLeft >= items[i - 2].right + 3
      if (newLeft >= 0 && clearsBefore) {
        items[i - 1] = { ...prev, leftSide: true, left: newLeft, right: prev.x + prev.w }
        if (it.left >= items[i - 1].right + 3) continue
      }
    }

    // Otherwise nudge, and ONLY a stretched bar. A stretched bar is already drawn wider
    // than the span it represents, so its pixel position is an approximation before this
    // touches it — a few pixels is strictly less wrong than drawing it over another
    // delivery, and its exact dates are in the tooltip either way. A bar wide enough to
    // be drawn honestly is never moved: two of those overlapping means the deliveries
    // really do overlap in time, which is information, so it is left visible.
    const need = items[i - 1].right + 3 - it.left
    if (need <= 0 || (!it.stretched && !prev.stretched)) continue
    const dx = Math.min(need, Math.max(0, totalW - it.right))
    if (dx <= 0) continue
    items[i] = { ...it, x: it.x + dx, left: it.left + dx, right: it.right + dx, nudged: true }
  }
  return items
}

function layoutRow(row, scale, mode, totalW, todayEdge) {
  const showIn = mode !== 'out'
  const showOut = mode !== 'in'
  // row.inBars is already the recorded receipts plus the dated schedule; row.outBars the
  // recorded pullouts. One track each, since the two kinds now look the same and putting
  // them on separate tracks would only let them overlap invisibly.
  return {
    inItems: showIn ? packTrack(row.inBars, scale, totalW, todayEdge) : [],
    outItems: showOut ? packTrack(row.outBars, scale, totalW, todayEdge) : [],
    showIn, showOut,
  }
}

// ---------------------------------------------------------------------------

function itemTitle(item, row) {
  const n = item.members.length
  const kinds = new Set(item.members.map((m) => m.kind))
  const what = n > 1
    ? `${n} deliveries${kinds.size > 1 ? '' : kinds.has('planned') ? ' scheduled' : ' recorded'}`
    : (item.members[0].kind === 'planned' ? item.members[0].label || 'Scheduled delivery' : 'Recorded delivery')
  const lines = [`${what} — ${row.materialName}`]

  if (item.qty != null) lines.push(`${num(item.qty)} ${row.uom || ''}`.trim())
  if (item.tbcCount) lines.push(`${item.tbcCount} of these carry no agreed quantity (TBC in the source) and are not counted.`)
  lines.push(item.past ? 'On or before today — drawn solid.' : 'Still ahead — drawn faded.')
  lines.push('')

  for (const m of item.members.slice(0, 8)) {
    if (m.kind === 'planned') {
      const when = m.targetDate
        ? `${fmtDate(new Date(`${m.targetDate}T00:00:00`))} (firm)`
        : `${fmtTargetText(m.targetText) || 'TBC'} (est.)`
      const extra = [m.location ? fmtTower(m.location) : '', m.dpPayment ? `DP ${m.dpPayment}` : ''].filter(Boolean).join(' · ')
      lines.push(`Scheduled · ${m.batch || 'Batch'} · ${when} · ${m.qty == null ? 'TBC' : num(m.qty)}${extra ? ` · ${extra}` : ''}`)
      if (m.opsRemarks) lines.push(`    Ops: ${m.opsRemarks}`)
      if (m.prcRemarks) lines.push(`    PRC: ${m.prcRemarks}`)
    } else {
      lines.push(`Recorded · ${fmtDate(m.start)} · ${num(m.qty)}${m.docRef ? ` · ${m.docRef}` : ''}`)
    }
  }
  if (item.members.length > 8) lines.push(`… and ${item.members.length - 8} more`)
  if (item.members.length > 1) lines.push('', 'Merged because they overlap at this zoom — switch to Week or Day to separate them.')
  return lines.join('\n')
}

function Bar({ item, row, colour, barKey, isOpen, onOpen }) {
  return (
    <button
      type="button"
      className={[
        'gbar', item.past ? 'is-past' : 'is-future',
        item.qty == null ? 'gbar-tbc' : '',
        item.stretched ? 'is-min' : '',
        item.inside ? '' : 'gbar-out',
        item.inside ? '' : (item.leftSide ? 'lbl-left' : 'lbl-right'),
        item.members.length > 1 ? 'is-merged' : '',
        isOpen ? 'is-open' : '',
      ].filter(Boolean).join(' ')}
      style={{ left: item.x, width: item.w, top: BAR_TOP, height: BAR_H, '--c': colour }}
      // The tooltip stays. The panel is for reading the whole delivery; the tooltip is
      // still the fastest way to identify a bar you are only passing over.
      title={itemTitle(item, row)}
      aria-expanded={isOpen}
      onClick={() => onOpen({ key: barKey, item, row, colour })}
    >
      <em className="gb-n">{item.label}</em>
      {item.members.length > 1 && <i className="gb-mult" aria-hidden="true">{item.members.length}</i>}
    </button>
  )
}

// ---------------------------------------------------------------------------
// DETAIL PANEL — what a bar is actually made of.
//
// A bar can stand for one delivery or for several merged at this zoom, and each
// delivery can itself hold many line items (the door types, window types and fixtures
// inside one batch). None of that fits in a tooltip, and the tooltip was already
// truncating at 8 members and dropping every line item. This is where it goes.
//
// Everything here is read off the bar's own members, so the panel can never disagree
// with the bar it was opened from.
function memberWhen(m) {
  if (m.kind !== 'planned') return fmtDate(m.start)
  if (m.targetDate) return fmtDate(new Date(`${m.targetDate}T00:00:00`))
  return fmtTargetText(m.targetText) || 'No target date'
}

function DetailPanel({ open, onClose }) {
  if (!open) return null
  const { item, row, colour } = open
  const members = item.members
  const lineCount = members.reduce((a, m) => a + (m.lines?.length || 0), 0)

  return (
    <aside className="gtt-panel" role="dialog" aria-label="Delivery detail" style={{ '--c': colour }}>
      <header className="gp-head">
        <div className="gp-id">
          <span className="gp-mat">{row.materialName}</span>
          {/* A child row IS a project, so name it; a parent row spans several. */}
          <span className="gp-sub">{row.isParent ? `${row.projectCount || 1} project${(row.projectCount || 1) === 1 ? '' : 's'}` : row.project}</span>
        </div>
        <button type="button" className="gp-x" onClick={onClose} aria-label="Close">
          <Icon name="close" size={14} />
        </button>
      </header>

      <div className="gp-top">
        <div className="gp-qty">
          <strong>{item.qty == null ? 'TBC' : num(item.qty)}</strong>
          <span>{item.qty == null ? 'no agreed quantity' : (row.uom || 'units')}</span>
        </div>
        <div className="gp-chips">
          <span className={`gp-chip ${item.past ? 'is-past' : 'is-future'}`}>
            {item.past ? 'On or before today' : 'Still ahead'}
          </span>
          {members.length > 1 && <span className="gp-chip">{members.length} deliveries merged at this zoom</span>}
          {item.tbcCount > 0 && <span className="gp-chip is-warn">{item.tbcCount} without a quantity</span>}
        </div>
      </div>

      {members.length > 1 && (
        <p className="gp-note">
          These overlap at this zoom and are drawn as one bar. Switch the timeline to
          Week or Day to separate them.
        </p>
      )}

      <div className="gp-body">
        {members.map((m, i) => (
          <section className="gp-m" key={i}>
            <div className="gp-m-head">
              <span className="gp-m-kind">{m.kind === 'planned' ? (m.batch || 'Scheduled') : 'Received'}</span>
              <span className="gp-m-qty">
                {m.qty == null ? 'TBC' : num(m.qty)}
                {m.uom && <em>{m.uom}</em>}
              </span>
            </div>
            <dl className="gp-kv">
              <dt>{m.kind === 'planned' ? 'Target' : 'Date'}</dt>
              {/* An estimate is marked "est." and nothing more. It used to carry a
                  sentence explaining what an estimate implies about the bar's width,
                  which is the sort of hint that belongs in documentation rather than
                  beside every value on a card. A reader who wants the width explained
                  can read the note once; a reader scanning ten deliveries should not
                  have to step over the same sentence ten times. */}
              <dd>
                {memberWhen(m)}
                {m.kind === 'planned' && !m.targetDate && m.targetText && <em className="gp-est">est.</em>}
              </dd>
              {m.sourceItem && (<><dt>Item</dt><dd>{m.sourceItem}{m.brand ? ` · ${m.brand}` : ''}</dd></>)}
              <dt>Project</dt><dd>{row.isParent ? (m.project || row.project || '—') : row.project}</dd>
              {m.location && (<><dt>Tower</dt><dd>{fmtTower(m.location)}</dd></>)}
              {/* The destination is why this delivery is on the card at all — the tracker
                  shows warehouse-bound rows only — so it is always listed, never folded
                  away when it happens to be the common case. */}
              <dt>Deliver to</dt><dd>{m.warehouse || '—'}</dd>
              {m.status && (<><dt>Status</dt><dd>{m.status}</dd></>)}
              {m.dpPayment && (<><dt>DP</dt><dd>{m.dpPayment}</dd></>)}
              {m.uom && (<><dt>UOM</dt><dd>{m.uom}</dd></>)}
              {m.opsRemarks && (<><dt>Ops</dt><dd className="gp-rem">{m.opsRemarks}</dd></>)}
              {m.prcRemarks && (<><dt>PRC</dt><dd className="gp-rem">{m.prcRemarks}</dd></>)}
            </dl>

            {/* The line items inside this delivery — the level the 2026-09-10 workbook
                added and nothing on the card could show until now. */}
            {m.lines?.length > 0 && (
              <table className="gp-lines">
                <thead>
                  <tr><th>Designation</th><th>Description</th><th className="n">Qty</th><th className="u">UOM</th></tr>
                </thead>
                <tbody>
                  {m.lines.map((l, j) => (
                    <tr key={j}>
                      <td>{l.designation || <span className="gp-dash">—</span>}</td>
                      <td title={l.description2}>{l.description2 || <span className="gp-dash">—</span>}</td>
                      <td className="n">{l.qty == null ? 'TBC' : num(l.qty)}</td>
                      <td className="u">{l.uom || m.uom || <span className="gp-dash">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ))}
      </div>

      <footer className="gp-foot">
        {lineCount > 0
          ? `${members.length} deliver${members.length === 1 ? 'y' : 'ies'} · ${lineCount} line item${lineCount === 1 ? '' : 's'}`
          : `${members.length} deliver${members.length === 1 ? 'y' : 'ies'}`}
      </footer>
    </aside>
  )
}

// ---------------------------------------------------------------------------

export default function DeliveryGantt({ parents, unit, onUnit, mode, onMode }) {
  const { theme } = useTheme()
  const S = seriesFor(theme)
  // DIRECTION BY COLOUR — and deliberately NOT the app's usual pairing. Movement History
  // and the KPI tiles use orange for incoming and deep red for outgoing; this card was
  // asked for RED incoming and ORANGE outgoing. So the in lane takes S.total (the red
  // role) and the out lane S.incoming (the orange role): both are per-theme values from
  // seriesFor(), so neither is a new colour and neither needs its own dark-mode tuning —
  // only the assignment differs. The In / Out column inks follow the same swap, or the
  // card would contradict itself between its figures and its bars.
  const IN_C = S.total
  const OUT_C = S.incoming
  const scrollRef = useRef(null)
  const tlHeadRef = useRef(null)
  const leftHeadRef = useRef(null)
  // THE TODAY LINE IS THE REAL CURRENT DATE. `dayTick` exists only to re-read the clock:
  // the date is captured once per mount, and a timer fires at the next local midnight to
  // bump it, so a card left open overnight redraws its line on the new day instead of
  // stranding it on yesterday. Everything downstream — the line, the chip, the Today
  // button, bar opacity and the timeline window — reads this one value.
  const [dayTick, setDayTick] = useState(0)
  const today = useMemo(() => ganttToday(), [dayTick])
  useEffect(() => {
    const ms = startOfDay(new Date()).getTime() + 86400000 - Date.now()
    const id = setTimeout(() => setDayTick((n) => n + 1), Math.max(1000, ms + 500))
    return () => clearTimeout(id)
  }, [dayTick])

  const [cursor, setCursor] = useState(() => ganttToday())
  const [dragging, setDragging] = useState(false)
  const [expanded, setExpanded] = useState(() => new Set())
  const [hover, setHover] = useState(null)
  // The bar whose detail panel is open, or null. Holds the item itself rather than an
  // index, so a re-layout (a zoom change, a filter, opening a material) cannot leave the
  // panel pointing at a different delivery than the one that was clicked.
  const [openBar, setOpenBar] = useState(null)

  // Escape closes the panel. Bound while it is open only, so this card does not swallow
  // Escape from anything else on the dashboard the rest of the time.
  useEffect(() => {
    if (!openBar) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setOpenBar(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openBar])

  // A re-layout can remove the bar the panel is showing — switching to Out mode drops
  // every in-lane bar, a filter can drop the row, a zoom change re-merges bars into
  // different groups. Close rather than leave the panel showing a delivery that is no
  // longer on the chart.
  useEffect(() => { setOpenBar(null) }, [unit, mode, parents])

  // How many scheduled deliveries have no target date at all, counted over PARENTS (a
  // parent already sums its children, so adding the opened rows would double it).
  const undatedTotal = useMemo(
    () => parents.reduce((a, p) => a + (p.undatedInCount || 0), 0),
    [parents]
  )

  const colWidth = TIMELINE_UNITS.find((u) => u.value === unit)?.colWidth || 74

  // The window is computed from ALL rows, not the filtered or expanded set, so neither
  // filtering nor opening a material rescales the timeline underneath the reader.
  const allRows = useMemo(() => buildGanttRows(), [])
  const hasAnyRows = allRows.length > 0
  const { from, to } = useMemo(() => timelineRange(allRows, unit, today), [allRows, unit, today])
  const ticks = useMemo(() => timelineTicks(from, to, unit), [from, to, unit])
  const groups = useMemo(() => tickGroups(ticks, unit), [ticks, unit])

  const totalW = Math.max(1, ticks.length * colWidth)
  const t0 = from.getTime()
  const t1 = to.getTime()
  const scale = useMemo(() => (t) => ((t - t0) / (t1 - t0)) * totalW, [t0, t1, totalW])
  const unscale = (x) => new Date(t0 + (Math.min(Math.max(x, 0), totalW) / totalW) * (t1 - t0))

  const rows = useMemo(() => visibleRows(parents, expanded), [parents, expanded])
  const todayEdge = cursorEdge(today)
  const layouts = useMemo(() => rows.map((r) => layoutRow(r, scale, mode, totalW, todayEdge)), [rows, scale, mode, totalW, todayEdge])

  const laneCount = mode === 'both' ? 2 : 1
  const rowH = LANE_H * laneCount
  const gridRows = `${HEAD_H}px repeat(${Math.max(rows.length, 1)}, ${rowH}px)`

  const nowX = scale(todayEdge - 1)
  const cursorX = scale(cursorEdge(cursor) - 1)

  // Capacity is summed over PARENTS only. A parent already equals the sum of its
  // children, so including an opened child's rows too would count that stock twice.
  const cap = useMemo(() => capacityAt(parents, cursor), [parents, cursor])
  const atCursor = useMemo(() => rows.map((r) => rowAt(r, cursor)), [rows, cursor])

  // Open the view on today rather than on the far left, where a 2025 pullout would park it.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const lead = leftHeadRef.current?.offsetWidth || 0
    el.scrollLeft = Math.max(0, lead + nowX - el.clientWidth * 0.45)
  }, [unit]) // eslint-disable-line react-hooks/exhaustive-deps

  // Dragging the position line. The move/up handlers live on WINDOW for the duration of
  // the gesture: releasing over any other element must still end the drag, or the line
  // keeps following the pointer afterwards.
  const dateFromClientX = (clientX) => {
    const box = tlHeadRef.current?.getBoundingClientRect()
    if (!box) return cursor
    return startOfDay(unscale(clientX - box.left))
  }
  const onHandleDown = (e) => { e.preventDefault(); e.stopPropagation(); setDragging(true) }
  const nudge = (days) => setCursor((c) => new Date(c.getFullYear(), c.getMonth(), c.getDate() + days))
  const onHandleKey = (e) => {
    const step = unit === 'day' ? 1 : unit === 'week' ? 7 : unit === 'month' ? 30 : 91
    if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-step) }
    if (e.key === 'ArrowRight') { e.preventDefault(); nudge(step) }
    if (e.key === 'Home') { e.preventDefault(); setCursor(startOfDay(from)) }
    if (e.key === 'End') { e.preventDefault(); setCursor(startOfDay(new Date(t1 - 1))) }
  }
  useEffect(() => {
    if (!dragging) return
    const move = (e) => setCursor(dateFromClientX(e.clientX))
    const stop = () => setDragging(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    window.addEventListener('blur', stop)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      window.removeEventListener('blur', stop)
    }
  }, [dragging, t0, t1, totalW]) // eslint-disable-line react-hooks/exhaustive-deps

  // Clicking the chart moves the line. CLICK, not pointerdown: a pointerdown fires at
  // the start of a sideways scroll gesture too, so on a touch screen every attempt to
  // pan the timeline would fling the line to wherever the finger landed.
  const onTimelineClick = (e) => {
    // Guarded on both sides. The handler sits on the GRID, because the overlay it
    // logically belongs to is pointer-events:none (so bars keep their tooltips) and
    // would never receive the event: so ignore anything that is its own control, and
    // require the press to have landed in the timeline rather than a frozen column.
    if (e.target.closest?.('.gbar, .gtt-grip, .gtt-capwin, .gd-caret, .gtt-left, .gtt-right')) return
    if (!e.target.closest?.('.gtt-row, .gtt-overlay')) return
    setCursor(dateFromClientX(e.clientX))
  }

  const jumpTo = (d) => {
    setCursor(startOfDay(d))
    const el = scrollRef.current
    if (!el) return
    const lead = leftHeadRef.current?.offsetWidth || 0
    el.scrollLeft = Math.max(0, lead + scale(cursorEdge(d) - 1) - el.clientWidth / 2)
  }

  const toggleRow = (key) => setExpanded((s) => {
    const next = new Set(s)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })
  const allOpen = parents.filter((p) => p.expandable).every((p) => expanded.has(p.key))
  const toggleAll = () => setExpanded(allOpen ? new Set() : new Set(parents.filter((p) => p.expandable).map((p) => p.key)))
  const anyExpandable = parents.some((p) => p.expandable)

  const heldPct = SAFEKEEPING_M2 > 0 ? (cap.m2 / SAFEKEEPING_M2) * 100 : 0
  const cursorIsNow = startOfDay(cursor).getTime() === today.getTime()

  const capTitle = [
    'PROVISIONAL floor-space estimate.',
    '',
    `Floor    ${cap.m2.toFixed(0)} m2, from ${num(cap.positions)} pallet positions`,
    `Landed   ${num(cap.units)} units delivered by ${fmtDate(cursor)}`,
    '',
    'It only grows as the line moves right, and that is correct: nothing in this schedule',
    'ever leaves. There is no outbound anywhere in the system, and no opening stock in the',
    'delivery workbook, so this is what the deliveries themselves put on the floor.',
    '',
    'Rack arithmetic is from the warehouse drawing: a Type B bay is 3.3 m x 1.29 m over five',
    `levels, and the plan's own rack pitch adds 2.53x for the aisle -> ${M2_PER_POSITION.toFixed(2)} m2 of floor per position.`,
    '',
    'Part-pallets are rounded up PER MATERIAL, not on the total: two different materials do',
    'not share a pallet position, so a third of a pallet of sealant and a third of a pallet',
    `of doors are two positions, not one. Exact pallets ${cap.exactPallets.toFixed(1)} -> ${num(cap.positions)} positions.`,
    '',
    'What is ESTIMATED is how many units fit a pallet, because no source workbook records a',
    'pack size. Every figure above moves INVERSELY with these: double a pack size and that',
    'material claims half the floor:',
    ...cap.perRow.slice(0, 6).map((r) => `   ${r.name} — ${num(r.qty)} at ${num(r.upp)}/pallet -> ${num(r.positions)} positions`),
    '',
    `Compared against the Safekeeping area's ${SAFEKEEPING_M2.toFixed(0)} m2 of floor (floor-plan geometry).`,
  ].join('\n')

  const laneStyle = { height: LANE_H }

  return (
    <div className={`gtt-root gtt-mode-${mode}`}>
      {/* ------------------------------------------------------------- controls */}
      <div className="gtt-bar">
        {/* The legend that used to sit here is gone. Six swatches explaining four bar
            states and two lines took the whole left half of the control bar to restate
            what the chart already shows: the In / Out header is colour-coded, a faded
            bar plainly reads as not-yet, and both lines are labelled where they stand.
            Every bar still carries the full account in its tooltip and its panel. */}
        <div className="gtt-spacer" aria-hidden="true" />
        <div className="gtt-ctl">
          {anyExpandable && (
            <button type="button" className="btn-ghost btn-xs" onClick={toggleAll}>
              <Icon name={allOpen ? 'minus' : 'plus'} size={12} /> {allOpen ? 'Collapse' : 'Expand'} all
            </button>
          )}
          <button type="button" className={`btn-ghost btn-xs ${cursorIsNow ? 'is-on' : ''}`} onClick={() => jumpTo(today)}>
            <Icon name="clock" size={12} /> Today
          </button>
          <button type="button" className="btn-ghost btn-xs" onClick={() => jumpTo(new Date(t1 - 1))}>
            <Icon name="arrowUp" size={12} className="rot90" /> End
          </button>
          <Toggle options={LANE_MODES} value={mode} onChange={onMode} size="sm" className="gtt-lanes" />
          <Toggle options={TIMELINE_UNITS} value={unit} onChange={onUnit} size="sm" className="gtt-unit" />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="gtt-empty">
          <NoData
            what={hasAnyRows ? 'No delivery matches these filters' : 'No delivery schedule loaded'}
            why={hasAnyRows
              ? 'Clear the search or the dropdowns above to see the whole schedule.'
              : 'The schedule and the safekeeping sheets come from Postgres after sign-in. Settings → Data source reports whether that load succeeded.'}
          />
        </div>
      ) : (
        /* ONE scroll container, both axes. The identity columns and the EOH column are
           sticky inside it rather than being separate panes, which is what lets the
           whole chart be capped to the display height and scroll as a single object —
           three panes would need a scroll listener to stay in step vertically. */
        <div className="gtt-main">
        {/* The ring is its own column to the LEFT of the chart, showing the month the
            position line is standing in — see DeliveryMonthPie. It sits outside the
            scrollport so it does not scroll away with the rows, and it is the first
            child so it reads before the chart rather than hanging off the end. */}
        <DeliveryMonthPie parents={parents} cursor={cursor} />

        <div className="gtt-scroll" ref={scrollRef}>
          {/* The stage is a content-sized positioning context for the overlay and the
              footbar. They must NOT be grid items: an explicitly-placed item spanning
              `grid-row: 1 / -1` of column 2 reserves that column in every row, and the
              auto-placed cells then flow AROUND it — the left cell of row 1 landed in
              the EOH column, the timeline header spilled into a phantom fourth column,
              and the content measured 3,954px instead of 2,256px. */}
          <div className="gtt-stage">
          <div className="gtt-grid" onClick={onTimelineClick} style={{ gridTemplateRows: gridRows, gridTemplateColumns: `var(--gtt-left) ${totalW}px var(--gtt-eoh)` }}>

            {/* header ------------------------------------------------------- */}
            <div className="gtt-cell gtt-head gtt-left gtt-corner" ref={leftHeadRef}>
              <span className="gc gc-desc">Material</span>
              {/* Min sits BEFORE BOH: the floor comes first and the position is read
                  against it, which is the order the question is actually asked in. */}
              <span className="gc gc-n" title={hasRealMinStock
                ? 'Minimum stock level — the buffer this material should not fall below.'
                : `Minimum stock level — the buffer this material should not fall below. MODELLED, not recorded: no source carries one, so each is ${MIN_STOCK_COVER_PCT}% of what that project has scheduled for the material, rounded to a planning step. Replace with agreed figures in MIN_STOCK_OVERRIDE in deliveryGantt.js.`}>Min</span>
              <span className="gc gc-n" title="Beginning on hand. The delivery workbook records no opening stock, so this reads 0 on every row — see the note under the chart.">BOH</span>
              {/* ONE header for the In / Out column, and the two words are COLOURED —
                  red for in, orange for out, matching the bars and the figures below.
                  That is what let the per-row "IN" / "OUT" tags go: the colour of a
                  figure already says which direction it is, so repeating the word on
                  every row was spending the column's width to say it a second time. */}
              <span className="gc gc-n gc-flow-h">
                {mode !== 'out' && <em className="gfh gfh-in">In</em>}
                {mode === 'both' && <i className="gfh-sep">/</i>}
                {mode !== 'in' && <em className="gfh gfh-out">Out</em>}
              </span>
            </div>
            <div className="gtt-cell gtt-head gtt-thead" ref={tlHeadRef} style={{ paddingBottom: CURSOR_RAIL }}>
              <div className="gtt-groups">
                {groups.map((g) => (
                  <span key={`${g.label}-${g.from}`} className="gtg" style={{ left: g.from * colWidth, width: g.span * colWidth }}>{g.label}</span>
                ))}
              </div>
              <div className="gtt-ticks">
                {ticks.map((t, i) => (
                  <span key={t.key} className={`gtk ${i % 2 ? 'alt' : ''}`} style={{ left: i * colWidth, width: colWidth }}>
                    {TICK_LABEL[unit](t)}
                  </span>
                ))}
              </div>
              {/* Both markers' furniture sits in the header because the header is the
                  part that stays pinned; only their lines run down the rows. */}
              <span className="gtt-now-tag" style={{ left: nowX }} title={`Today — ${fmtDate(today)}`}>Today</span>
              <button type="button" className={`gtt-grip ${dragging ? 'is-drag' : ''}`} style={{ left: cursorX }}
                onPointerDown={onHandleDown} onKeyDown={onHandleKey}
                aria-label={`Position line, ${fmtDate(cursor)}. Arrow keys to move.`}
                title={`Stock position as of ${fmtDate(cursor)} — drag, or use the arrow keys`}>
                <Icon name="transfer" size={11} />
                <span className="gtt-grip-date">{fmtDate(cursor)}</span>
              </button>
            </div>
            <div className="gtt-cell gtt-head gtt-right gtt-corner-r">
              <span className="gc gc-n gc-eoh-h">EOH<em>{fmtDate(cursor)}</em></span>
            </div>

            {/* rows --------------------------------------------------------- */}
            {rows.map((r, i) => {
              const L = layouts[i]
              const a = atCursor[i]
              const open = r.isParent && expanded.has(r.key)
              const sel = hover === r.key
              const cls = `${r.isParent ? 'is-parent' : 'is-child'} ${open ? 'is-open' : ''} ${sel ? 'is-sel' : ''}`
              const on = { onMouseEnter: () => setHover(r.key), onMouseLeave: () => setHover(null) }
              return (
                <div key={r.key} className="gtt-rowgroup" style={{ display: 'contents' }}>
                  {/* identity + quantities */}
                  <div className={`gtt-cell gtt-left gtt-lrow ${cls}`} {...on}>
                    <span className="gc gc-desc">
                      {r.isParent && r.expandable ? (
                        <button type="button" className="gd-caret" onClick={() => toggleRow(r.key)}
                          aria-expanded={open} title={open ? 'Hide the projects' : `Show the ${r.projectCount} projects`}>
                          <Icon name="chevronRight" size={12} />
                        </button>
                      ) : <span className="gd-caret gd-caret-none" aria-hidden="true" />}
                      {/* Two lines on a parent in Both mode: the material, then the
                          projects it is for. A child row's label is its project, shown
                          by its SHORT name — the full one ellipsises in this column
                          exactly where the projects differ ("4PH Jab Greenwo…" against
                          "4PH Jena…"), so the distinctive word is the useful one and the
                          full name stays in the tooltip. */}
                      <span className="gd-lines">
                        <span className="gd-name" title={r.isParent ? [r.materialName, r.brand, r.matDetail].filter(Boolean).join(' · ') : r.project}>
                          {r.isParent ? r.materialName : r.project}
                        </span>
                        {r.isParent && r.projectTags?.length > 0 && (
                          <span className="gd-tags" title={`For ${r.projects.join(', ')}`}>
                            {r.projectTags.map((t) => <em key={t} className="gd-tag">{t}</em>)}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className={`gc gc-n gc-min ${r.minStock == null ? 'is-unset' : ''} ${r.minStockModelled ? 'is-modelled' : ''}`} title={r.minStock == null
                      ? `No minimum stock level for ${r.materialName} — nothing is scheduled for it on this row, so there is no scale to model one from.`
                      : [
                        `Minimum stock level ${num(r.minStock)} ${r.uom || ''}`.trim(),
                        r.minStockModelled
                          ? `MODELLED, not agreed: ${MIN_STOCK_COVER_PCT}% of the ${num(r.scheduledQty)} this row has scheduled, rounded to a planning step. It scales with the project, but no one has signed it off.`
                          : 'A recorded level from MIN_STOCK_OVERRIDE.',
                        r.minStockPartial ? 'Summed over only the projects that have one, so it under-states the material.' : '',
                      ].filter(Boolean).join('\n')}>
                      {r.minStock == null ? '—' : num(r.minStock)}
                      {r.minStockPartial && <em className="gc-flag">!</em>}
                    </span>
                    <span className="gc gc-n gc-boh" title="Beginning on hand is 0 because the delivery workbook records no opening stock — it is a schedule of what will arrive, not a stock file. This is genuinely zero-as-unknown, not a measured empty shelf.">
                      {num(r.boh)}
                    </span>

                    {/* In and Out in ONE column, two sub-rows, each the height of the
                        lane it totals — so the figure and its bars share a baseline.
                        Switching to a single direction drops the other sub-row, which
                        is what lets the row collapse to one lane with no special case. */}
                    <span className="gc gc-flow">
                      {L.showIn && (
                        <span className="gf gf-in" title={[
                          `Every incoming bar drawn on this row adds to ${num(r.totalIn)}.`,
                          r.tbcIn ? `${r.tbcIn} more bar${r.tbcIn === 1 ? '' : 's'} carr${r.tbcIn === 1 ? 'ies' : 'y'} no agreed quantity (TBC in the source) and add nothing.` : '',
                          r.undatedInCount ? `${r.undatedInCount} scheduled deliver${r.undatedInCount === 1 ? 'y' : 'ies'} totalling ${num(r.undatedIn)} ${r.uom || ''} have NO target date in the source, so they cannot be placed on the timeline and are not counted here.`.replace(/\s+/g, ' ') : '',
                        ].filter(Boolean).join('\n')}>
                          {num(r.totalIn)}
                          {/* One chip for everything held OUT of the figure, so the
                              column always equals the bars drawn beside it. */}
                          {(r.tbcIn + r.undatedInCount) > 0 && <em className="gc-tbc">+{r.tbcIn + r.undatedInCount}</em>}
                        </span>
                      )}
                      {L.showOut && (
                        <span className="gf gf-out" title={`Every outgoing bar on this row adds to ${num(r.totalOut)}.`}>
                          {num(r.totalOut)}
                        </span>
                      )}
                    </span>
                  </div>

                  {/* timeline */}
                  <div className={`gtt-cell gtt-row ${cls}`} {...on}>
                    {ticks.map((t, k) => <span key={t.key} className={`gtt-gl ${k % 2 ? 'alt' : ''}`} style={{ left: k * colWidth, width: colWidth }} />)}
                    {L.showIn && (
                      <div className="gtt-lane gtt-lane-in" style={laneStyle}>
                        {L.inItems.map((it, bi) => (
                          <Bar key={`i${bi}`} item={it} row={r} colour={IN_C}
                            barKey={`${r.key}|in|${bi}`} isOpen={openBar?.key === `${r.key}|in|${bi}`}
                            onOpen={setOpenBar} />
                        ))}
                      </div>
                    )}
                    {L.showOut && (
                      <div className="gtt-lane gtt-lane-out" style={laneStyle}>
                        {L.outItems.map((it, bi) => (
                          <Bar key={`o${bi}`} item={it} row={r} colour={OUT_C}
                            barKey={`${r.key}|out|${bi}`} isOpen={openBar?.key === `${r.key}|out|${bi}`}
                            onOpen={setOpenBar} />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* closing position at the line */}
                  <div className={`gtt-cell gtt-right gtt-rrow ${cls}`} {...on}>
                    <span className="gc gc-n gc-eoh" title={[
                      `EOH as of ${fmtDate(cursor)}`,
                      `  BOH        ${num(r.boh)}`,
                      `+ received   ${num(a.inQty)}`,
                      `- issued     ${num(a.outQty)}`,
                      `= ${num(a.eoh)}`,
                      '',
                      `With the whole schedule delivered: ${num(r.eoh)}.`,
                      r.tbcIn ? `${r.tbcIn} scheduled bar${r.tbcIn === 1 ? '' : 's'} carry no agreed quantity, so neither figure includes them.` : '',
                    ].filter(Boolean).join('\n')}>
                      {num(a.eoh)}
                      {Math.round(a.eoh) !== Math.round(r.eoh) && <em className="gc-eoh-full">/{num(r.eoh)}</em>}
                    </span>
                  </div>
                </div>
              )
            })}

          </div>

            {/* The two lines, spanning every row of the timeline column. Absolutely
                positioned over the grid — inside the scrollport, so they scroll with the
                bars and stay pinned to a DATE. `bottom` clears the footbar's own height
                so the lines end exactly where the rows do. */}
            <div className="gtt-overlay" style={{ width: totalW, bottom: FOOT_H }}>
              <span className="gtt-now" style={{ left: nowX }} />
              <span className={`gtt-cursor ${dragging ? 'is-drag' : ''}`} style={{ left: cursorX }} />
            </div>

          {/* The capacity window rides the line. Sticky to the BOTTOM of the scrollport
              so it stays visible however far the rows are scrolled, while its left
              offset stays in timeline space so it still travels with the cursor. */}
          <div className="gtt-footbar" style={{ marginLeft: 'var(--gtt-left)', width: totalW, height: FOOT_H }}>
            <div className="gtt-capwin" title={capTitle}
              style={{ left: Math.min(Math.max(cursorX, CAPWIN_W / 2 + 4), Math.max(CAPWIN_W / 2 + 4, totalW - CAPWIN_W / 2 - 4)) }}>
              {/* TWO LINES. It was six — a heading, the figure, a pallet-position count,
                  a net line, a progress bar and a percentage caption — for a read-out
                  that is explicitly provisional and travels over the chart. The figure
                  and the net are the two things a reader is actually tracking as they
                  drag the line; the position count, the bar and the heading all said
                  something the tooltip says better, and the heading was labelling a
                  number whose unit is printed right beside it. */}
              {/* ONE figure and what it is a share of. The second line used to carry a
                  "net" that was arithmetically identical to the first — with nothing
                  outbound and no opening stock, in-minus-out and opening-plus-in-minus-out
                  are the same sum, so the window printed the same number twice. What
                  actually adds something is the position count and the share of the
                  Safekeeping floor. */}
              <strong className="gcw-m2">{cap.m2 < 10 ? cap.m2.toFixed(1) : num(cap.m2)}<em>m²</em></strong>
              <span className="gcw-sub">
                <b>{num(cap.positions)}</b>
                {' pos · '}{heldPct.toFixed(0)}%<i className="gcw-of"> of Safekeeping</i>
              </span>
            </div>
          </div>
          </div>
        </div>
        </div>
      )}

      {/* The detail panel is a sibling of the SCROLLPORT, never a child of it: inside,
          it would scroll away with the rows and be clipped by the scrollport's own
          overflow. It overlays the right-hand edge of the chart instead, so opening it
          never reflows the timeline underneath — a panel that pushed the chart would
          re-scale every bar the moment you clicked one. */}
      <DetailPanel open={openBar} onClose={() => setOpenBar(null)} />

      <p className="gtt-note">
        <Icon name="alert" size={12} />
        <span>
          {/* CAVEATS ONLY, STATED ONCE. This was ~200 words explaining how to read the
              chart — what a faded bar means, why bars merge, what a badge counts. All of
              that the chart shows for itself, and repeating it here was the same habit
              as the per-value hints that came out of the panel. What stays is only the
              facts that change how a NUMBER should be read, each in a clause: a reader
              who does not know them would draw a wrong conclusion. */}
          Source: delivery workbook only, warehouse-bound lines
          ({deliveryExcluded.total} of {deliveryExcluded.source} excluded — {deliveryExcluded.siteBound} site-bound,
          {' '}{deliveryExcluded.blank} no destination).
          {' '}<strong>BOH is 0</strong> — the workbook records no opening stock, and nothing is scheduled out.
          {' '}<em>TBC</em> quantities are excluded from totals.
          {undatedTotal > 0 && <>{' '}{undatedTotal} undated deliveries are not counted (the <em>+n</em> beside a figure).</>}
          {!hasRealMinStock && <>{' '}<strong>Min stock is modelled</strong> at {MIN_STOCK_COVER_PCT}% of what each project has scheduled.</>}
          {' '}Floor space is provisional.
        </span>
      </p>
    </div>
  )
}
