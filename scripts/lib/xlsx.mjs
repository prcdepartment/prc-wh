// Minimal XLSX reader — no npm package required.
//
// An .xlsx file is a ZIP archive of XML parts. This walks the ZIP's End-of-Central-
// Directory record, inflates each entry with node's own zlib, and parses the three
// parts we need: the workbook (sheet names), the shared string table, and each
// worksheet's cell grid.
//
// Written because this machine has no Python and the project deliberately carries
// only five runtime dependencies; adding `xlsx` to read a file once a month is not
// a trade worth making. See CLAUDE.md.
import { readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'

// ---- ZIP ------------------------------------------------------------------
/** Read every entry of a ZIP into a Map of path -> Buffer. */
export function unzip(file) {
  const buf = readFileSync(file)
  // Locate the End of Central Directory record by scanning backwards for its signature.
  let eocd = -1
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error(`not a zip file: ${file}`)

  let count = buf.readUInt16LE(eocd + 10)
  let cdOffset = buf.readUInt32LE(eocd + 16)

  // ZIP64: the 32-bit fields saturate on large archives and the real values live
  // in the ZIP64 EOCD record. Item master workbooks get big enough to hit this.
  if (cdOffset === 0xffffffff || count === 0xffff) {
    for (let i = eocd - 20; i >= 0; i--) {
      if (buf.readUInt32LE(i) === 0x07064b50) {
        const z64 = Number(buf.readBigUInt64LE(i + 8))
        count = Number(buf.readBigUInt64LE(z64 + 32))
        cdOffset = Number(buf.readBigUInt64LE(z64 + 48))
        break
      }
    }
  }

  const files = new Map()
  let p = cdOffset
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break
    const method = buf.readUInt16LE(p + 10)
    const compSize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    let localOffset = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)

    if (localOffset === 0xffffffff) {
      // ZIP64 extra field: walk the tag/size pairs looking for tag 0x0001.
      let e = p + 46 + nameLen
      const end = e + extraLen
      while (e < end) {
        const tag = buf.readUInt16LE(e)
        const size = buf.readUInt16LE(e + 2)
        if (tag === 0x0001) { localOffset = Number(buf.readBigUInt64LE(e + 4 + 16)); break }
        e += 4 + size
      }
    }

    // The local header repeats the name/extra lengths; the data starts after them.
    const lNameLen = buf.readUInt16LE(localOffset + 26)
    const lExtraLen = buf.readUInt16LE(localOffset + 28)
    const start = localOffset + 30 + lNameLen + lExtraLen
    const raw = buf.subarray(start, start + compSize)
    files.set(name, method === 0 ? raw : inflateRawSync(raw))

    p += 46 + nameLen + extraLen + commentLen
  }
  return files
}

// ---- XML ------------------------------------------------------------------
const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }
function unescapeXml(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|lt|gt|amp|quot|apos);/g, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(parseInt(e[1] === 'x' ? e.slice(2) : e.slice(1), e[1] === 'x' ? 16 : 10))
    return ENTITIES[e] ?? m
  })
}

/** Shared strings: one <si> per string, whose text may be split across <t> runs. */
function sharedStrings(files) {
  const xml = files.get('xl/sharedStrings.xml')
  if (!xml) return []
  const s = xml.toString('utf8')
  const out = []
  for (const m of s.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let text = ''
    for (const t of m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) text += t[1]
    out.push(unescapeXml(text))
  }
  return out
}

/** Column letters -> zero-based index. A=0, Z=25, AA=26. */
export function colIndex(ref) {
  let n = 0
  for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

// ---- Workbook -------------------------------------------------------------
/**
 * Open a workbook. Returns { sheetNames, rows(name) } where rows() yields an
 * array of arrays of cell values (string | number | null), ragged rows padded.
 */
export function readWorkbook(file) {
  const files = unzip(file)
  const strings = sharedStrings(files)

  // Map sheet name -> part path, via workbook.xml + its relationships.
  const wb = files.get('xl/workbook.xml').toString('utf8')
  const rels = files.get('xl/_rels/workbook.xml.rels').toString('utf8')
  const relMap = new Map()
  for (const m of rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    relMap.set(m[1], m[2].replace(/^\/?(xl\/)?/, 'xl/'))
  }
  const sheets = []
  for (const m of wb.matchAll(/<sheet[^>]*\/>/g)) {
    const name = unescapeXml(/name="([^"]*)"/.exec(m[0])?.[1] ?? '')
    const rid = /r:id="([^"]*)"/.exec(m[0])?.[1]
    const state = /state="([^"]*)"/.exec(m[0])?.[1] ?? 'visible'
    sheets.push({ name, path: relMap.get(rid), state })
  }

  // Number formats — needed only to tell a date serial from a plain number.
  const styleXml = files.get('xl/styles.xml')?.toString('utf8') ?? ''
  const numFmts = new Map()
  for (const m of styleXml.matchAll(/<numFmt[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) {
    numFmts.set(Number(m[1]), unescapeXml(m[2]))
  }
  const cellXfs = []
  const xfBlock = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styleXml)?.[1] ?? ''
  for (const m of xfBlock.matchAll(/<xf[^>]*>/g)) cellXfs.push(Number(/numFmtId="(\d+)"/.exec(m[0])?.[1] ?? 0))
  const BUILTIN_DATE = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47])
  const isDateStyle = (s) => {
    const id = cellXfs[s] ?? 0
    if (BUILTIN_DATE.has(id)) return true
    const code = numFmts.get(id)
    return !!code && /[dmy]/i.test(code.replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, ''))
  }

  function rows(sheetName) {
    const sheet = sheets.find((s) => s.name === sheetName)
    if (!sheet) throw new Error(`no sheet named "${sheetName}"`)
    const xml = files.get(sheet.path).toString('utf8')
    const out = []
    for (const rm of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>|<row[^>]*r="(\d+)"[^>]*\/>/g)) {
      const rIdx = Number(rm[1] ?? rm[3]) - 1
      const body = rm[2] ?? ''
      const row = []
      for (const cm of body.matchAll(/<c([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cm[1]
        const inner = cm[2] ?? ''
        const ref = /r="([A-Z]+)\d+"/.exec(attrs)?.[1]
        const ci = ref ? colIndex(ref) : row.length
        const type = /t="([^"]*)"/.exec(attrs)?.[1] ?? 'n'
        const style = Number(/s="(\d+)"/.exec(attrs)?.[1] ?? -1)

        let value = null
        if (type === 'inlineStr') {
          let text = ''
          for (const t of inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) text += t[1]
          value = unescapeXml(text)
        } else {
          const v = /<v[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1]
          if (v !== undefined) {
            if (type === 's') value = strings[Number(v)] ?? ''
            else if (type === 'str' || type === 'e') value = unescapeXml(v)
            else if (type === 'b') value = v === '1'
            else {
              const num = Number(v)
              value = Number.isNaN(num) ? unescapeXml(v)
                : (style >= 0 && isDateStyle(style) && num > 0) ? { __date: excelDate(num) }
                : num
            }
          }
        }
        row[ci] = value
      }
      out[rIdx] = row
    }
    // Trim trailing rows that carry no value. Excel records a <row> for anything it
    // has ever styled, so a sheet somebody formatted to the bottom reports 1,048,576
    // rows holding 78 of data — the 2026-09-07 workbook does exactly that on two
    // sheets, which is most of why that file is 19 MB against the previous 435 KB.
    // Densifying to the declared height would allocate a million arrays per sheet.
    let end = out.length
    while (end > 0) {
      const r = out[end - 1]
      if (r && r.some((v) => v !== null && v !== undefined && v !== '')) break
      end--
    }

    // Fill holes so callers can index without guarding. A sheet with blank rows
    // leaves gaps in both dimensions, and Array#map preserves holes, so this
    // rebuilds a dense rectangle rather than mapping over the sparse one.
    const width = out.reduce((w, r) => Math.max(w, r ? r.length : 0), 0)
    const dense = []
    for (let i = 0; i < end; i++) {
      const filled = out[i] ?? []
      for (let j = 0; j < width; j++) if (filled[j] === undefined) filled[j] = null
      dense.push(filled)
    }
    return dense
  }

  return { sheets, sheetNames: sheets.map((s) => s.name), rows }
}

/** Excel serial -> 'YYYY-MM-DD'. Excel's 1900 leap-year bug means serial 60 is fictional. */
export function excelDate(serial) {
  const days = Math.floor(serial) - (serial > 59 ? 25569 : 25568)
  const dt = new Date(days * 86400000)
  return dt.toISOString().slice(0, 10)
}

/** Cell -> plain value: date objects collapse to their ISO string. */
export function cell(v) {
  if (v && typeof v === 'object' && v.__date) return v.__date
  return v
}
