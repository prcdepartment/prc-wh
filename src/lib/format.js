export const peso = (n, opts = {}) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: opts.decimals ?? 0,
    minimumFractionDigits: opts.decimals ?? 0,
  }).format(n || 0)

export const num = (n) => new Intl.NumberFormat('en-PH').format(Math.round(n || 0))

export const compact = (n) =>
  new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0)

export const pct = (n) => `${(n || 0).toFixed(1)}%`

// Base date for the prototype: the snapshot date of the current source workbook, which
// is also the base for every `off` in the ledger and for lastMovementOffset on a stock
// line. It MUST match SNAPSHOT_DATE in private-data/inventory.js — the September
// workbook's own "As of" date, which is also its latest recorded release, so no
// movement on record ever lands on a future date.
// Update this whenever a new snapshot is imported (npm run import).
export const TODAY = new Date('2026-09-02T00:00:00')

// 'YYYY-MM-DD' from a Date's LOCAL parts, for date-input values. Not
// toISOString().slice(0,10) — that converts to UTC first, so a local-midnight date in any
// positive-offset zone (Manila is +08) comes back as the previous day.
export const isoDate = (d = TODAY) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const dateFromOffset = (daysAgo) => {
  const d = new Date(TODAY)
  d.setDate(d.getDate() - daysAgo)
  return d
}

// Format as YYYY MMM DD (e.g., "2026 Aug 13")
export const fmtDate = (d) => {
  const date = d instanceof Date ? d : new Date(d)
  const year = date.getFullYear()
  const month = date.toLocaleDateString('en-PH', { month: 'short' })
  const day = String(date.getDate()).padStart(2, '0')
  return `${year} ${month} ${day}`
}

const MONTH_ABBR = {
  january: 'Jan', february: 'Feb', march: 'Mar', april: 'Apr', may: 'May', june: 'Jun',
  july: 'Jul', august: 'Aug', september: 'Sep', october: 'Oct', november: 'Nov', december: 'Dec',
}
const WEEK_ORDINAL = { first: 'W1', second: 'W2', third: 'W3', fourth: 'W4', last: 'W5' }

// Normalizes a free-text delivery estimate ("August, 2026", "First Week August 2026",
// "Mid September 2026") into the tracker's compact shorthand — always year-first, so
// it reads against the firm YYYY MMM DD dates in the same column without looking like
// a different kind of value: a plain month becomes "<Year> <Mon>", a week-of-month
// estimate becomes "<Year> <Mon> W<N>", and a mid-month estimate becomes
// "<Year> Mid <Mon>". Falls back to the source text verbatim when it doesn't match one
// of the sheet's known phrasings.
export const fmtTargetText = (text) => {
  if (!text) return ''
  const t = text.trim()

  let m = t.match(/^(first|second|third|fourth|last)\s+week\s+([a-z]+)\s+(\d{4})/i)
  if (m) {
    const mon = MONTH_ABBR[m[2].toLowerCase()]
    if (mon) return `${m[3]} ${mon} ${WEEK_ORDINAL[m[1].toLowerCase()]}`
  }

  m = t.match(/^mid\s+([a-z]+)\s+(\d{4})/i)
  if (m) {
    const mon = MONTH_ABBR[m[1].toLowerCase()]
    if (mon) return `${m[2]} Mid ${mon}`
  }

  m = t.match(/^([a-z]+),?\s+(\d{4})/i)
  if (m) {
    const mon = MONTH_ABBR[m[1].toLowerCase()]
    if (mon) return `${m[2]} ${mon}`
  }

  return t
}

// Standardises the Delivery Tracker's free-text tower/location strings into the
// compact "T1, T2, T3" / "TA, TB, TC" form. The source mixes styles ("Tower 1 & 2",
// "Tower A & B", "T2, T5 & T10", "Tower I, J, H & A"): tokens are split on commas and
// ampersands, the word "Tower" is dropped, and any bare token (a number or letter with
// no prefix) gets a "T" prepended, so every token ends up as T<id>. Blank stays blank.
export const fmtTower = (loc) => {
  if (!loc) return ''
  const tokens = String(loc)
    .split(/[,&]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((tok) => {
      const t = tok.replace(/^tower\s+/i, '').trim()
      return /^t/i.test(t) ? t.toUpperCase() : `T${t.toUpperCase()}`
    })
  return tokens.join(', ')
}

export const initials = (name = '') =>
  name
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
