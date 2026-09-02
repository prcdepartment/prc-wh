// ============================================================================
// Central Warehouse Taytay — three-level facility map.
//
// GEOMETRY PROVENANCE. Every shape below is traced from
//   sample/EPC. FIN. WM. CW Taytay Warehouse Plan.pptx  (gitignored — it is a real
//   company drawing and this repository is public).
//
//   · SITE level      — slide 4, "SITE DEVELOPMENT PLAN". Coordinates are the raw
//                       PowerPoint shape offsets in SLIDE INCHES, converted below.
//                       The property boundary is the slide's own freeform path.
//   · WAREHOUSE level — slide 9, "WAREHOUSE PLAN – TOP VIEW". Coordinates are pixel
//                       positions in the underlying CAD raster (628 x 924, portrait),
//                       measured by scanning the drawing for its magenta wall lines
//                       and grey rack frames. The deck presents that plan rotated 90°
//                       clockwise, and so do we — see `pl()`.
//   · RACKING level   — slides 10-15. Bay counts are the numbers printed at each rack
//                       run's ends (13 on Rack 1, 10 on every other). Level heights,
//                       bay loads and frame sizes are from slide 15, "RACKING SYSTEM –
//                       FRONT VIEW".
//
// Keeping the raw drawing coordinates here (rather than pre-converted numbers) means
// anyone can re-open the reference and check a shape against its source.
// ============================================================================

import { items } from './insights'

/* ---------------------------------------------------------------- site level */

// Property boundary bounding box, in slide inches, from the slide-4 freeform path.
const SX = 3.535
const SY = 1.292
const SW = 6.271
const SHT = 4.402

export const SITE_VB = { w: 1000, h: Math.round((SHT / SW) * 1000) } // 1000 x 702

// Slide inches -> site viewBox. BOTH axes divide by SW so the drawing keeps its
// aspect ratio; dividing y by SHT instead would quietly stretch the site north-south.
const k = SITE_VB.w / SW
const sp = (x, y) => [(x - SX) * k, (y - SY) * k]
const sr = (x, y, w, h) => ({ x: (x - SX) * k, y: (y - SY) * k, w: w * k, h: h * k })

export const SITE_BOUNDARY = [
  [3.535, 2.966], [6.333, 1.354], [6.59, 1.292], [9.792, 1.299],
  [9.796, 2.699], [9.801, 4.1], [9.806, 5.5], [3.695, 5.694],
].map(([x, y]) => sp(x, y))

// The deck draws the shed as three rectangles — the main box plus two ground-floor
// wings either side of the loading recess. Overlapping fills leave seams where the
// boxes meet, so the three are traced once as a single outline instead. The recess is
// the notch at the bottom; a plain rectangle would swallow it.
export const SITE_BUILDING = [
  [6.597, 1.407], [9.681, 1.407], [9.681, 4.707], [8.329, 4.707],
  [8.329, 4.063], [7.443, 4.063], [7.443, 4.707], [6.597, 4.707],
].map(([x, y]) => sp(x, y))

// Same treatment for the tiles bay: wide at the top, narrower below, one outline.
export const SITE_TILES = [
  [5.183, 3.847], [6.522, 3.847], [6.522, 4.683], [6.244, 4.683],
  [6.244, 5.134], [5.183, 5.134],
].map(([x, y]) => sp(x, y))

const bbox = (pts) => {
  const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1])
  const x = Math.min(...xs); const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

// Areas that hold material, and are therefore clickable.
export const SITE_AREAS = [
  {
    id: 'warehouse',
    name: 'Central Warehouse',
    role: 'building',
    icon: 'warehouse',
    drill: true,
    note: '2,520 m² enclosed shed. Five material areas inside — open it to go to the warehouse plan.',
    poly: SITE_BUILDING,
    label: sr(6.597, 1.407, 3.084, 2.656),
  },
  {
    id: 'rebar',
    name: 'Deformed Rebar Area',
    role: 'rebar',
    icon: 'rebar',
    note: 'Open stockyard bay for reinforcing steel, kept outside the shed and reachable by truck.',
    rects: [sr(3.9675, 3.8635, 0.774, 1.291)],
  },
  {
    id: 'tiles',
    name: 'Tiles Area',
    role: 'tiles',
    icon: 'copy',
    note: 'Covered tile stacking area on the open stockyard, beside the warehouse entrance road.',
    poly: SITE_TILES,
    label: sr(5.183, 3.847, 1.339, 0.836),
  },
  {
    id: 'mrf',
    name: 'Material Recovery Facility',
    role: 'mrf',
    icon: 'reorganize',
    note:
      'Segregation and recovery yard at the north-west corner of the site. Damaged stock is flagged where it lies ' +
      'rather than physically moved, so this lists every line carrying a damaged quantity — the units awaiting ' +
      'disposition, not lines that have left their rack.',
    rotRect: { cx: 5.1565, cy: 2.462, w: 1.003, h: 0.566, rot: -28.29 },
  },
]
SITE_AREAS.forEach((a) => {
  a.rects = a.rects || []
  // Every non-rotated area needs a box to centre its label in: the outline's bounds
  // where there is one, otherwise its single rectangle.
  if (!a.label) a.label = a.poly ? bbox(a.poly) : a.rects[0]
})

// The one piece of context the site plan still draws: the open yard the deformed-bar
// and tile bays sit inside. Everything else the deck marks up — car park, truck
// parking, queue bay, canopies, gate, guard posts, the ingress/egress arrows — is
// vehicle logistics, not storage, and only competed with the areas that are.
export const SITE_YARD = { id: 'yard', name: 'Open Stock Yard', rect: sr(3.9, 3.42, 2.7, 1.86) }

/* ----------------------------------------------------------- warehouse level */

// The CAD raster behind slide 9 is 628 x 924 and portrait. The deck presents it
// rotated 90° clockwise; we keep the PORTRAIT orientation instead, because that is the
// one that lines up with the site plan — on both drawings the rack runs stand vertical,
// the entrance canopy is on the west wall about three-quarters of the way down, and the
// loading recess is bottom-centre. Turning the warehouse to match the deck's landscape
// presentation would put it 90° out from the shed the user just clicked.
//
// `pl` is therefore an identity map from raster pixels to viewBox units, and every
// measurement below stays in the coordinates it was taken in.
export const WH_VB = { w: 628, h: 924 }
const pl = (ix0, iy0, ix1, iy1) => ({ x: ix0, y: iy0, w: ix1 - ix0, h: iy1 - iy0 })
// Rectilinear outline from raster pixels, for the areas drawn as several boxes.
const pp = (pts) => pts.map(([x, y]) => [x, y])

// 1 px of the CAD raster is ~76 mm: the drawing's own "3950 R-R" clear aisle measures
// 52 px between rack runs. Used only for the dimension read-outs, never for stock.
export const WH_MM_PER_PX = 76

export const WH_BUILDING = pl(38, 25, 607, 842)
export const WH_CANOPY = pl(38, 842, 607, 878)

// Racks. `px` is the run's portrait-x extent (its depth on the plan); `span` is the
// portrait-y extent (its length). Rack 1 stands alone against the west wall and is
// three bays longer than the rest; runs 2-6 are back-to-back pairs, which is how the
// eleven racks the deck names fit into six runs on the drawing.
export const RACKS = [
  { id: 'R1', n: 1, area: 'mepfs', bays: 13, levels: 5, type: 'A', px: [54, 71], span: [31, 480], single: true },
  { id: 'R2', n: 2, area: 'mepfs', bays: 10, levels: 5, type: 'B', px: [122, 139], span: [31, 376] },
  { id: 'R3', n: 3, area: 'mepfs', bays: 10, levels: 5, type: 'B', px: [139, 156], span: [31, 376] },
  { id: 'R4', n: 4, area: 'structural', bays: 10, levels: 5, type: 'B', px: [208, 225], span: [31, 376] },
  { id: 'R5', n: 5, area: 'architectural', bays: 10, levels: 5, type: 'B', px: [225, 242], span: [31, 376] },
  { id: 'R6', n: 6, area: 'safekeeping', bays: 10, levels: 5, type: 'B', px: [294, 311], span: [31, 376] },
  { id: 'R7', n: 7, area: 'safekeeping', bays: 10, levels: 5, type: 'B', px: [311, 328], span: [31, 376] },
  { id: 'R8', n: 8, area: 'safekeeping', bays: 10, levels: 5, type: 'B', px: [380, 397], span: [31, 376] },
  { id: 'R9', n: 9, area: 'safekeeping', bays: 10, levels: 5, type: 'B', px: [397, 414], span: [31, 376] },
  { id: 'R10', n: 10, area: 'safekeeping', bays: 10, levels: 5, type: 'B', px: [465, 482], span: [31, 376] },
  { id: 'R11', n: 11, area: 'safekeeping', bays: 10, levels: 5, type: 'B', px: [482, 499], span: [31, 376] },
]
RACKS.forEach((r) => {
  r.name = `Rack ${r.n}`
  r.rect = pl(r.px[0], r.span[0], r.px[1], r.span[1])
  r.positions = r.bays * r.levels
})

// The High-Value room's own racking: EIGHT lines of four bays and four shelf levels,
// laid out the way the rest of the shed is — a single line against each end wall and
// three back-to-back pairs between them, so five physical runs. Each line is its own
// rack and is clickable, exactly like Racks 1-11.
//
// The room is ix 91..210 (119 wide) x iy 581..756. Lines are 8 units deep, so
// 2 singles + 3 pairs = 64 units of shelving; the remaining width is shared equally
// between the four aisles.
const HV_ROOM = { x0: 91, y0: 581, x1: 210, y1: 756 }
const HV_PAD = 8
const HV_DEPTH = 8
const HV_GROUPS = [1, 2, 2, 2, 1] // lines per physical run, end to end
export const HV_RACKS = (() => {
  const usable = HV_ROOM.x1 - HV_ROOM.x0 - HV_PAD * 2
  const shelved = HV_GROUPS.reduce((a, g) => a + g * HV_DEPTH, 0)
  const aisle = (usable - shelved) / (HV_GROUPS.length - 1)
  const out = []
  let x = HV_ROOM.x0 + HV_PAD
  let n = 0
  for (const g of HV_GROUPS) {
    for (let i = 0; i < g; i++) {
      n += 1
      out.push({
        id: `HV${n}`, n: `H${n}`, area: 'highvalue', kind: 'shelving',
        bays: 4, levels: 4,
        px: [x, x + HV_DEPTH], span: [HV_ROOM.y0 + 10, HV_ROOM.y1 - 10],
      })
      x += HV_DEPTH
    }
    x += aisle
  }
  return out
})()
HV_RACKS.forEach((r) => {
  r.name = `HV Line ${r.n.slice(1)}`
  r.rect = pl(r.px[0], r.span[0], r.px[1], r.span[1])
  r.positions = r.bays * r.levels
})
// One list from here on: every downstream helper — placement, capacity, occupancy, the
// area's jump buttons — treats a shelving line exactly like a pallet rack.
RACKS.push(...HV_RACKS)

// Two non-pallet storage forms inside the Safekeeping area, both named on slide 13.
export const CANTILEVER = {
  id: 'CANT', name: 'Cantilever', area: 'safekeeping', kind: 'cantilever',
  arms: 3, bayCentre: 900, armLength: 1000, armLoad: 300, upright: 3000,
  // The run does NOT reach the back wall: scanning the raster for its arm ticks puts
  // the comb between iy 32 and iy 550, stopping at the green line the drawing marks
  // there. 518 px at ~76 mm/px is 39.4 m, which at 900 mm bay centres is 42 bays.
  bays: 42, levels: 3,
  rect: pl(571, 32, 594, 550),
}
CANTILEVER.positions = CANTILEVER.bays * CANTILEVER.arms

// Block-stacked floor storage inside the Safekeeping zone. The drawing's own
// "OPEN FLAT AREA A = 262.84 m²" label sits in the middle of this block, at the
// bottom-right of the yellow highlight — right of the loading bay, below the racks,
// with the cantilever run ending just above it.
export const FLOOR_AREA = {
  id: 'FLOOR', name: 'Open Flat Area', area: 'safekeeping', kind: 'floor',
  rect: pl(410, 565, 604, 838),
}

// The High-Value / Fixed Assets room is fitted out with LS600 boltless shelving:
// four runs of four bays, four shelf levels each (slide 15's LS600 elevation).
export const HV_SHELVING = {
  id: 'HV', name: 'LS600 Shelving', area: 'highvalue', kind: 'shelving',
  // Eight rack lines of four bays, four shelf levels each.
  runs: 8, bays: 4, levels: 4, bayWidth: 1200, frameHeight: 2100,
}
HV_SHELVING.positions = HV_SHELVING.runs * HV_SHELVING.bays * HV_SHELVING.levels

// Material areas inside the shed. `hull` is the outline the deck highlights; the
// racks listed in `racks` are drawn individually on top of it.
export const WH_AREAS = [
  {
    id: 'mepfs', icon: 'settings', name: 'MEPFS Materials', short: 'MEPFS', role: 'mepfs',
    trades: ['Mechanical', 'Electrical and Auxiliary', 'Plumbing', 'Fire Protection'],
    hull: [pl(46, 28, 164, 490)],
    note: 'Mechanical, electrical, plumbing, fire-protection and auxiliary stock. Racks 1–3.',
  },
  {
    id: 'structural', icon: 'excess', name: 'Structural Materials', short: 'Structural', role: 'structural',
    trades: ['Structural'],
    hull: [pl(206, 28, 227, 380)],
    note: 'Rebar accessories, formwork, concrete and structural steel. Rack 4.',
  },
  {
    id: 'architectural', icon: 'grade', name: 'Architectural Materials', short: 'Architectural', role: 'architectural',
    trades: ['Architectural'],
    hull: [pl(223, 28, 244, 380)],
    note: 'Masonry, ceiling, doors, metals, paint and finishes. Rack 5.',
  },
  {
    id: 'safekeeping', icon: 'vault', name: 'Safekeeping Materials', short: 'Safekeeping', role: 'safekeeping',
    trades: ['General Hardware', 'Site', 'Allied Services'],
    // Racks 6-11 plus the floor and cantilever beside them: one L-shaped outline
    // rather than two overlapping boxes, which left a seam down the middle.
    hull: [pl(288, 28, 600, 830)],
    // Re-measured off slide 13's yellow highlight, mapped back into raster pixels.
    poly: pp([[288, 26], [604, 26], [604, 838], [406, 838], [406, 471], [288, 471]]),
    note: 'General requirements and project-held goods. Racks 6–11, plus the cantilever run and the open floor area.',
  },
  {
    id: 'highvalue', icon: 'lock', name: 'High Value Materials / Fixed Assets', short: 'High Value', role: 'highvalue',
    trades: [],
    hull: [pl(91, 581, 210, 756)],
    secure: true,
    note: 'Locked room off the security check. LS600 shelving, four runs of four bays.',
  },
]

// Rooms and working areas. Not material storage, so not clickable, but the plan shows
// them and the map is unreadable without them.
export const WH_ROOMS = [
  { id: 'office', name: 'Warehouse Office', rect: pl(39, 781, 148, 841) },
  { id: 'reception', name: 'Security Reception', rect: pl(148, 781, 198, 841) },
  // Rooms on the west wall start at ix 39, the inside face of that wall (the raster
  // measurement drifted a few pixels into the wall itself on two of them).
  { id: 'pantry', name: 'Pantry', rect: pl(39, 727, 80, 760) },
  // Stop at ix 90 so neither clips the high-value room, whose west wall is ix 91.
  { id: 'ee', name: 'EE Cabinet', rect: pl(39, 644, 90, 678) },
  { id: 'check', name: 'Security Check', rect: pl(39, 592, 90, 644) },
  { id: 'sorting', name: 'Sorting Bay', rect: pl(214, 592, 404, 700), accent: true },
  // Bottom edge pinned to the building's own bottom wall (iy 842) rather than the
  // raster's 845, so the bay sits flush inside the envelope.
  { id: 'loading', name: 'Loading & Unloading Bay', rect: pl(218, 730, 352, 842), accent: true },
]

// The circulation floor below the racks — the drawing's 628.63 m² open flat area. It
// stops where the Safekeeping highlight begins so no unclickable region sits under a
// clickable one, and it carries no label of its own: the clickable Open Flat Area
// inside Safekeeping is the one that holds stock and gets the name.
export const WH_OPEN = {
  id: 'open',
  poly: pp([[38, 382], [288, 382], [288, 471], [406, 471], [406, 575], [38, 575]]),
}

export const AREA_BY_ID = Object.fromEntries(WH_AREAS.map((a) => [a.id, a]))

/* ------------------------------------------------------------- floor areas */

// Shoelace, in whatever units the points are given in.
const polyArea = (ring) => Math.abs(ring.reduce((s, [x, y], i) => {
  const [x2, y2] = ring[(i + 1) % ring.length]
  return s + (x * y2 - x2 * y)
}, 0)) / 2

// The site drawing states the shed at 2,520 m², so that one figure fixes the scale for
// every other area on the site plan — no second measurement, no assumed dpi.
const SITE_M2_PER_UNIT = 2520 / polyArea(SITE_BUILDING)

export function siteAreaM2(a) {
  const units = a.poly
    ? polyArea(a.poly)
    : a.rotRect
      ? (a.rotRect.w * k) * (a.rotRect.h * k)
      : a.rects.reduce((s, r) => s + r.w * r.h, 0)
  return units * SITE_M2_PER_UNIT
}

// Inside the shed the scale comes from the raster: 1 px is ~76 mm, derived from the
// drawing's own 3950 mm clear aisle measuring 52 px between rack runs.
const WH_M2_PER_PX = (WH_MM_PER_PX / 1000) ** 2

export function whAreaM2(a) {
  const px = a.poly ? polyArea(a.poly) : a.hull.reduce((s, r) => s + r.w * r.h, 0)
  return px * WH_M2_PER_PX
}

/* ------------------------------------------------------------- racking level */

// Slide 15, INTERLOCK 600 selective pallet racking. Level 1 is a floor position; the
// four above it sit on beams at these heights. Frame height 5000 mm.
export const BEAM_HEIGHTS = [0, 1095, 2295, 3545, 4795]
export const FRAME_HEIGHT = 5000
export const RACK_TYPES = {
  A: { label: 'Type A', bayCentre: 2300, bayLoad: 1200 },
  B: { label: 'Type B', bayCentre: 3300, bayLoad: 1500 },
}
export const LS600_LEVELS = [167, 717, 1267, 1817]

/* ----------------------------------------------------------------- placement */

// -------------------------------------------------------------------------
// HOW A MATERIAL LINE GETS A LOCATION
//
// RECORDED FIRST, MODELLED ONLY WHERE THERE IS NO RECORD.
//
// Until the 2026-09-02 snapshot no source sheet said where anything physically sat, so
// every line was placed by rule. That snapshot's "Item per location bin" sheet gives
// 754 of the 827 warehouse lines an actual address — area, rack, beam level, bay — in
// the same vocabulary this map was drawn from, so those lines are now READ, not
// guessed, and `inventory.location` carries the address as the warehouse wrote it.
//
// A line with a recorded address goes exactly where the warehouse put it, even when
// that disagrees with what the rule below would have chosen: the warehouse is right
// about its own building. The rule survives for the lines with no record:
//
//   1. Item group first, where the plan puts that group OUTSIDE the shed —
//      rebar to the Deformed Rebar bay, tiles to the Tiles Area.
//   2. Then value — the top lines by stock value go to the locked High-Value room,
//      which is the same `isHighValue` set the rest of the app already uses.
//   3. Then trade — the four material areas inside the shed are trade areas, so a
//      line's Trade decides which one it belongs to.
//   4. Inside an area, lines are ordered by issue frequency and laid into the rack
//      positions still free after the recorded lines have taken theirs, from ground
//      level upward, so fast-moving stock sits at pick height.
//
// Steps 1-3 are a real reading of the plan. Step 4 is a MODEL. `locationOf()` reports
// which of the two a given line got, so a screen can say so per line instead of
// disclaiming the whole map.
// -------------------------------------------------------------------------

// The sheet's area names, mapped onto this map's own ids. The sheet numbers racks
// WITHIN an area (STRUC-R1 is the structural area's only run); this map numbers them
// across the whole shed (that same run is R4). Hence the per-area rack tables.
const RECORDED_AREAS = {
  MEPF: { area: 'mepfs', racks: { R1: 'R1', R2: 'R2', R3: 'R3' } },
  STRUC: { area: 'structural', racks: { R1: 'R4' } },
  ARCHI: { area: 'architectural', racks: { R1: 'R5' } },
  // The high-value room's eight shelving lines are HV1..HV8 here; the sheet reaches R3.
  'HIGH VALUE': { area: 'highvalue', racks: { R1: 'HV1', R2: 'HV2', R3: 'HV3' }, kind: 'shelving' },
  // Areas the sheet names without a rack address.
  CAGE: { area: 'highvalue' },
  'TILES AREA': { site: 'tiles' },
  // The plan draws the open stock yard as context, not as a clickable area with
  // capacity, so a line recorded only as "YARD" has nowhere to land and falls through
  // to the rule below rather than being dropped off the map.
  YARD: null,
}

/**
 * Decode `inventory.location` into a place on this map.
 * Returns null when the line has no record, or its record names somewhere this map
 * does not draw — in both cases the caller falls back to the rule.
 */
export function recordedPlacement(it) {
  const raw = it?.location
  if (!raw) return null
  const [areaKey, rack, level, bay] = String(raw).split('-')
  const spec = RECORDED_AREAS[areaKey?.toUpperCase()]
  if (!spec) return null
  if (spec.site) return { site: spec.site }
  if (!rack) return { area: spec.area }

  const rackId = spec.racks?.[rack.toUpperCase()]
  if (!rackId) return { area: spec.area }
  const def = RACKS.find((r) => r.id === rackId)
  if (!def) return { area: spec.area }

  // A bay or level outside what the racking drawing provides is a data-entry error,
  // not a discovery of extra racking. Keep the area, drop the impossible bay.
  const lvl = Number(level)
  const b = Number(bay)
  if (!(lvl >= 1 && lvl <= def.levels && b >= 1 && b <= def.bays)) return { area: spec.area }
  return { area: spec.area, rack: rackId, bay: b, lvl, kind: spec.kind || def.kind || 'pallet' }
}

const REBAR_GROUPS = new Set(['Rebar Works', 'Rebar Consumables'])
const TILE_GROUPS = new Set(['Tiles', 'Tile Consumables'])
const LONG_UOM = new Set(['M', 'ROLL'])

export function siteAreaFor(it) {
  // A recorded address wins: if the warehouse says a line is in the Tiles Area it is,
  // and if it says the line is on a rack indoors then no item-group rule sends it out.
  const rec = recordedPlacement(it)
  if (rec) return rec.site ?? null
  if (REBAR_GROUPS.has(it.tradeL2)) return 'rebar'
  if (TILE_GROUPS.has(it.tradeL2)) return 'tiles'
  return null
}

export function warehouseAreaFor(it) {
  const rec = recordedPlacement(it)
  if (rec?.area) return rec.area
  if (it.isHighValue) return 'highvalue'
  const a = WH_AREAS.find((w) => w.trades.includes(it.tradeL1))
  return a ? a.id : 'safekeeping'
}

// Ordered pallet positions for an area: level 1 across every bay of every rack first,
// then level 2, and so on.
function positionsFor(rackList) {
  const out = []
  const maxLevels = Math.max(...rackList.map((r) => r.levels), 0)
  for (let lvl = 1; lvl <= maxLevels; lvl++) {
    for (const r of rackList) {
      if (lvl > r.levels) continue
      for (let bay = 1; bay <= r.bays; bay++) out.push({ rack: r.id, bay, level: lvl, kind: r.kind || 'pallet' })
    }
  }
  return out
}

// Deterministic ordering — same input, same map, every reload.
const byPickRate = (a, b) =>
  (b.issueFrequency || 0) - (a.issueFrequency || 0) ||
  (b.inventoryValue || 0) - (a.inventoryValue || 0) ||
  a.id - b.id

let cache = null
let cacheKey = -1

// `placement()` is rebuilt whenever the hydrated item count changes, which is the same
// trigger the dashboard's memoised insight lists use.
export function placement() {
  if (cache && cacheKey === items.length) return cache

  const byLine = new Map() // item id -> location
  const site = { rebar: [], tiles: [], mrf: [] }
  const areas = Object.fromEntries(WH_AREAS.map((a) => [a.id, []]))
  // Lines the warehouse has addressed to a specific bay, so the modelling pass can
  // route around them instead of stacking a guess on top of a record.
  const fixed = new Map() // item id -> { area, rack, bay, lvl, kind }

  for (const it of items) {
    const s = siteAreaFor(it)
    if (s) {
      site[s].push(it)
      byLine.set(it.id, {
        level: 'site', area: s, label: SITE_AREAS.find((a) => a.id === s).name,
        recorded: !!recordedPlacement(it)?.site,
      })
    } else {
      const rec = recordedPlacement(it)
      areas[rec?.area ?? warehouseAreaFor(it)].push(it)
      if (rec?.rack) fixed.set(it.id, rec)
    }
  }
  // The MRF is where damaged stock is segregated for disposition. Those lines are
  // still counted at their storage location — only the damaged quantity is here — so
  // this is a view over the same rows, not a fourth exclusive bucket.
  site.mrf = items.filter((i) => (i.damagedQty || 0) > 0)

  const slots = {} // "rack|bay|level" -> item[]
  const put = (key, it) => { (slots[key] ??= []).push(it) }

  // Pass 1 — every line the warehouse has actually addressed goes to its own bay.
  for (const it of items) {
    const rec = fixed.get(it.id)
    if (!rec) continue
    byLine.set(it.id, { level: 'rack', recorded: true, ...rec })
    put(`${rec.rack}|${rec.bay}|${rec.lvl}`, it)
  }

  // Pass 2 — everything else is modelled into the positions still free.
  for (const area of WH_AREAS) {
    const pool = areas[area.id].slice().filter((it) => !fixed.has(it.id)).sort(byPickRate)

    let racked = pool
    if (area.id === 'safekeeping') {
      // Long goods go on the cantilever run; bulky reusable kit is block-stacked on
      // the open floor. Both match what slide 13's photographs show in each.
      const cant = pool.filter((i) => LONG_UOM.has(i.uom))
      const floor = pool.filter((i) => !LONG_UOM.has(i.uom) && i.materialType === 'Reusable')
      const rest = pool.filter((i) => !cant.includes(i) && !floor.includes(i))
      cant.forEach((it, i) => {
        const bay = (i % CANTILEVER.bays) + 1
        const arm = (Math.floor(i / CANTILEVER.bays) % CANTILEVER.arms) + 1
        byLine.set(it.id, { level: 'rack', recorded: false, area: area.id, rack: 'CANT', bay, lvl: arm, kind: 'cantilever' })
        put(`CANT|${bay}|${arm}`, it)
      })
      floor.forEach((it) => {
        byLine.set(it.id, { level: 'rack', recorded: false, area: area.id, rack: 'FLOOR', kind: 'floor' })
        put('FLOOR||', it)
      })
      racked = rest
    }

    const rackList = RACKS.filter((r) => r.area === area.id)
    const pos = positionsFor(rackList)
    if (!pos.length) continue
    // Prefer positions no recorded line already holds. If the modelled lines outnumber
    // what is left, the remainder wraps over the whole run as before — an area can hold
    // more lines than it has bays, and pretending otherwise would drop them off the map.
    const free = pos.filter((p) => !slots[`${p.rack}|${p.bay}|${p.level}`])
    const lay = free.length ? free : pos
    racked.forEach((it, i) => {
      const p = lay[i % lay.length]
      byLine.set(it.id, {
        level: 'rack', recorded: false,
        // Some records name only an area — "CAGE", or a bay number the racking drawing
        // does not have. The area is then still the warehouse's own word for it and
        // only the bay is inferred, which is a different claim from knowing neither.
        recordedArea: !!recordedPlacement(it)?.area,
        area: area.id, rack: p.rack, bay: p.bay, lvl: p.level, kind: p.kind,
      })
      put(`${p.rack}|${p.bay}|${p.level}`, it)
    })
  }

  cache = { byLine, site, areas, slots }
  cacheKey = items.length
  return cache
}

/* ---------------------------------------------------------------- aggregates */

export const totals = (pool) => ({
  lines: pool.length,
  qty: pool.reduce((a, b) => a + (b.availableQty || 0) + (b.reservedQty || 0), 0),
  available: pool.reduce((a, b) => a + (b.availableQty || 0), 0),
  reserved: pool.reduce((a, b) => a + (b.reservedQty || 0), 0),
  damaged: pool.reduce((a, b) => a + (b.damagedQty || 0), 0),
  value: pool.reduce((a, b) => a + (b.inventoryValue || 0), 0),
  low: pool.filter((i) => i.stockStatus === 'Low' || i.stockStatus === 'Out of Stock').length,
})

// Pallet/shelf positions an area offers, and how many of them the placement fills.
// Occupancy is "positions holding at least one line", not a volume measurement —
// nothing in the system records how full a pallet is.
export function areaCapacity(areaId) {
  const { slots, areas, byLine } = placement()
  const rackList = RACKS.filter((r) => r.area === areaId)
  let positions = rackList.reduce((a, r) => a + r.positions, 0)
  let used = Object.keys(slots).filter((k) => rackList.some((r) => k.startsWith(`${r.id}|`))).length
  if (areaId === 'safekeeping') {
    positions += CANTILEVER.positions
    used += Object.keys(slots).filter((k) => k.startsWith('CANT|')).length
  }
  const unit = areaId === 'highvalue' ? 'shelf positions' : 'pallet positions'
  const lines = areas[areaId] ?? []
  // How much of this area's map is read off the warehouse's own bin list rather than
  // modelled, so a screen can be specific instead of disclaiming everything.
  const recorded = lines.filter((it) => byLine.get(it.id)?.recorded).length
  return { positions, used, unit, lines: lines.length, recorded }
}

// Whole-facility capacity split into Warehouse-owned (mepfs, structural,
// architectural, highvalue) vs Safekeeping-owned (its own area), for the Overview
// gauge. Positions/used come straight from areaCapacity() per area — this is a
// reduction over the same real numbers the floor plan itself reports, not a second
// measurement, so the two can never disagree.
export function facilityCapacity() {
  const SAFEKEEPING_IDS = ['safekeeping']
  const sum = (ids) => ids.reduce((a, id) => {
    const c = areaCapacity(id)
    return { positions: a.positions + c.positions, used: a.used + c.used }
  }, { positions: 0, used: 0 })
  const warehouseIds = WH_AREAS.map((a) => a.id).filter((id) => !SAFEKEEPING_IDS.includes(id))
  const warehouse = sum(warehouseIds)
  const safekeeping = sum(SAFEKEEPING_IDS)
  const positions = warehouse.positions + safekeeping.positions
  const available = Math.max(0, positions - warehouse.used - safekeeping.used)

  // Peso value of the inventory actually sitting in each bucket — the SAME
  // warehouseAreaFor() bucketing the floor plan itself draws with, reduced over the
  // current item list rather than measured a second way, so it cannot drift from the
  // space figures above. Available has no value figure: empty positions hold nothing.
  let warehouseValue = 0
  let safekeepingValue = 0
  for (const it of items) {
    if (warehouseAreaFor(it) === 'safekeeping') safekeepingValue += it.inventoryValue || 0
    else warehouseValue += it.inventoryValue || 0
  }

  return {
    positions,
    warehouseUsed: warehouse.used,
    safekeepingUsed: safekeeping.used,
    available,
    warehousePct: positions > 0 ? (warehouse.used / positions) * 100 : 0,
    safekeepingPct: positions > 0 ? (safekeeping.used / positions) * 100 : 0,
    availablePct: positions > 0 ? (available / positions) * 100 : 0,
    warehouseValue,
    safekeepingValue,
  }
}

export function rackOccupancy(rackId) {
  const { slots } = placement()
  const r = RACKS.find((x) => x.id === rackId)
  if (!r) return { positions: 0, used: 0 }
  let used = 0
  for (let lvl = 1; lvl <= r.levels; lvl++)
    for (let bay = 1; bay <= r.bays; bay++) if (slots[`${r.id}|${bay}|${lvl}`]?.length) used++
  return { positions: r.positions, used }
}

export const slotItems = (rack, bay, level) => placement().slots[`${rack}|${bay}|${level}`] || []

export const areaItems = (areaId) => placement().areas[areaId] || []
export const siteItems = (areaId) => placement().site[areaId] || []

// Where one material line lives — used by the material profile page.
export function locationOf(item) {
  const loc = placement().byLine.get(item.id)
  if (!loc) return null
  // `loc` is spread FIRST and the display fields written over it. The other way round —
  // which is how this read until 2026-09-02 — let loc.area (an internal id like
  // 'mepfs') overwrite the area NAME that was just put there, so the material profile
  // printed the id at the reader. areaId keeps the raw value for callers that want it.
  const areaId = loc.area
  if (loc.level === 'site') return { ...loc, areaId, area: loc.label, detail: 'Outdoor stockyard' }
  const area = AREA_BY_ID[areaId]
  const base = { ...loc, areaId, area: area.name }
  if (loc.rack === 'FLOOR') return { ...base, detail: 'Floor Area — block stacked' }
  if (loc.rack === 'CANT') return { ...base, detail: `Cantilever · Bay ${loc.bay} · Arm ${loc.lvl}` }
  if (loc.kind === 'shelving')
    return { ...base, detail: `HV Line ${loc.rack.slice(2)} · Bay ${loc.bay} · Level ${loc.lvl}` }
  return { ...base, detail: `Rack ${loc.rack.slice(1)} · Bay ${loc.bay} · Level ${loc.lvl}` }
}
