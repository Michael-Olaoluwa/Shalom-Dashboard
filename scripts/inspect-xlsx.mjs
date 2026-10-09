/**
 * Prints the STRUCTURE of a spreadsheet — headers, row counts and the shape of
 * each column — without printing member data.
 *
 * Run: node scripts/inspect-xlsx.mjs <file.xlsx>
 */

import { readXlsx, columnLetter } from './xlsx-reader.mjs'

const filePath = process.argv[2]
if (!filePath) {
  console.error('Usage: node scripts/inspect-xlsx.mjs <file.xlsx>')
  process.exit(1)
}

const { sheets } = await readXlsx(filePath)

for (const { name, rows } of sheets) {
  const nonEmpty = rows.filter((r) => r.some((c) => c !== null && c !== undefined && String(c).trim() !== ''))
  console.log('='.repeat(72))
  console.log(`SHEET "${name}" — ${rows.length} rows total, ${nonEmpty.length} non-empty`)
  console.log('='.repeat(72))

  if (nonEmpty.length === 0) {
    console.log('(empty)')
    continue
  }

  // The header is the row with the most populated cells, which handles both
  // Forms exports (title in row 1, headers in row 2) and plain sheets.
  let headerIdx = 0
  let best = 0
  nonEmpty.forEach((r, i) => {
    const n = r.filter((c) => c !== null && c !== undefined && String(c).trim() !== '').length
    if (n > best) { best = n; headerIdx = i }
  })

  const headers = nonEmpty[headerIdx].map((h) => (h === null || h === undefined ? '' : String(h).trim()))
  const width = Math.max(headers.length, ...nonEmpty.slice(headerIdx + 1).map((r) => r.length))

  console.log(`\nHeader is row ${headerIdx + 1} (${best} columns).\n`)
  headers.forEach((h, i) => {
    if (h !== '') console.log(`  ${columnLetter(i + 1).padEnd(2)}  ${h}`)
  })

  const dataRows = nonEmpty.slice(headerIdx + 1)
  console.log(`\n${dataRows.length} data rows.\n`)

  console.log('Column shapes (no values shown):')
  for (let c = 0; c < width; c++) {
    let filled = 0, dates = 0, numbers = 0, yesNo = 0, text = 0
    const distinct = new Set()
    let shape = null

    for (const row of dataRows) {
      const v = row[c]
      if (v === null || v === undefined || String(v).trim() === '') continue
      filled++
      if (v instanceof Date) { dates++; shape ??= 'Date object' }
      else if (typeof v === 'number') { numbers++; shape ??= 'number' }
      else {
        text++
        const t = String(v).trim()
        if (t.length <= 60) distinct.add(t)
        if (/^(yes|no|y|n|true|false|x|agree|disagree)$/i.test(t)) yesNo++
        shape ??= classify(t)
      }
    }

    const note = [
      `${filled} filled`,
      dates ? `${dates} date cells` : null,
      numbers ? `${numbers} numeric` : null,
      text ? `${text} text` : null,
      distinct.size > 0 && distinct.size <= 40 ? `${distinct.size} distinct` : null,
      yesNo ? `${yesNo} yes/no` : null,
    ].filter(Boolean).join(', ')

    console.log(`  ${columnLetter(c + 1).padEnd(2)} ${headers[c] || '(no header)'}`.padEnd(42) + `${note}  [${shape ?? 'empty'}]`)
  }
  console.log('')
}

function classify(t) {
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return 'ISO timestamp'
  if (/^\d{4}-\d{2}-\d{2}T/.test(t)) return 'ISO timestamp'
  if (/^\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?$/.test(t)) return 'numeric date-like'
  if (/^\d+$/.test(t)) return 'digits only'
  if (/^\+?[\d\s()-]{7,}$/.test(t)) return 'phone-like'
  if (/\bemail\b/i.test(t) || t.includes('@')) return 'email-like'
  if (/^[A-Za-z\s'-]+$/.test(t)) return 'name-like text'
  return 'mixed text'
}
