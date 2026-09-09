import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  buildGanttRows, timelineRange, timelineTicks, tickGroups, TICK_LABEL, TIMELINE_UNITS,
  rowAt, capacityAt, cursorEdge, startOfDay, M2_PER_POSITION,
} from '../data/deliveryGantt'
import { num, fmtDate, fmtTargetText, fmtTower, TODAY } from '../lib/format'
import { seriesFor } from '../lib/colors'
import { useTheme } from '../context/ThemeContext'
import { useItemMaster } from './ItemLookup'
import { whAreaM2, WH_AREAS } from '../data/warehouseMap'
import Icon from '../lib/icons'
import { Toggle, NoData } from './ui'
import '../styles/gantt.css'

// ---------------------------------------------------------------------------
// GEOMETRY
//
// A bar is drawn from a CONTINUOUS time scale, not from a column index, so a one-day
// delivery lands in the right part of a quarter-wide column rather than filling it.
//
// MIN_BAR is the one place the drawing deliberately departs from the data. Most target
// dates are firm, i.e. one day, which at Month granularity is under three pixels — too
// small to see, to hover or to carry the quantity the requirement asks for. A bar
// narrower than MIN_BAR is therefore drawn at MIN_BAR and CENTRED on its own span, so
// it stays over the right date and only its width is exaggerated. Bars wider than
// MIN_BAR are drawn exactly, left edge on the span start. At Day granularity a single
// day is already 30px, so nothing is stretched at all.
// MIN_BAR is only what a bar needs to be SEEN and hovered, not what its number needs
// to fit — the number moves outside when the bar is too small for it (see packBars).
// This was 36 so every label could sit inside, and 19 of 52 numbers were STILL clipped
// ("10,654" wants 49px) while every one-day bar drew 14 days wide at Month granularity.
// Sizing the bar for the date and moving the label out fixes both: at Day granularity a
// one-day bar is now its true 30px.
const MIN_BAR = 16
const BAR_H = 13
const BAR_GAP = 3
const LANE_PAD = 5
// Header: two label bands of 22px (the coarse unit over the fine one) plus a 24px rail
// along the bottom that belongs to the cursor handle alone. The rail exists because the
// handle has nowhere else to go: in the tick band its 92px width covers a month's label,
// at the very top it lands on the "Today" chip (both start on the same date), and parked
// at the foot of the chart beside its own read-out it fell below the fold of a laptop
// screen and could not be found. A dedicated strip costs 24px and collides with nothing.
const HEAD_BANDS = 44
const CURSOR_RAIL = 24
const HEAD_H = HEAD_BANDS + CURSOR_RAIL
const LANE_MIN = BAR_H + BAR_GAP + LANE_PAD * 2

// Label width in px for a quantity string. The numbers render at 9.5px/800 with
// font-variant-numeric: tabular-nums, so every digit is the same width and a
// per-character figure is exact rather than a guess — measured in the browser at
// 7.2px/char ("1,449" = 36px, "10,654" = 43px, both 7.2). LABEL_PAD matches .gb-n.
const CHAR_W = 7.3
const LABEL_PAD = 7
const labelWidth = (txt) => txt.length * CHAR_W + LABEL_PAD
// Kept in step with .gtt-capwin's width in gantt.css — the clamp needs the number.
const CAPWIN_W = 168
// Height of the strip below the last row that the capacity window sits in, so it never
// covers a bar. Applied as padding-bottom to all three panes to keep their feet level.
// Measured, not guessed: the window renders 120px tall and sits 6px off the bottom, so
// anything under 126 lets it ride up over the last row's bars — at 96 it overlapped by 30.
const FOOT_H = 134

const SAFEKEEPING_M2 = whAreaM2(WH_AREAS.find((a) => a.id === 'safekeeping'))

const qtyLabel = (b) => (b.qty == null ? 'TBC' : num(b.qty))

// Greedy level packing. Bars are laid into the first sub-row where they do not touch
// what is already there, so two deliveries in the same month stack instead of hiding
// one another. Without this a row with seven receipts in one quarter draws one bar.
function packBars(bars, scale) {
  const items = bars
    .map((b) => {
      const x0 = scale(b.start.getTime())
      const x1 = scale(b.end.getTime())
      const trueW = x1 - x0
      const w = Math.max(trueW, MIN_BAR)
      // Wide enough to draw honestly? Keep its left edge. Otherwise centre the
      // minimum-width bar on the span so it still points at the right date.
      const x = trueW >= MIN_BAR ? x0 : (x0 + x1) / 2 - MIN_BAR / 2
      const label = qtyLabel(b)
      const lw = labelWidth(label)
      const inside = w >= lw + 2
      return {
        bar: b, x, w, trueW, stretched: trueW < MIN_BAR, label, inside,
        // What the bar AND its label occupy, which is what a neighbour must clear.
        // Without this an outside label gets written over the next bar along.
        occupy: inside ? w : w + lw + 4,
      }
    })
    .sort((a, b) => a.x - b.x)

  const lastOf = []
  for (const it of items) {
    let lvl = lastOf.findIndex((end) => end + 2 <= it.x)
    if (lvl < 0) { lastOf.push(0); lvl = lastOf.length - 1 }
    lastOf[lvl] = it.x + it.occupy
    it.level = lvl
  }
  return { items, levels: Math.max(1, lastOf.length) }
}

// One row's full geometry. The incoming lane carries two stacks — the schedule above,
// what was actually received below — because the requirement is that a recorded
// delivery may overlap the plan it was meant to fulfil, and two bars on the same
// sub-row cannot both be seen.
function layoutRow(row, scale) {
  const planned = packBars(row.planned.filter((p) => p.start), scale)
  const actualIn = packBars(row.actualIn, scale)
  const actualOut = packBars(row.actualOut, scale)

  const stackH = (n) => n * (BAR_H + BAR_GAP)
  const inLevels = planned.levels + actualIn.levels
  const inH = Math.max(LANE_MIN, stackH(inLevels) + LANE_PAD * 2 - BAR_GAP)
  const outH = Math.max(LANE_MIN, stackH(actualOut.levels) + LANE_PAD * 2 - BAR_GAP)

  return {
    planned, actualIn, actualOut,
    plannedLevels: planned.levels,
    inH, outH, h: inH + outH,
  }
}

const barTop = (level, offsetLevels = 0) => LANE_PAD + (level + offsetLevels) * (BAR_H + BAR_GAP)

// ---------------------------------------------------------------------------



function barTitle(b, row) {
  const when = b.kind === 'planned'
    ? (b.targetDate
      ? `Target ${fmtDate(new Date(`${b.targetDate}T00:00:00`))} (firm)`
      : `Target ${fmtTargetText(b.targetText) || 'TBC'} — an estimate, so the bar spans the whole window the source commits to`)
    : `Recorded ${fmtDate(b.start)}`
  const qty = b.qty == null
    ? 'Quantity not yet agreed (TBC in the source)'
    : `${num(b.qty)} ${b.uom || row.uom || ''}`.trim() + (b.product ? ` — source reads "${b.qtyRaw}", i.e. ${b.product.join(' x ')}` : '')
  const extra = b.kind === 'planned'
    ? [b.location ? `Location ${fmtTower(b.location)}` : '', b.dpPayment ? `DP ${b.dpPayment}` : '',
      b.opsRemarks ? `Ops: ${b.opsRemarks}` : '', b.prcRemarks ? `PRC: ${b.prcRemarks}` : '']
    : [b.docRef ? `Ref ${b.docRef}` : '', b.lines ? `${b.lines} line${b.lines === 1 ? '' : 's'}` : '',
      b.codes?.length ? `Item code${b.codes.length === 1 ? '' : 's'} ${b.codes.join(', ')}` : '']
  return [`${b.kind === 'planned' ? b.label || 'Batch' : 'Delivery'} — ${row.materialName}`, when, qty, ...extra.filter(Boolean)].join('\n')
}

// ---------------------------------------------------------------------------

export default function DeliveryGantt({ rows: filteredRows, unit, onUnit }) {
  const { theme } = useTheme()
  const S = seriesFor(theme)
  const master = useItemMaster()
  const midRef = useRef(null)
  const frameRef = useRef(null)
  const [cursor, setCursor] = useState(() => startOfDay(TODAY))
  const [dragging, setDragging] = useState(false)
  const [selected, setSelected] = useState(null)

  const rows = filteredRows
  const colWidth = TIMELINE_UNITS.find((u) => u.value === unit)?.colWidth || 74

  // The window is computed from ALL rows, not the filtered set, so filtering does not
  // rescale the timeline underneath the reader.
  const allRows = useMemo(() => buildGanttRows(), [])
  // Tells the two empty states apart: a filter matched nothing, versus nothing loaded.
  const hasAnyRows = allRows.length > 0
  const { from, to } = useMemo(() => timelineRange(allRows, unit), [allRows, unit])
  const ticks = useMemo(() => timelineTicks(from, to, unit), [from, to, unit])
  const groups = useMemo(() => tickGroups(ticks, unit), [ticks, unit])

  const totalW = Math.max(1, ticks.length * colWidth)
  const t0 = from.getTime()
  const t1 = to.getTime()
  const scale = useMemo(() => (t) => ((t - t0) / (t1 - t0)) * totalW, [t0, t1, totalW])
  const unscale = (x) => new Date(t0 + (Math.min(Math.max(x, 0), totalW) / totalW) * (t1 - t0))

  const layouts = useMemo(() => rows.map((r) => layoutRow(r, scale)), [rows, scale])
  // ONE row template, shared by all three panes — that is what keeps the identity
  // columns, the bars and the EOH figure on the same line without any sticky
  // positioning or a scroll listener. Row heights vary, so it cannot be a constant.
  const rowTemplate = `${HEAD_H}px ${layouts.map((l) => `${l.h}px`).join(' ')}`
  const nowX = scale(cursorEdge(TODAY) - 1)
  const cursorX = scale(cursorEdge(cursor) - 1)

  const cap = useMemo(() => capacityAt(rows, cursor), [rows, cursor])
  const atCursor = useMemo(() => rows.map((r) => rowAt(r, cursor)), [rows, cursor])

  // Item code: the REAL codes come from the safekeeping join. Where a scheduled
  // material has never been booked into safekeeping there is no code to show, so the
  // item master is asked for a representative one by keyword — the same runtime lookup
  // the old table used, since no item code is committed to this repository.
  const fallbackCode = useMemo(() => {
    const map = {}
    if (!master) return map
    for (const r of rows) {
      if (r.codes.length || !r.matchKey || map[r.matchKey]) continue
      const hit = master.find((m) => m.d.toLowerCase().includes(r.matchKey))
      if (hit) map[r.matchKey] = hit.c
    }
    return map
  }, [master, rows])

  // Which element is the horizontal scroller depends on the breakpoint: the middle pane
  // on a desktop, the whole frame once the columns stop being frozen (see the narrow
  // block in gantt.css). Picked by asking which one actually overflows rather than by
  // re-testing the media query in JS, so the two can never disagree.
  const scrollerEl = () => {
    const f = frameRef.current
    const m = midRef.current
    if (f && f.scrollWidth > f.clientWidth + 1) return f
    return m
  }

  // Open the view on today rather than on the far left, which is where a 2025 pullout
  // would otherwise park it.
  useLayoutEffect(() => {
    const el = scrollerEl()
    if (!el) return
    const lead = el === frameRef.current ? (midRef.current?.offsetLeft || 0) : 0
    el.scrollLeft = Math.max(0, lead + nowX - el.clientWidth * 0.42)
  }, [unit]) // eslint-disable-line react-hooks/exhaustive-deps

  // Dragging the position line.
  //
  // The move/up handlers live on WINDOW for the duration of the gesture, not on the
  // chart. The first attempt put them on the scroll pane and released pointer capture
  // from there, and that is a genuine trap: capture had been taken by the grip, so
  // .gtt-mid calling releasePointerCapture for a pointer it never held does not end the
  // drag. `dragging` then stayed true after the mouse came up, and every later mouse
  // move over the chart dragged the line — the line wandered to a new date on its own.
  // A window-level pointerup cannot be missed, wherever the pointer ends up.
  const dateFromClientX = (clientX) => {
    const el = midRef.current
    if (!el) return cursor
    const box = el.getBoundingClientRect()
    return startOfDay(unscale(clientX - box.left + el.scrollLeft))
  }
  const onHandleDown = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(true)
  }
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
    // Losing the window mid-drag must also end it, or the line resumes following the
    // pointer when the user comes back.
    window.addEventListener('blur', stop)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      window.removeEventListener('blur', stop)
    }
  }, [dragging, t0, t1, totalW]) // eslint-disable-line react-hooks/exhaustive-deps

  // Clicking the chart moves the line there. Deliberately CLICK and not pointerdown:
  // a pointerdown on the canvas fires at the start of a sideways scroll gesture too, so
  // on a touch screen every attempt to scroll the timeline would fling the line to
  // wherever the finger landed. A click only completes when the pointer stays put.
  // Bars, the grip and the capacity window are excluded — each is a control in its own
  // right, and a bar has to keep its hover tooltip.
  const onCanvasClick = (e) => {
    if (e.target.closest?.('.gbar, .gtt-grip, .gtt-capwin')) return
    setCursor(dateFromClientX(e.clientX))
  }

  const jumpTo = (d) => {
    setCursor(startOfDay(d))
    const el = scrollerEl()
    if (!el) return
    const lead = el === frameRef.current ? (midRef.current?.offsetLeft || 0) : 0
    el.scrollLeft = Math.max(0, lead + scale(cursorEdge(d) - 1) - el.clientWidth / 2)
  }

  const heldPct = SAFEKEEPING_M2 > 0 ? (cap.heldM2 / SAFEKEEPING_M2) * 100 : 0
  const cursorIsNow = startOfDay(cursor).getTime() === startOfDay(TODAY).getTime()

  const capTitle = [
    'PROVISIONAL floor-space estimate.',
    '',
    `Occupied  ${cap.heldM2.toFixed(0)} m2 from ${num(cap.heldPositions)} pallet positions`,
    `Net move  ${cap.netUnits >= 0 ? '+' : ''}${num(cap.netUnits)} units = ${cap.netPositions >= 0 ? '+' : ''}${num(cap.netPositions)} positions = ${cap.netM2 >= 0 ? '+' : ''}${cap.netM2.toFixed(0)} m2`,
    `Received  ${num(cap.inUnits)}   Issued ${num(cap.outUnits)}  (to ${fmtDate(cursor)})`,
    '',
    `Rack arithmetic is from the warehouse drawing: a Type B bay is 3.3 m x 1.29 m over five`,
    `levels, and the plan's own rack pitch adds 2.53x for the aisle -> ${M2_PER_POSITION.toFixed(2)} m2 of floor per position.`,
    '',
    'What is ESTIMATED is how many units fit a pallet, because no source workbook records a',
    'pack size. Every figure above moves INVERSELY with these: double a pack size and',
    'that material claims half the floor:',
    ...cap.perRow.slice(0, 6).map((r) => `   ${r.name} — ${num(r.upp)}/pallet -> ${Math.round(Math.abs(r.pallets))} positions`),
    '',
    `Compared against the Safekeeping area's ${SAFEKEEPING_M2.toFixed(0)} m2 of floor (floor-plan geometry).`,
  ].join('\n')

  return (
    <div className="gtt-root">
      {/* ------------------------------------------------------------- controls */}
      <div className="gtt-bar">
        {/* A key for bars that are not on screen explains nothing — hidden when the
            timeline is empty, while the granularity control stays put so the bar keeps
            its height and the card does not jump when data arrives. */}
        <div className="gtt-legend" hidden={rows.length === 0}>
          <span className="gl"><i className="gl-sw gl-plan" style={{ '--c': S.incoming }} />Scheduled in</span>
          <span className="gl"><i className="gl-sw gl-act" style={{ '--c': S.incoming }} />Received</span>
          <span className="gl"><i className="gl-sw gl-act" style={{ '--c': S.outgoing }} />Issued out</span>
          <span className="gl"><i className="gl-sw gl-est" style={{ '--c': S.incoming }} />Estimate (bar spans the window)</span>
          <span className="gl gl-line"><i className="gl-now" />Today</span>
          <span className="gl gl-line"><i className="gl-cur" />Position line</span>
        </div>
        <div className="gtt-ctl">
          <button type="button" className={`btn-ghost btn-xs ${cursorIsNow ? 'is-on' : ''}`} onClick={() => jumpTo(TODAY)}>
            <Icon name="clock" size={12} /> Today
          </button>
          <button type="button" className="btn-ghost btn-xs" onClick={() => jumpTo(new Date(t1 - 1))}>
            <Icon name="arrowUp" size={12} className="rot90" /> End
          </button>
          <Toggle options={TIMELINE_UNITS} value={unit} onChange={onUnit} size="sm" className="gtt-unit" />
        </div>
      </div>

      {/* An empty timeline still draws a header, a cursor and a capacity window reading
          0 m2 — a confident statement about nothing. The two ways to get here need
          different words: no schedule loaded at all (signed out, or the hydration pass
          failed) versus a filter that matched none of it. */}
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
      <>
      {/* ------------------------------------------------------------- the chart */}
      <div className="gtt-frame" ref={frameRef}>
        {/* frozen left: identity and the three quantity columns */}
        <div className="gtt-pane gtt-left" style={{ gridTemplateRows: rowTemplate, paddingBottom: FOOT_H }}>
          <div className="gtt-head gtt-lrow">
            <span className="gc gc-code">Item Code</span>
            <span className="gc gc-desc">Material Description</span>
            <span className="gc gc-n gc-boh">BOH</span>
            <span className="gc gc-n">Incoming</span>
            <span className="gc gc-n">Outgoing</span>
          </div>
          {rows.map((r, i) => (
            <div key={r.key} className={`gtt-lrow ${selected === r.key ? 'is-sel' : ''}`}
              onMouseEnter={() => setSelected(r.key)} onMouseLeave={() => setSelected(null)}>
              <span className="gc gc-code mono" title={r.codes.length ? `Item codes: ${r.codes.join(', ')}` : 'Never booked into safekeeping — no item code on record. Shown from the item master by keyword.'}>
                {r.codes[0] || fallbackCode[r.matchKey] || <span className="faint">—</span>}
                {r.codes.length > 1 && <em className="gc-more">+{r.codes.length - 1}</em>}
              </span>
              <span className="gc gc-desc">
                <span className="gd-name" title={r.materialName}>{r.materialName}</span>
                {(r.brand || r.matDetail) && <span className="gd-sub">{[r.brand, r.matDetail].filter(Boolean).join(' · ')}</span>}
                <span className="gd-path" title={`${r.trade} · ${r.project}`}>{r.trade} · {r.project}</span>
              </span>
              <span className="gc gc-n gc-boh" title={r.bohAdjusted
                ? `Wound back to ${num(r.bohRaw)} from the sheet's closing stock, which is below zero — the source's own totals do not reconcile with its dated movements on this line. Shown as 0.`
                : `Stock before the first movement on this timeline. Wound back from the sheet's closing ${num(r.sheetSoh || 0)} by the ${num(r.recordedIn)} received and ${num(r.recordedOut)} issued since.`}>
                {num(r.boh)}{r.bohAdjusted && <em className="gc-flag">!</em>}
              </span>
              <span className="gc gc-n gc-in" title={`Every incoming bar on this row adds to ${num(r.totalIn)}${r.tbcIn ? ` — plus ${r.tbcIn} bar${r.tbcIn === 1 ? '' : 's'} whose quantity is still TBC` : ''}.`}>
                {num(r.totalIn)}{r.tbcIn > 0 && <em className="gc-tbc">+{r.tbcIn} TBC</em>}
              </span>
              <span className="gc gc-n gc-out" title={`Every outgoing bar on this row adds to ${num(r.totalOut)}.`}>
                {num(r.totalOut)}
              </span>
            </div>
          ))}
        </div>

        {/* scrolling middle: the timeline */}
        <div className="gtt-mid" ref={midRef}>
          <div className="gtt-canvas" style={{ width: totalW, paddingBottom: FOOT_H }} onClick={onCanvasClick}>
            <div className="gtt-pane gtt-tl" style={{ gridTemplateRows: rowTemplate }}>
              {/* header: coarse band over fine band */}
              <div className="gtt-head gtt-thead" style={{ paddingBottom: CURSOR_RAIL }}>
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
              </div>

              {/* one cell per row, holding both lanes */}
              {rows.map((r, i) => {
                const L = layouts[i]
                return (
                  <div key={r.key} className={`gtt-row ${selected === r.key ? 'is-sel' : ''}`}
                    onMouseEnter={() => setSelected(r.key)} onMouseLeave={() => setSelected(null)}>
                    {ticks.map((t, k) => <span key={t.key} className={`gtt-gl ${k % 2 ? 'alt' : ''}`} style={{ left: k * colWidth, width: colWidth }} />)}

                    {/* incoming lane — schedule on top, what actually arrived beneath */}
                    <div className="gtt-lane gtt-lane-in" style={{ height: L.inH }}>
                      {L.planned.items.map(({ bar: b, x, w, level, stretched, label, inside }, bi) => (
                        <span key={`p${bi}`} className={`gbar gbar-plan ${b.firm ? '' : 'gbar-est'} ${b.tbc ? 'gbar-tbc' : ''} ${stretched ? 'is-min' : ''} ${inside ? '' : 'gbar-out'}`}
                          style={{ left: x, width: w, top: barTop(level), '--c': S.incoming }} title={barTitle(b, r)}>
                          <em className="gb-n">{label}</em>
                        </span>
                      ))}
                      {L.actualIn.items.map(({ bar: b, x, w, level, stretched, label, inside }, bi) => (
                        <span key={`a${bi}`} className={`gbar gbar-act ${stretched ? 'is-min' : ''} ${inside ? '' : 'gbar-out'}`}
                          style={{ left: x, width: w, top: barTop(level, L.plannedLevels), '--c': S.incoming }} title={barTitle(b, r)}>
                          <em className="gb-n">{label}</em>
                        </span>
                      ))}
                      <span className="gtt-lane-tag">in</span>
                    </div>

                    {/* outgoing lane — recorded pullouts only; nothing schedules a release */}
                    <div className="gtt-lane gtt-lane-out" style={{ height: L.outH }}>
                      {L.actualOut.items.map(({ bar: b, x, w, level, stretched, label, inside }, bi) => (
                        <span key={`o${bi}`} className={`gbar gbar-act ${stretched ? 'is-min' : ''} ${inside ? '' : 'gbar-out'}`}
                          style={{ left: x, width: w, top: barTop(level), '--c': S.outgoing }} title={barTitle(b, r)}>
                          <em className="gb-n">{label}</em>
                        </span>
                      ))}
                      <span className="gtt-lane-tag">out</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* ------------------------------------------------- overlay: the two lines */}
            <div className="gtt-overlay">
              <span className="gtt-now" style={{ left: nowX }}>
                <em title={`Today — ${fmtDate(TODAY)}`}>Today</em>
              </span>
              <span className={`gtt-cursor ${dragging ? 'is-drag' : ''}`} style={{ left: cursorX }}>
                <button type="button" className="gtt-grip" style={{ top: HEAD_BANDS + 2 }} onPointerDown={onHandleDown} onKeyDown={onHandleKey}
                  aria-label={`Position line, ${fmtDate(cursor)}. Arrow keys to move.`}
                  title={`Stock position as of ${fmtDate(cursor)} — drag, or use the arrow keys`}>
                  <Icon name="transfer" size={11} />
                  <span className="gtt-grip-date">{fmtDate(cursor)}</span>
                </button>
              </span>

              {/* The capacity window travels with the line, in the strip below the
                  chart. Clamped to the canvas: centred on the line it would otherwise
                  hang half off the frame at either extreme. */}
              <div className="gtt-capwin" style={{ left: Math.min(Math.max(cursorX, CAPWIN_W / 2 + 4), totalW - CAPWIN_W / 2 - 4) }} title={capTitle}>
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

        {/* frozen right: the closing position at the line */}
        <div className="gtt-pane gtt-right" style={{ gridTemplateRows: rowTemplate, paddingBottom: FOOT_H }}>
          <div className="gtt-head gtt-rrow">
            <span className="gc gc-n gc-eoh-h">
              EOH
              <em>as of {fmtDate(cursor)}</em>
            </span>
          </div>
          {rows.map((r, i) => {
            const a = atCursor[i]
            const full = r.eoh
            return (
              <div key={r.key} className={`gtt-rrow ${selected === r.key ? 'is-sel' : ''}`}
                onMouseEnter={() => setSelected(r.key)} onMouseLeave={() => setSelected(null)}>
                <span className="gc gc-n gc-eoh" title={[
                  `EOH as of ${fmtDate(cursor)}`,
                  `  BOH        ${num(r.boh)}`,
                  `+ received   ${num(a.inQty)}`,
                  `- issued     ${num(a.outQty)}`,
                  `= ${num(a.eoh)}`,
                  '',
                  `With the whole schedule delivered: ${num(full)}.`,
                  r.tbcIn ? `${r.tbcIn} scheduled bar${r.tbcIn === 1 ? '' : 's'} carry no agreed quantity, so neither figure includes them.` : '',
                ].filter(Boolean).join('\n')}>
                  {num(a.eoh)}
                  {Math.round(a.eoh) !== Math.round(full) && <em className="gc-eoh-full">of {num(full)}</em>}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <p className="gtt-note">
        <Icon name="alert" size={12} />
        <span>
          <strong>No outbound schedule exists.</strong> Nothing in the warehouse system plans a release,
          so the <em>out</em> lane shows recorded pullouts only and is empty to the right of today.
          Bar quantities read <em>TBC</em> where the source has not agreed one; those bars are excluded from
          every total rather than counted as zero. Floor space is a provisional estimate — hover it for the
          arithmetic and the pack sizes it depends on.
        </span>
      </p>
      </>
      )}
    </div>
  )
}
