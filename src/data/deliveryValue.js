// Delivery Tracker — MODELLED VALUE.
//
// The delivery workbook records a quantity and a unit of measure and carries NO price on
// any sheet. Procurement asked for the breakdown to show value rather than quantity,
// mocked up from the inventory price list, so this module is that mock-up — and it is
// labelled as one everywhere it surfaces.
//
// WHAT IS REAL AND WHAT IS NOT, because the split is uneven and matters.
//
// Matching the tracker's materials against the 827 priced inventory lines by keyword was
// tried first and is NOT usable on its own. Checked line by line, a naive match returns:
//
//     "coupler"         -> PPR plumbing couplings, PHP 2-132   (not rebar couplers)
//     "aluminum"        -> aluminium DUCT TAPE and foil tape   (not glazed window sets)
//     "kitchen cabinet" -> a cabinet LIGHT fixture             (not a cabinet)
//     "sealant"         -> sealant GUNS, PHP 600               (not tubes of sealant)
//
// Every one of those looks like a price and is wrong by one to two orders of magnitude.
// So the keyword sets below are narrowed to the lines that genuinely describe the
// material, and where the price list simply does not stock it, the figure is ASSUMED and
// says so rather than being scraped from a near-miss.
//
// Three of the seven materials are grounded in the price list; four are assumptions. The
// card shows which is which, and `PRICE_BASIS` is what the UI reads to do that. Replace
// the assumptions with real figures as procurement supplies them — that is the whole
// point of keeping them in one table with their reasoning attached.
import { items } from './insights'

// A material's price is the SUM of these component medians, each taken from the priced
// inventory lines whose description matches. Summing is what makes a "set" a set: the
// schedule ships plumbing fixtures as a set of a water closet, a lavatory and a faucet,
// so one set is worth all three, not the median of one of them.
const FROM_PRICE_LIST = {
  'Plumbing Fixtures': {
    components: [
      { label: 'water closet', any: ['water closet'] },
      { label: 'lavatory', any: ['lavatory'] },
      { label: 'faucet / shower set', any: ['faucet', 'shower set'] },
    ],
    note: 'One set priced as a water closet plus a lavatory plus a faucet — the three the schedule ships together.',
  },
  'Wiring Devices': {
    components: [{ label: 'switch / outlet', any: ['way switch', 'convenience outlet'] }],
    note: 'Median of the switches and outlets on the price list.',
  },
  'Rebar Coupler & Accessories': {
    // "coupler" alone is dominated by PPR plumbing couplings, which are a different
    // product at a hundredth of the price. The exclusion is what makes this line real.
    components: [{ label: 'rebar coupler', any: ['coupler'], not: ['ppr', 'pvc', 'reducer'] }],
    note: 'Median of the rebar couplers on the price list, with PPR plumbing couplings excluded.',
  },
}

// Not stocked in the price list at all, so these are judgement, not measurement. Each is
// a per-UNIT figure in the material's own unit of measure, and each says what it assumes.
const ASSUMED = {
  'Wooden Door': { php: 4500, note: 'Per door set. The price list carries no door leaves — the only "door" line on it is a pipe chase panel.' },
  Aluminum: { php: 8000, note: 'Per glazed window or door set. The price list carries no glazing, only aluminium tape.' },
  'Kitchen Cabinet': { php: 25000, note: 'Per cabinet set. The price list carries no cabinets, only a cabinet light fixture.' },
  Sealant: { php: 250, note: 'Per tube. The price list carries sealant guns but no sealant.' },
}

export const PRICE_BASIS = { LIST: 'price-list', ASSUMED: 'assumed', NONE: 'none' }

const median = (ns) => {
  if (!ns.length) return null
  const s = [...ns].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

function componentPrice(c) {
  const hit = items.filter((i) => {
    const d = `${i.description || ''} ${i.detailedDescription || ''}`.toLowerCase()
    if (!(Number(i.unitPrice) > 0)) return false
    if (c.not && c.not.some((n) => d.includes(n))) return false
    return c.any.some((k) => d.includes(k))
  })
  return { php: median(hit.map((i) => Number(i.unitPrice))), lines: hit.length }
}

// Memoised per rebuild: `items` is refilled in place by hydrate(), and the prices only
// need recomputing when its length changes.
let cache = null
let cacheLen = -1

export function materialPrices() {
  if (cache && cacheLen === items.length) return cache
  const out = {}

  for (const [name, rule] of Object.entries(FROM_PRICE_LIST)) {
    const parts = rule.components.map((c) => ({ label: c.label, ...componentPrice(c) }))
    const known = parts.filter((p) => p.php != null)
    out[name] = known.length
      ? {
        php: known.reduce((a, p) => a + p.php, 0),
        basis: PRICE_BASIS.LIST,
        note: rule.note,
        parts: known.map((p) => `${p.label} ${Math.round(p.php).toLocaleString()} (${p.lines} line${p.lines === 1 ? '' : 's'})`),
      }
      // The keywords matched nothing at all — do not silently fall back to a near-miss.
      : { php: null, basis: PRICE_BASIS.NONE, note: 'No matching line on the price list.', parts: [] }
  }

  for (const [name, a] of Object.entries(ASSUMED)) {
    out[name] = { php: a.php, basis: PRICE_BASIS.ASSUMED, note: a.note, parts: [] }
  }

  cache = out
  cacheLen = items.length
  return out
}

export function materialPrice(name) {
  return materialPrices()[name] || { php: null, basis: PRICE_BASIS.NONE, note: 'No price modelled for this material.', parts: [] }
}

// How many of the materials on a set of slices are assumptions rather than price-list
// figures. The card states this rather than letting a peso total pass as measured.
export function priceCoverage(names) {
  const p = materialPrices()
  let list = 0, assumed = 0, none = 0
  for (const n of names) {
    const b = p[n]?.basis || PRICE_BASIS.NONE
    if (b === PRICE_BASIS.LIST) list += 1
    else if (b === PRICE_BASIS.ASSUMED) assumed += 1
    else none += 1
  }
  return { list, assumed, none }
}
