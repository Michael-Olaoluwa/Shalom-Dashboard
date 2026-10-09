/**
 * Generates a fake Microsoft Forms export, in the awkward shapes that export
 * actually produces, so the import script can be tested without touching the
 * real congregation spreadsheet.
 *
 * Run: node scripts/make-sample-xlsx.mjs
 */

import ExcelJS from 'exceljs'
import { writeFile } from 'node:fs/promises'

const workbook = new ExcelJS.Workbook()
const sheet = workbook.addWorksheet('Sheet1')

// Microsoft Forms always emits a Timestamp first, then the question text as
// the header, verbatim including any question numbering.
sheet.addRow([
  'Timestamp',
  'Full Name',
  'Phone Number',
  'Birthday (day and month)',
  'Anniversary Date',
  'I agree to my details being shown',
])

// Shapes deliberately mixed:
//  - ISO timestamp, as a date-picker question produces
//  - a real Excel date cell
//  - day/month as text
//  - a month name and a day
//  - an Excel serial number
//  - a leap day, which must survive
//  - an impossible date, which must be skipped with a reason
sheet.addRow([
  '2024-01-15T09:12:00Z', 'Ada Lovelace', '555-0100',
  new Date(Date.UTC(1985, 2, 15)), '1980-06-20T00:00:00Z', 'Yes',
])
sheet.addRow([
  '2024-01-16T10:30:00Z', 'Grace Hopper', '555-0101',
  '22 Jul', '03/14', 'Yes',
])
sheet.addRow([
  '2024-01-17T11:00:00Z', 'Katherine Johnson', '555-0102',
  '9 August', 45000, 'No',
])
sheet.addRow([
  '2024-01-18T12:00:00Z', 'Leap Day Person', '555-0103',
  '29 Feb', '', 'Yes',
])
sheet.addRow([
  '2024-01-19T13:00:00Z', 'Impossible Date', '555-0104',
  '31 April', '', 'Yes',
])
sheet.addRow([
  '2024-01-20T14:00:00Z', 'No Phone', '',
  '1 Jan', '', 'Yes',
])

await writeFile('sample-responses.xlsx', await workbook.xlsx.writeBuffer())
console.log('Wrote sample-responses.xlsx with 6 rows (1 deliberately broken).')
