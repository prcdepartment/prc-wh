import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  buildGanttRows, visibleRows, timelineRange, timelineTicks, tickGroups, TICK_LABEL,
  TIMELINE_UNITS, rowAt, capacityAt, cursorEdge, startOfDay, M2_PER_POSITION,
} from '../data/deliveryGantt'
import { num, fmtDate, fmtTargetText, fmtTower, TODAY } from '../lib/format'
import { seriesFor } from '../lib/colors'
import { useTheme } from '../context/ThemeContext'
import { whAreaM2, WH_AREAS } from '../data/warehouseMap'
import Icon from '../lib/icons'
import { Toggle, NoData } from './ui'
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

// Quantity-label width. The numbers render at 9.5px/800 with tabular-nums, so every
// digit is the same width and a per-character figure is exact — measured at 7.2px/char.
const CHAR_W = 7.3
const LABEL_PAD = 7
const labelWidth = (txt) => txt.length * CHAR_W + LABEL_PAD

const CAPWIN_W = 168
// Height reserved for the capacity window at the end of the content, measured against
// what the window actually renders (~92px plus its 8px offset). Because that space is
// real, the window covers nothing whenever the chart fits the display.
const FOOT_H = 104

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
const TODAY_EDGE = cursorEdge(TODAY)
const isPast = (end) => end.getTime() <= TODAY_EDGE

const sumQty = (members) => {
  const known = members.filter((m) => m.qty != null)
  return { qty: known.length ? known.reduce((a, m) => a + m.qty, 0) : null, tbc: members.length - known.length }
}

function makeItem(members, scale, totalW) {
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
    past: isPast(end),
  }
}

// Lay a lane's bars on ONE track, merging any that would touch (their labels counted).
// Repeats until nothing merges, because a merge widens the label and can open a new
// overlap.
//
// Two bars are never merged ACROSS the today line. Opacity is what tells elapsed from
// scheduled, so a merged bar has to be wholly one or the other or it could not be drawn
// truthfully — and the line is a real boundary in the reader's head, not a tick.
function packTrack(bars, scale, totalW) {
  if (!bars.length) return []
  let items = bars.map((b) => makeItem([b], scale, totalW)).sort((a, b) => a.left - b.left)
  for (let guard = 0; guard < 50; guard++) {
    const out = []
    let merged = false
    for (const it of items) {
      const prev = out[out.length - 1]
      if (prev && prev.past === it.past && it.left < prev.right + 3) {
        out[out.length - 1] = makeItem([...prev.members, ...it.members], scale, totalW)
        merged = true
      } else out.push(it)
    }
    items = out
    if (!merged) break
  }
  return items
}

function layoutRow(row, scale, mode, totalW) {
  const showIn = mode !== 'out'
  const showOut = mode !== 'in'
  // row.inBars is already the recorded receipts plus the dated schedule; row.outBars the
  // recorded pullouts. One track each, since the two kinds now look the same and putting
  // them on separate tracks would only let them overlap invisibly.
  return {
    inItems: showIn ? packTrack(row.inBars, scale, totalW) : [],
    outItems: showOut ? packTrack(row.outBars, scale, totalW) : [],
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
        : `${fmtTargetText(m.targetText) || 'TBC'} — an estimate, so the bar spans the window the source commits to`
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

function Bar({ item, row, colour }) {
  return (
    <span
      className={[
        'gbar', item.past ? 'is-past' : 'is-future',
        item.qty == null ? 'gbar-tbc' : '',
        item.stretched ? 'is-min' : '',
        item.inside ? '' : 'gbar-out',
        item.inside ? '' : (item.leftSide ? 'lbl-left' : 'lbl-right'),
        item.members.length > 1 ? 'is-merged' : '',
      ].filter(Boolean).join(' ')}
      style={{ left: item.x, width: item.w, top: BAR_TOP, height: BAR_H, '--c': colour }}
      title={itemTitle(item, row)}
    >
      <em className="gb-n">{item.label}</em>
      {item.members.length > 1 && <i className="gb-mult" aria-hidden="true">{item.members.length}</i>}
    </span>
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
  const [cursor, setCursor] = useState(() => startOfDay(TODAY))
  const [dragging, setDragging] = useState(false)
  const [expanded, setExpanded] = useState(() => new Set())
  const [hover, setHover] = useState(null)

  const colWidth = TIMELINE_UNITS.find((u) => u.value === unit)?.colWidth || 74

  // The window is computed from ALL rows, not the filtered or expanded set, so neither
  // filtering nor opening a material rescales the timeline underneath the reader.
  const allRows = useMemo(() => buildGanttRows(), [])
  const hasAnyRows = allRows.length > 0
  const { from, to } = useMemo(() => timelineRange(allRows, unit), [allRows, unit])
  const ticks = useMemo(() => timelineTicks(from, to, unit), [from, to, unit])
  const groups = useMemo(() => tickGroups(ticks, unit), [ticks, unit])

  const totalW = Math.max(1, ticks.length * colWidth)
  const t0 = from.getTime()
  const t1 = to.getTime()
  const scale = useMemo(() => (t) => ((t - t0) / (t1 - t0)) * totalW, [t0, t1, totalW])
  const unscale = (x) => new Date(t0 + (Math.min(Math.max(x, 0), totalW) / totalW) * (t1 - t0))

  const rows = useMemo(() => visibleRows(parents, expanded), [parents, expanded])
  const layouts = useMemo(() => rows.map((r) => layoutRow(r, scale, mode, totalW)), [rows, scale, mode, totalW])

  const laneCount = mode === 'both' ? 2 : 1
  const rowH = LANE_H * laneCount
  const gridRows = `${HEAD_H}px repeat(${Math.max(rows.length, 1)}, ${rowH}px)`

  const nowX = scale(cursorEdge(TODAY) - 1)
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

  const heldPct = SAFEKEEPING_M2 > 0 ? (cap.heldM2 / SAFEKEEPING_M2) * 100 : 0
  const cursorIsNow = startOfDay(cursor).getTime() === startOfDay(TODAY).getTime()

  const capTitle = [
    'PROVISIONAL floor-space estimate.',
    '',
    `Occupied  ${cap.heldM2.toFixed(0)} m2 from ${num(cap.heldPositions)} pallet positions`,
    `Net move  ${cap.netUnits >= 0 ? '+' : ''}${num(cap.netUnits)} units = ${cap.netPositions >= 0 ? '+' : ''}${num(cap.netPositions)} positions = ${cap.netM2 >= 0 ? '+' : ''}${cap.netM2.toFixed(0)} m2`,
    `Received  ${num(cap.inUnits)}   Issued ${num(cap.outUnits)}  (to ${fmtDate(cursor)})`,
    '',
    'Rack arithmetic is from the warehouse drawing: a Type B bay is 3.3 m x 1.29 m over five',
    `levels, and the plan's own rack pitch adds 2.53x for the aisle -> ${M2_PER_POSITION.toFixed(2)} m2 of floor per position.`,
    '',
    'What is ESTIMATED is how many units fit a pallet, because no source workbook records a',
    'pack size. Every figure above moves INVERSELY with these: double a pack size and',
    'that material claims half the floor:',
    ...cap.perRow.slice(0, 6).map((r) => `   ${r.name} — ${num(r.upp)}/pallet -> ${Math.round(Math.abs(r.pallets))} positions`),
    '',
    `Compared against the Safekeeping area's ${SAFEKEEPING_M2.toFixed(0)} m2 of floor (floor-plan geometry).`,
  ].join('\n')

  const laneStyle = { height: LANE_H }

  return (
    <div className={`gtt-root gtt-mode-${mode}`}>
      {/* ------------------------------------------------------------- controls */}
      <div className="gtt-bar">
        <div className="gtt-legend" hidden={rows.length === 0}>
          <span className="gl"><i className="gl-sw gl-solid" style={{ '--c': IN_C }} />In · to date</span>
          <span className="gl"><i className="gl-sw gl-wash" style={{ '--c': IN_C }} />In · scheduled</span>
          <span className="gl"><i className="gl-sw gl-solid" style={{ '--c': OUT_C }} />Out · to date</span>
          <span className="gl"><i className="gl-sw gl-wash" style={{ '--c': OUT_C }} />Out · scheduled</span>
          <span className="gl gl-line"><i className="gl-now" />Today</span>
          <span className="gl gl-line"><i className="gl-cur" />Position line</span>
        </div>
        <div className="gtt-ctl">
          {anyExpandable && (
            <button type="button" className="btn-ghost btn-xs" onClick={toggleAll}>
              <Icon name={allOpen ? 'minus' : 'plus'} size={12} /> {allOpen ? 'Collapse' : 'Expand'} all
            </button>
          )}
          <button type="button" className={`btn-ghost btn-xs ${cursorIsNow ? 'is-on' : ''}`} onClick={() => jumpTo(TODAY)}>
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
              <span className="gc gc-n">BOH</span>
              <span className="gc gc-n">In</span>
              <span className="gc gc-n">Out</span>
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
              <span className="gtt-now-tag" style={{ left: nowX }} title={`Today — ${fmtDate(TODAY)}`}>Today</span>
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
                      <span className="gd-name" title={r.isParent ? [r.materialName, r.brand, r.matDetail].filter(Boolean).join(' · ') : r.project}>
                        {r.isParent ? r.materialName : r.project}
                      </span>
                      {r.isParent && r.expandable && <em className="gd-count">{r.projectCount}</em>}
                    </span>
                    <span className="gc gc-n gc-boh" title={r.bohAdjusted
                      ? `Wound back below zero from the sheet's closing stock — the source's own totals do not reconcile with its dated movements here. Shown as 0.`
                      : `Stock before the first movement on this timeline. Wound back from the sheet's closing ${num(r.sheetSoh || 0)} by the ${num(r.recordedIn || 0)} received and ${num(r.recordedOut || 0)} issued since.`}>
                      {num(r.boh)}{r.bohAdjusted && <em className="gc-flag">!</em>}
                    </span>
                    <span className="gc gc-n gc-in" title={`Every incoming bar on this row adds to ${num(r.totalIn)}${r.tbcIn ? ` — plus ${r.tbcIn} whose quantity is still TBC` : ''}.`}>
                      {num(r.totalIn)}{r.tbcIn > 0 && <em className="gc-tbc">+{r.tbcIn}</em>}
                    </span>
                    <span className="gc gc-n gc-out" title={`Every outgoing bar on this row adds to ${num(r.totalOut)}.`}>
                      {num(r.totalOut)}
                    </span>
                  </div>

                  {/* timeline */}
                  <div className={`gtt-cell gtt-row ${cls}`} {...on}>
                    {ticks.map((t, k) => <span key={t.key} className={`gtt-gl ${k % 2 ? 'alt' : ''}`} style={{ left: k * colWidth, width: colWidth }} />)}
                    {L.showIn && (
                      <div className="gtt-lane gtt-lane-in" style={laneStyle}>
                        {L.inItems.map((it, bi) => <Bar key={`i${bi}`} item={it} row={r} colour={IN_C} />)}
                      </div>
                    )}
                    {L.showOut && (
                      <div className="gtt-lane gtt-lane-out" style={laneStyle}>
                        {L.outItems.map((it, bi) => <Bar key={`o${bi}`} item={it} row={r} colour={OUT_C} />)}
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
              <span className="gcw-hd"><Icon name="warehouse" size={11} /> Floor space</span>
              <strong className="gcw-m2">{cap.heldM2 < 10 ? cap.heldM2.toFixed(1) : num(cap.heldM2)}<em>m²</em></strong>
              <span className="gcw-sub">{num(cap.heldPositions)} pallet positions</span>
              <span className={`gcw-net ${cap.netM2 >= 0 ? 'up' : 'dn'}`}>
                <Icon name={cap.netM2 >= 0 ? 'arrowUp' : 'arrowDown'} size={10} />
                {cap.netM2 >= 0 ? '+' : '−'}{num(Math.abs(cap.netM2))} m² net
              </span>
              <span className="gcw-track" title={`${heldPct.toFixed(0)}% of the Safekeeping area's ${SAFEKEEPING_M2.toFixed(0)} m²`}>
                <i style={{ width: `${Math.min(100, heldPct)}%` }} className={heldPct > 100 ? 'over' : ''} />
              </span>
              <span className="gcw-foot">{heldPct.toFixed(0)}% of Safekeeping · provisional</span>
            </div>
          </div>
          </div>
        </div>
      )}

      <p className="gtt-note">
        <Icon name="alert" size={12} />
        <span>
          <strong>No outbound schedule exists.</strong> Nothing in the warehouse system plans a release,
          so the <em>out</em> lane shows recorded pullouts only and is empty to the right of today.
          A solid bar has fallen on or before today; a faded one is still ahead. Bars that overlap at this
          zoom are merged and carry their combined quantity — a badge shows how many, and nothing is ever
          merged across the today line. Quantities read <em>TBC</em> where the source has not agreed one;
          those are excluded from every total rather than counted as zero. Floor space is a provisional estimate — hover it for the
          arithmetic and the pack sizes it depends on.
        </span>
      </p>
    </div>
  )
}
