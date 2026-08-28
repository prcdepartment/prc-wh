import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Icon from '../../lib/icons'
import { KIND, STATUS } from '../../data/processFlow'

// An interactive node-and-edge diagram, drawn without a diagramming library.
//
// WHY NOT REACT FLOW OR MERMAID
// Both were considered. Either would have roughly doubled the download size of the
// whole application for one documentation page — and this app is deliberately lean
// (five runtime packages). The floor-plan module already draws a complex interactive
// plan by hand, so the house style was already established.
//
// WHY NODES ARE HTML AND ONLY THE EDGES ARE SVG
// SVG has no text wrapping: every label would need its own hand-rolled line breaker
// and would still not ellipsise, focus or read to a screen reader properly. So each
// node is a real <button> positioned absolutely, and the connectors are one SVG layer
// sitting behind them in the same coordinate space. That buys real text wrapping,
// keyboard navigation and browser find-in-page for free.
//
// WHY THE VIEWPORT SCROLLS RATHER THAN BEING PANNED BY CODE
// The canvas is sized to the scaled content inside a plain overflow:auto box, so
// panning is native scrolling — it works with a trackpad, a touch screen, the
// keyboard and a scrollbar without a line of custom code. Drag-to-pan is added on
// top for the mouse, by nudging scrollLeft/scrollTop.

// A node is always this size. It does NOT rotate with the orientation: a box 78px
// wide and 208px tall would hold about four characters per line.
const NODE_W = 208
const NODE_H = 78
const H_GAP = 78 // between columns, reading across
const V_GAP = 44 // between rows, reading down — a stacked flow needs less air
const NODE_GAP = 14 // between nodes inside one stage
const PAD = 16
const HEAD = 26 // stage title band, reading across
const GUTTER = 104 // stage title column, reading down

const ZOOMS = [0.5, 0.65, 0.8, 0.9, 1, 1.15, 1.35, 1.6]
// Never shrink past this to make something fit. Fitting is only worth doing while the
// result stays readable: on a 375px phone the fit maths asked for 68%, which renders a
// 12px label at eight pixels, and the ERD asked for 42%. Below this floor the viewport
// scrolls instead — the same trade the inventory masterlist already makes on a phone.
// Exported so the ERD uses the identical floor rather than a second guess at it.
export const MIN_FIT = 0.85

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

// Lay the stages out into absolute positions. Kept as a pure function of the flow
// and the orientation so the layout is deterministic — the same flow always draws
// identically, which is what makes a screenshot of it worth anything.
function layout(stages, vertical) {
  // Two axes, named by role rather than by x/y, so the two orientations are one
  // piece of arithmetic instead of two that can drift apart.
  //   main  — the direction stages advance
  //   cross — the direction nodes inside one stage spread
  const nodeDepth = vertical ? NODE_H : NODE_W // extent along main
  const nodeSpan = vertical ? NODE_W : NODE_H // extent along cross
  const gap = vertical ? V_GAP : H_GAP

  // WHERE THE STAGE TITLES GO, and why it matters.
  // Reading across they form a band along the top, above the columns — fine.
  // Reading down, the first version put each title in the gap ABOVE its row, which
  // is exactly where the connector between two boxes runs: every arrow was drawn
  // straight through a line of text. They now sit in a left-hand gutter, aligned
  // with their own row, so the boxes form one clean column with nothing crossing it
  // and the whole thing reads as a timeline.
  const stageStep = nodeDepth + gap
  const mainOrigin = PAD
  const crossOrigin = PAD + (vertical ? GUTTER : HEAD)

  const spanOf = (n) => n * nodeSpan + Math.max(0, n - 1) * NODE_GAP
  const widest = Math.max(1, ...stages.map((s) => s.nodes.length))
  const span = spanOf(widest)

  const nodes = []
  const stageBoxes = []

  stages.forEach((stage, si) => {
    const main = mainOrigin + si * stageStep
    const cross = crossOrigin + (span - spanOf(stage.nodes.length)) / 2

    stage.nodes.forEach((node, ni) => {
      const c = cross + ni * (nodeSpan + NODE_GAP)
      nodes.push({
        ...node,
        stageId: stage.id,
        stageTitle: stage.title,
        x: vertical ? c : main,
        y: vertical ? main : c,
        w: NODE_W,
        h: NODE_H,
      })
    })

    stageBoxes.push({
      id: stage.id,
      title: stage.title,
      // Vertical: the gutter beside the row, the full height of the box so the title
      // can centre against it. Horizontal: the band above the column.
      x: vertical ? PAD : main,
      y: vertical ? main : PAD,
      w: vertical ? GUTTER - 12 : NODE_W,
      h: vertical ? nodeDepth : HEAD,
      vertical,
    })
  })

  const mainTotal = mainOrigin + (stages.length - 1) * stageStep + nodeDepth + PAD
  const crossTotal = crossOrigin + span + PAD
  return {
    nodes,
    stages: stageBoxes,
    width: vertical ? crossTotal : mainTotal,
    height: vertical ? mainTotal : crossTotal,
  }
}

// ONE arrow per stage transition, drawn between the stages themselves rather than
// between their boxes.
//
// WHY, because this was the second arrow bug and it is the more interesting one.
// Connecting every box to every box in the next stage looked reasonable and produced
// a mess: a two-box stage followed by another two-box stage gives four arrows in an
// X, and the Warehouse process reached eighteen arrows for eleven boxes.
//
// The deeper problem was semantic. The boxes inside one stage are not steps that
// follow one another — they are the aspects of that stage ("Receiving" holds the
// warehouse receipt AND the safekeeping receipt). Drawing arrows between them claimed
// an order that does not exist. The STAGES are sequential; their contents are not. So
// the arrow now joins stage to stage, one per transition, and says only what is true.
function stageEdges(stages, nodesByStage) {
  const out = []
  for (let i = 0; i < stages.length - 1; i++) {
    const from = nodesByStage[stages[i].id]
    const to = nodesByStage[stages[i + 1].id]
    if (!from?.length || !to?.length) continue
    out.push({ from, to })
  }
  return out
}

// The face of a stage that an arrow leaves from or arrives at: the centre of the
// group's extent on the cross axis, at the group's leading or trailing edge.
function stageFace(group, vertical, trailing) {
  const xs = group.map((n) => n.x)
  const ys = group.map((n) => n.y)
  if (vertical) {
    const left = Math.min(...xs)
    const right = Math.max(...xs) + NODE_W
    return { x: (left + right) / 2, y: trailing ? Math.max(...ys) + NODE_H : Math.min(...ys) }
  }
  const top = Math.min(...ys)
  const bottom = Math.max(...ys) + NODE_H
  return { x: trailing ? Math.max(...xs) + NODE_W : Math.min(...xs), y: (top + bottom) / 2 }
}

// A STRAIGHT line whenever the two boxes are aligned, which after the journey was
// made sequential is almost always. The first version curved every connector, and a
// bezier between two boxes that sit directly under one another bulges for no reason
// and reads as though it is going somewhere. Only a genuine sideways step — a stage
// with two boxes feeding one — gets a curve.
// Straight whenever the two faces line up, which after the change above is always
// for a single-column flow and almost always otherwise. The first version curved
// every connector, and a bezier between two boxes sitting directly under one another
// bulges for no reason and reads as though it is going somewhere.
function edgePath(a, b, vertical) {
  const ALIGNED = 2 // px of drift still treated as a straight run
  if (vertical) {
    if (Math.abs(b.x - a.x) <= ALIGNED) return `M ${a.x} ${a.y} L ${a.x} ${b.y}`
    const c = Math.max(18, (b.y - a.y) * 0.45)
    return `M ${a.x} ${a.y} C ${a.x} ${a.y + c}, ${b.x} ${b.y - c}, ${b.x} ${b.y}`
  }
  if (Math.abs(b.y - a.y) <= ALIGNED) return `M ${a.x} ${a.y} L ${b.x} ${a.y}`
  const c = Math.max(18, (b.x - a.x) * 0.45)
  return `M ${a.x} ${a.y} C ${a.x + c} ${a.y}, ${b.x - c} ${b.y}, ${b.x} ${b.y}`
}

export default function FlowDiagram({
  stages,
  // Reading DOWN is the default, and that is a considered choice rather than a
  // preference. These flows are long and narrow — the journey is seventeen stages of
  // at most two boxes each. Laid across, it is 4,900px wide and has to shrink to
  // roughly 40% to fit the column, which makes every label unreadable. Laid down, it
  // is under 500px wide at full size and scrolls vertically, which is the direction a
  // page scrolls anyway.
  vertical = true,
  activeStatuses = null, // Set of status keys to emphasise; null = all
  query = '',
  selectedId = null,
  onSelect,
  onToggleOrient,
  maxHeight = 620,
}) {
  const viewRef = useRef(null)
  const viewWidth = useElementWidth(viewRef)
  const [zoomIdx, setZoomIdx] = useState(4) // index of 1.0
  const [autoFit, setAutoFit] = useState(true)

  const model = useMemo(() => layout(stages, vertical), [stages, vertical])
  // Laid-out nodes grouped by their stage, which is what the stage-to-stage arrows
  // measure their endpoints from.
  const nodesByStage = useMemo(() => {
    const map = {}
    model.nodes.forEach((n) => { (map[n.stageId] ||= []).push(n) })
    return map
  }, [model])
  const edges = useMemo(() => stageEdges(stages, nodesByStage), [stages, nodesByStage])

  // Fit-to-width only ever scales DOWN. Stretching a small diagram to fill a wide
  // screen makes the boxes bigger than the cards around them and looks broken.
  const fitScale = viewWidth > 0 ? Math.min(1, (viewWidth - 4) / model.width) : 1
  const scale = autoFit ? Math.max(MIN_FIT, fitScale) : ZOOMS[zoomIdx]

  // The viewport takes the height the content actually needs, up to the cap. A fixed
  // height left a short flow floating in dead space and gave a long one no more room
  // than it did the short one.
  const vpHeight = Math.min(maxHeight, Math.ceil(model.height * scale) + 2)

  const setZoom = useCallback((dir) => {
    setAutoFit(false)
    setZoomIdx((i) => Math.min(ZOOMS.length - 1, Math.max(0, i + dir)))
  }, [])

  // Drag-to-pan. Native scrolling already covers trackpad, touch and keyboard, so
  // this exists purely so a mouse user can grab the canvas.
  const drag = useRef(null)
  const onPointerDown = (e) => {
    // Never swallow a click that was aimed at a node.
    if (e.target.closest('.pf-node')) return
    const vp = viewRef.current
    if (!vp) return
    drag.current = { x: e.clientX, y: e.clientY, left: vp.scrollLeft, top: vp.scrollTop }
    vp.classList.add('dragging')
  }
  const onPointerMove = (e) => {
    const d = drag.current
    const vp = viewRef.current
    if (!d || !vp) return
    vp.scrollLeft = d.left - (e.clientX - d.x)
    vp.scrollTop = d.top - (e.clientY - d.y)
  }
  const endDrag = () => {
    drag.current = null
    viewRef.current?.classList.remove('dragging')
  }
  useEffect(() => {
    window.addEventListener('pointerup', endDrag)
    return () => window.removeEventListener('pointerup', endDrag)
  }, [])

  const q = query.trim().toLowerCase()
  const matches = (n) =>
    q.length > 1 && ((n.label || '').toLowerCase().includes(q) || (n.detail || '').toLowerCase().includes(q))

  // A status filter DIMS rather than removes. Dropping the boxes would leave arrows
  // pointing at nothing and would suggest the process itself is shorter than it is —
  // the shape of the whole chain is exactly what the reader came for.
  const dimmed = (n) => activeStatuses && !activeStatuses.has(n.status)

  return (
    <div className="pf-diagram">
      <div className="pf-diagram-bar">
        <div className="pf-zoom">
          <button className="icon-btn sm" onClick={() => setZoom(-1)} title="Zoom out" aria-label="Zoom out">
            <Icon name="minus" size={15} />
          </button>
          <span className="pf-zoom-val">{Math.round(scale * 100)}%</span>
          <button className="icon-btn sm" onClick={() => setZoom(1)} title="Zoom in" aria-label="Zoom in">
            <Icon name="plus" size={15} />
          </button>
          <button
            className={`btn btn-sm ${autoFit ? 'btn-primary' : ''}`}
            onClick={() => setAutoFit((f) => !f)}
            title="Scale the diagram to fit the card"
          >
            Fit
          </button>
        </div>
        {/* The orientation button is labelled with what pressing it GIVES you, not
            with the state you are already in — a toggle that names its current state
            reads as a claim about what will happen next. */}
        {onToggleOrient && (
          <button
            className="btn btn-sm"
            onClick={onToggleOrient}
            title={vertical ? 'Lay the diagram out across' : 'Lay the diagram out down'}
          >
            <Icon name={vertical ? 'chevronRight' : 'arrowDown'} size={14} />
            <span className="pf-hide-sm">{vertical ? 'Across' : 'Down'}</span>
          </button>
        )}
      </div>

      <div
        className="pf-viewport"
        ref={viewRef}
        style={{ height: vpHeight }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
      >
        <div className="pf-canvas" style={{ width: model.width * scale, height: model.height * scale }}>
          <div
            className="pf-canvas-inner"
            style={{ width: model.width, height: model.height, transform: `scale(${scale})` }}
          >
            <svg className="pf-edges" width={model.width} height={model.height} aria-hidden="true">
              <defs>
                <marker id="pf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 1 L 9 5 L 0 9 z" className="pf-arrow-head" />
                </marker>
              </defs>
              {edges.map((e, i) => {
                const a = stageFace(e.from, vertical, true)
                const b = stageFace(e.to, vertical, false)
                // An arrow is only as certain as the ground at either end: one that
                // leads into an unbuilt step must not be drawn as a solid, working
                // connection.
                const weak = [...e.from, ...e.to].some((n) => n.status !== 'live')
                const allDim = [...e.from, ...e.to].every(dimmed)
                return (
                  <path
                    key={i}
                    d={edgePath(a, b, vertical)}
                    className={`pf-edge ${weak ? 'weak' : ''} ${allDim ? 'dim' : ''}`}
                    markerEnd="url(#pf-arrow)"
                  />
                )
              })}
            </svg>

            {model.stages.map((s) => (
              <div
                key={s.id}
                className={`pf-stage-label ${s.vertical ? 'v' : ''}`}
                style={{ left: s.x, top: s.y, width: s.w, height: s.h }}
              >
                {s.title}
              </div>
            ))}

            {model.nodes.map((n) => {
              const st = STATUS[n.status] || STATUS.planned
              const kind = KIND[n.kind] || KIND.logic
              return (
                <button
                  type="button"
                  key={n.id}
                  className={
                    'pf-node' +
                    ` st-${n.status}` +
                    (selectedId === n.id ? ' selected' : '') +
                    (matches(n) ? ' hit' : '') +
                    (dimmed(n) ? ' dim' : '')
                  }
                  style={{ left: n.x, top: n.y, width: n.w, height: n.h }}
                  onClick={() => onSelect && onSelect(n)}
                  title={`${n.label} — ${st.label}`}
                  aria-pressed={selectedId === n.id}
                >
                  <span className="pf-node-top">
                    <span className="pf-node-kind">
                      <Icon name={kind.icon} size={13} />
                    </span>
                    <span className={`pf-dot tone-${st.tone}`} aria-hidden="true" />
                    <span className="pf-node-status">{st.short}</span>
                  </span>
                  <span className="pf-node-label">{n.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
