// XLSX reader — the ZIP walk and the XML parse, with NO I/O and NO decompressor.
//
// WHY THIS FILE IS SPLIT THE WAY IT IS
// This logic used to live entirely in scripts/lib/xlsx.mjs, where it called node's
// readFileSync and inflateRawSync directly. The in-app Import module (src/pages/
// ImportData.jsx) has to read the SAME workbook in a browser, where neither of those
// exists — and a second, independently written reader is exactly how the warehouse
// ends up with two answers for one file.
//
// So the parts that cannot differ live here:
//   zipEntries()    — walks the archive directory and hands back each entry's bytes,
//                     still compressed, with the method that was used.
//   parseWorkbook() — turns the inflated parts into { sheets, sheetNames, rows }.
// Both are synchronous and platform-free. INFLATING is the only step that differs:
// node has zlib.inflateRawSync (synchronous), the browser has DecompressionStream
// (asynchronous). Each side supplies its own and then calls the same parseWorkbook,
// so scripts/lib/xlsx.mjs keeps its synchronous readWorkbook(path) signature and the
// browser gets readWorkbookFromBytes(bytes) — one set of rules, two front doors.
//
// Written from scratch rather than pulling in the `xlsx` npm package: this project
// deliberately carries five runtime dependencies, and the parser is ~200 lines.

// ---- ZIP ------------------------------------------------------------------
/**
 * Walk a ZIP archive's central directory.
 * @param {Uint8Array} bytes the whole file
 * @returns {{name: string, method: number, data: Uint8Array}[]} entries, data still
 *   compressed where method !== 0 (0 = stored, 8 = raw deflate)
 */
export function zipEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const u32 = (p) => view.getUint32(p, true)
  const u16 = (p) => view.getUint16(p, true)
  const u64 = (p) => Number(view.getBigUint64(p, true))

  // Locate the End of Central Directory record by scanning backwards for its signature.
  let eocd = -1
  for (let i = bytes.length - 22; i >= 0 && i > bytes.length - 22 - 65536; i--) {
    if (u32(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('not a .xlsx file (no ZIP directory found)')

  let count = u16(eocd + 10)
  let cdOffset = u32(eocd + 16)

  // ZIP64: the 32-bit fields saturate on large archives and the real values live
  // in the ZIP64 EOCD record. Item master workbooks get big enough to hit this.
  if (cdOffset === 0xffffffff || count === 0xffff) {
    for (let i = eocd - 20; i >= 0; i--) {
      if (u32(i) === 0x07064b50) {
        const z64 = u64(i + 8)
        count = u64(z64 + 32)
        cdOffset = u64(z64 + 48)
        break
      }
    }
  }

  const utf8 = new TextDecoder('utf-8')
  const out = []
  let p = cdOffset
  for (let i = 0; i < count; i++) {
    if (u32(p) !== 0x02014b50) break
    const method = u16(p + 10)
    const compSize = u32(p + 20)
    const nameLen = u16(p + 28)
    const extraLen = u16(p + 30)
    const commentLen = u16(p + 32)
    let localOffset = u32(p + 42)
    const name = utf8.decode(bytes.subarray(p + 46, p + 46 + nameLen))

    if (localOffset === 0xffffffff) {
      // ZIP64 extra field: walk the tag/size pairs looking for tag 0x0001.
      let e = p + 46 + nameLen
      const end = e + extraLen
      while (e < end) {
        const tag = u16(e)
        const size = u16(e + 2)
        if (tag === 0x0001) { localOffset = u64(e + 4 + 16); break }
        e += 4 + size
      }
    }

    // The local header repeats the name/extra lengths; the data starts after them.
    const lNameLen = u16(localOffset + 26)
    const lExtraLen = u16(localOffset + 28)
    const start = localOffset + 30 + lNameLen + lExtraLen
    out.push({ name, method, data: bytes.subarray(start, start + compSize) })

    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

/** Inflate every entry with the supplied raw-deflate function (sync or async). */
export async function inflateEntries(entries, inflateRaw) {
  const files = new Map()
  for (const e of entries) {
    files.set(e.name, e.method === 0 ? e.data : await inflateRaw(e.data))
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

const DECODER = new TextDecoder('utf-8')
const text = (bytes) => (bytes ? DECODER.decode(bytes) : '')

/** Shared strings: one <si> per string, whose text may be split across <t> runs. */
function sharedStrings(files) {
  const xml = files.get('xl/sharedStrings.xml')
  if (!xml) return []
  const s = text(xml)
  const out = []
  for (const m of s.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let str = ''
    for (const t of m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) str += t[1]
    out.push(unescapeXml(str))
  }
  return out
}

/** Column letters -> zero-based index. A=0, Z=25, AA=26. */
export function colIndex(ref) {
  let n = 0
  for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
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

// ---- Workbook -------------------------------------------------------------
/**
 * Parse an inflated workbook.
 * @param {Map<string, Uint8Array>} files path -> inflated bytes
 * @returns {{sheets: {name,path,state}[], sheetNames: string[], rows: (name) => any[][]}}
 */
export function parseWorkbook(files) {
  const strings = sharedStrings(files)

  // Map sheet name -> part path, via workbook.xml + its relationships.
  const wb = text(files.get('xl/workbook.xml'))
  const rels = text(files.get('xl/_rels/workbook.xml.rels'))
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
  const styleXml = text(files.get('xl/styles.xml'))
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
    const xml = text(files.get(sheet.path))
    const out = []
    for (const rm of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>|<row[^>]*r="(\d+)"[^>]*\/>/g)) {
      const rIdx = Number(rm[1] ?? rm[3]) - 1
      const body = rm[2] ?? ''
      const row = []
      // The attribute group is LAZY, and that is load-bearing. Greedy [^>]* swallows the
      // trailing slash of a self-closing <c r="A4" s="105"/>: the /> branch then fails,
      // the > branch matches that same >, and the inner group runs on to the next cell
      // that has a real </c> — absorbing every cell in between and filing its value
      // under the EMPTY cell column. The 2026-09-10 delivery-tracker reference is
      // written that way (Excel emits a styled empty <c/> for each cell of a formatted
      // block), which put a shared-string INDEX into column A and moved every date one
      // column left. Lazy tries /> before > at each length, so a self-closing cell ends
      // where it should.
      for (const cm of body.matchAll(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cm[1]
        const inner = cm[2] ?? ''
        const ref = /r="([A-Z]+)\d+"/.exec(attrs)?.[1]
        const ci = ref ? colIndex(ref) : row.length
        const type = /t="([^"]*)"/.exec(attrs)?.[1] ?? 'n'
        const style = Number(/s="(\d+)"/.exec(attrs)?.[1] ?? -1)

        let value = null
        if (type === 'inlineStr') {
          let str = ''
          for (const t of inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) str += t[1]
          value = unescapeXml(str)
        } else {
          const v = /<v[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1]
          if (v !== undefined) {
            if (type === 's') value = strings[Number(v)] ?? ''
            else if (type === 'str' || type === 'e') value = unescapeXml(v)
            else if (type === 'b') value = v === '1'
            else {
              const n = Number(v)
              value = Number.isNaN(n) ? unescapeXml(v)
                : (style >= 0 && isDateStyle(style) && n > 0) ? { __date: excelDate(n) }
                : n
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

// ---- Browser front door ---------------------------------------------------
/**
 * Read a workbook in the browser, from the bytes of a File / ArrayBuffer.
 *
 * Inflation uses DecompressionStream('deflate-raw'), which is the platform's own
 * zlib — no dependency, and the same algorithm node uses on the other side. It is
 * available in every browser from 2023 on; where it is missing the import module
 * says so rather than half-reading the file.
 */
export async function readWorkbookFromBytes(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error(
      'This browser cannot decompress .xlsx files (DecompressionStream is unavailable). ' +
      'Use a current version of Chrome, Edge, Firefox or Safari.')
  }
  const inflateRaw = async (data) => {
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  }
  return parseWorkbook(await inflateEntries(zipEntries(bytes), inflateRaw))
}
