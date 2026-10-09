/**
 * Reads an .xlsx by unzipping the XML directly.
 *
 * Needed because ExcelJS cannot parse some workbooks that other tools write
 * (Google Sheets exports, and files with a `lastModifiedBy` element in
 * docProps/core.xml). Those are common for anything that came out of Microsoft
 * Forms or Sheets, so parsing the XML is the reliable route.
 *
 * Run: node scripts/xlsx-reader.mjs <file.xlsx>
 */

import { readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

const run = promisify(execFile)

/**
 * Unescapes the XML entities that appear in shared strings.
 */
function unescapeXml(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // & must come last, otherwise the replacements above get double-unescaped.
    .replace(/&amp;/g, '&')
}

/**
 * Some writers (this is a common one for Google Sheets and Forms exports) put
 * the workbook's tags behind an `x:` namespace prefix. Tag matching below
 * tolerates an optional prefix, so `<row>` and `<x:row>` both work.
 */
function tags(name) {
  return `(?:${name}|[a-zA-Z0-9]+:${name})`
}

/** Converts a 1-based column index to its letters. */
export function columnLetter(n) {
  let s = ''
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/**
 * Returns { sheets: [{ name, rows }] } where rows is an array of arrays of
 * raw cell values: strings, numbers, or Date objects for date cells.
 */
export async function readXlsx(filePath) {
  const dir = join(tmpdir(), `xlsx-${Date.now()}-${Math.random().toString(36).slice(2)}`)

  // Windows PowerShell has no `unzip`, so shell out to Expand-Archive.
  const zip = join(dir, 'book.zip')
  await run('powershell', [
    '-NoProfile', '-Command',
    `New-Item -ItemType Directory -Force -Path '${dir}' | Out-Null; ` +
    `Copy-Item -LiteralPath '${filePath}' '${zip}'; ` +
    `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${join(dir, 'x')}' -Force`,
  ], { windowsHide: true })

  const root = join(dir, 'x')

  // --- shared strings -------------------------------------------------------
  const shared = []
  try {
    const xml = await readFile(join(root, 'xl', 'sharedStrings.xml'), 'utf8')
    // Each <si> is one string, possibly split across <t> runs.
    const siRe = new RegExp(`<${tags('si')}\\b[^>]*>([\\s\\S]*?)</${tags('si')}>`, 'g')
    const tRe = new RegExp(`<${tags('t')}\\b[^>]*>([\\s\\S]*?)</${tags('t')}>`, 'g')
    for (const si of xml.matchAll(siRe)) {
      shared.push(unescapeXml([...si[1].matchAll(tRe)].map((m) => m[1]).join('')))
    }
  } catch {
    // No shared strings is valid; every cell is then inline.
  }

  // --- sheet names ----------------------------------------------------------
  const workbookXml = await readFile(join(root, 'xl', 'workbook.xml'), 'utf8')
  const sheetNames = [
    ...workbookXml.matchAll(
      new RegExp(`<${tags('sheet')}\\b[^>]*name="([^"]*)"`, 'g'),
    ),
  ].map((m) => unescapeXml(m[1]))

  // --- sheet 1 --------------------------------------------------------------
  const sheetXml = await readFile(join(root, 'xl', 'worksheets', 'sheet1.xml'), 'utf8')

  // style index -> whether that style is a date format
  const dateStyles = await readDateStyles(root)

  const rows = []
  const rowRe = new RegExp(`<${tags('row')}\\b([^>]*)>([\\s\\S]*?)</${tags('row')}>`, 'g')
  const cellRe = new RegExp(`<${tags('c')}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${tags('c')}>)`, 'g')
  const vRe = new RegExp(`<${tags('v')}\\b[^>]*>([\\s\\S]*?)</${tags('v')}>`)
  const tRe = new RegExp(`<${tags('t')}\\b[^>]*>([\\s\\S]*?)</${tags('t')}>`, 'g')

  for (const rowMatch of sheetXml.matchAll(rowRe)) {
    const rowNum = Number(/r="(\d+)"/.exec(rowMatch[1])?.[1] ?? rows.length + 1)
    const cells = []

    for (const cellMatch of rowMatch[2].matchAll(cellRe)) {
      const attrs = cellMatch[1]
      const inner = cellMatch[2] ?? ''
      const ref = /r="([A-Z]+)(\d+)"/.exec(attrs)?.[1]
      const type = /t="([^"]+)"/.exec(attrs)?.[1]
      const styleIdx = Number(/s="(\d+)"/.exec(attrs)?.[1] ?? -1)

      if (!ref) continue
      const colIdx = [...ref].reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1

      let value = null
      if (type === 's') {
        const idx = Number(vRe.exec(inner)?.[1])
        value = shared[idx] ?? null
      } else if (type === 'inlineStr') {
        value = unescapeXml([...inner.matchAll(tRe)].map((m) => m[1]).join(''))
      } else {
        const raw = vRe.exec(inner)?.[1]
        if (raw !== undefined) {
          if (dateStyles.has(styleIdx)) {
            // Excel serial -> Date. 1900 epoch, with the well-known
            // leap-year bug for serials below 61.
            const serial = Number(raw)
            const ms = serial > 59
              ? Date.UTC(1899, 11, 30) + serial * 86_400_000
              : Date.UTC(1899, 11, 31) + serial * 86_400_000
            value = new Date(ms)
          } else {
            value = Number(raw)
            if (Number.isNaN(value)) value = raw
          }
        }
      }

      cells[colIdx] = value
    }

    // Normalise holes to null so indexes line up with column letters.
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = null
    rows[rowNum - 1] = cells
  }

  // Fill any gap rows.
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = []

  return { sheets: sheetNames.map((name, i) => ({ name, rows: i === 0 ? rows : [] })) }
}

/** Parses styles.xml and returns the set of style indexes that use a date format. */
async function readDateStyles(root) {
  const dateStyles = new Set()
  let stylesXml
  try {
    stylesXml = await readFile(join(root, 'xl', 'styles.xml'), 'utf8')
  } catch {
    return dateStyles
  }

  // Which built-in numFmtIds are dates? 14-22, 27-36, 45-47, 50-58.
  const isDateNumFmt = (id) =>
    (id >= 14 && id <= 22) || (id >= 27 && id <= 36) ||
    (id >= 45 && id <= 47) || (id >= 50 && id <= 58)

  // Custom formats, identified by a date-ish letter in the code.
  const customDate = new Set()
  const numFmtRe = new RegExp(
    `<${tags('numFmt')}\\b[^>]*numFmtId="(\\d+)"[^>]*formatCode="([^"]*)"`, 'g',
  )
  for (const m of stylesXml.matchAll(numFmtRe)) {
    if (/[dmyhs]/i.test(unescapeXml(m[2]))) customDate.add(Number(m[1]))
  }

  // cellXfs lists the formats; its index is the `s` attribute on a cell.
  const xfsBlock = new RegExp(
    `<${tags('cellXfs')}\\b[^>]*>([\\s\\S]*?)</${tags('cellXfs')}>`, 'g',
  ).exec(stylesXml)
  if (!xfsBlock) return dateStyles

  const xfs = [...xfsBlock[1].matchAll(new RegExp(`<${tags('xf')}\\b([^>]*)`, 'g'))]
  xfs.forEach((m, i) => {
    const numFmtId = Number(/numFmtId="(\d+)"/.exec(m[1] ?? '')?.[1] ?? 0)
    if (isDateNumFmt(numFmtId) || customDate.has(numFmtId)) dateStyles.add(i)
  })

  return dateStyles
}
