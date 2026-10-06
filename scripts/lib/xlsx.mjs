// Node front door for the shared XLSX reader.
//
// The ZIP walk and the XML parse live in ../../src/lib/xlsx.js so that the in-app
// Import module reads a workbook by exactly the same rules this script does — two
// readers would eventually disagree about one file, and the disagreement would be
// silent. This file supplies the two things that module deliberately does not have:
// the filesystem, and node's synchronous raw-deflate.
//
// readWorkbook(path) stays SYNCHRONOUS, so the three importers that already call it
// (import-snapshot, import-delivery-tracker, import-audit-report) are unchanged.
import { readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'
import { zipEntries, parseWorkbook, colIndex, excelDate, cell } from '../../src/lib/xlsx.js'

export { colIndex, excelDate, cell }

/** Read every entry of a ZIP into a Map of path -> Buffer. */
export function unzip(file) {
  const bytes = new Uint8Array(readFileSync(file))
  const files = new Map()
  for (const e of zipEntries(bytes)) {
    files.set(e.name, e.method === 0 ? e.data : new Uint8Array(inflateRawSync(e.data)))
  }
  return files
}

/**
 * Open a workbook. Returns { sheets, sheetNames, rows(name) } where rows() yields an
 * array of arrays of cell values (string | number | null), ragged rows padded.
 */
export function readWorkbook(file) {
  return parseWorkbook(unzip(file))
}
