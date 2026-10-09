/**
 * One-off import of the existing Microsoft Forms / Excel list into `members`.
 *
 * Usage:
 *   node --env-file=.env.import scripts/import-members.mjs path/to/responses.xlsx
 *
 * Reads .xlsx (Microsoft Forms "Download responses" output) and .csv directly,
 * so there is no need to re-save or tidy the file first. Column headers are
 * matched loosely, and anything ambiguous is reported before writing.
 *
 * The service role key is required, because the `members` table has RLS
 * enabled with no policies — nothing but the service role can write to it.
 * That key must NEVER go in .env (which Vite exposes to the browser), which
 * is why this reads from a separate file, `.env.import`, that is gitignored.
 *
 *   .env.import:
 *     SUPABASE_URL=https://yehueudpgogoznmzrwyv.supabase.co
 *     SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
 *
 * Re-running adds rows again rather than merging. To start over, empty the
 * table from the Supabase table editor first, then re-run.
 */

import { readFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { readXlsx as readXlsxXml } from './xlsx-reader.mjs'

const args = process.argv.slice(2)
const filePath = args.find((a) => !a.startsWith('--'))
const assumeYes = args.includes('--yes')
const dryRun = args.includes('--dry-run')

// Ambiguous numeric dates like 03/14 could be 3 April or 14 March. The old
// sheet and the Forms UI present day/month, so that is the default, but a
// US-format sheet needs --date-order=md. Only affects slash/dot/dash dates
// with two numbers; ISO timestamps and month names are never ambiguous.
const dateOrderArg = args.find((a) => a.startsWith('--date-order='))
const dateOrder = dateOrderArg ? dateOrderArg.split('=')[1] : 'dm'

if (!['dm', 'md'].includes(dateOrder)) {
  console.error('--date-order must be either dm (day/month, default) or md (month/day)')
  process.exit(1)
}

if (!filePath) {
  console.error('Usage: node --env-file=.env.import scripts/import-members.mjs <file.xlsx|.csv> [--dry-run] [--yes] [--date-order=dm|md]')
  process.exit(1)
}

// The Supabase client is only needed to actually write, so a dry run works
// without credentials at all — useful for checking the column mapping before
// anyone goes looking for a service role key.
let supabase = null
if (!dryRun) {
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
    console.error('Create .env.import in the project root — see the comment at the top of this file.')
    console.error('Or add --dry-run to check the file without writing anything.')
    process.exit(1)
  }

  supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  })
}

const MONTH_LOOKUP = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
}

function daysIn(month) {
  if (month === 2) return 29
  if ([4, 6, 9, 11].includes(month)) return 30
  return 31
}

/**
 * Pulls a day and month out of whatever the spreadsheet happens to hold.
 *
 * Microsoft Forms date answers arrive as full timestamps ("1985-03-15T00:00:00Z"
 * or an Excel serial number) because that's what a date picker produces, so
 * those are handled first. Then the hand-typed forms: "3", "3 Mar", "Mar 3",
 * "03/03", "3rd March". Returns null if it can't, rather than guessing.
 *
 * The year is deliberately dropped — none is ever stored.
 */
function parseDate(value) {
  if (value === null || value === undefined) return null

  // Already a real Date: ExcelJS hands these back for date cells.
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return validate(value.getDate(), value.getMonth() + 1)
  }

  // Excel serial number (days since 1899-12-30). Only plausible in a range
  // that lands on a sane modern year, which filters out stray integers.
  if (typeof value === 'number' && Number.isInteger(value)) {
    if (value > 20000 && value < 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000)
      return validate(d.getUTCDate(), d.getUTCMonth() + 1)
    }
    return validate(value, null)
  }

  const raw = String(value).trim()
  if (!raw) return null

  // ISO timestamp from Forms: 1985-03-15T00:00:00.000Z
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    return validate(Number(iso[3]), Number(iso[2]))
  }

  // Slash/dot/dash form: 3/15/1985, 15/3/1985, 03-03. The order of the first
  // two numbers is ambiguous, so it comes from --date-order.
  const numeric = raw.match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?$/)
  if (numeric) {
    const a = Number(numeric[1])
    const b = Number(numeric[2])
    return dateOrder === 'md' ? validate(b, a) : validate(a, b)
  }

  // Single number with a month name: "3 Mar"
  const dayPlusName = raw.match(/^(\d{1,2})\s*([a-z]+)/i)
  if (dayPlusName) {
    const month = monthFromName(dayPlusName[2])
    if (month) return validate(Number(dayPlusName[1]), month)
  }

  // Month name with a day: "Mar 3", "3rd March"
  const cleaned = raw.toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, '$1')
  const words = cleaned.match(/[a-z]+|\d+/g)
  if (!words) return null

  let month = null
  for (const word of words) {
    if (/^[a-z]+$/.test(word)) {
      month ??= monthFromName(word)
    }
  }

  const nums = words.filter((w) => /^\d+$/.test(w)).map(Number)
  // A number above 31 can only be a year, never a day.
  const day = nums.find((n) => n <= 31) ?? null

  return validate(day, month)
}

function monthFromName(word) {
  const w = word.toLowerCase().slice(0, 3)
  return MONTH_LOOKUP[w] ?? null
}

function validate(day, month) {
  if (!day || !month || month < 1 || month > 12) return null
  if (day < 1 || day > daysIn(month)) return null
  return { day, month }
}

/** Normalises a cell to a trimmed string. */
function cellToString(value) {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    // ExcelJS returns rich text as an array of runs.
    if (Array.isArray(value.richText)) {
      return value.richText.map((r) => r.text).join('').trim()
    }
    if (value.text !== undefined) return String(value.text).trim()
    if (value.result !== undefined) return String(value.result).trim()
    return ''
  }
  return String(value).trim()
}

/** Reads the first worksheet of an .xlsx into a plain array-of-arrays. */
async function readXlsx(path) {
  const { sheets } = await readXlsxXml(path)
  const sheet = sheets[0]
  if (!sheet || sheet.rows.length === 0) {
    console.error('That workbook has no readable worksheets.')
    process.exit(1)
  }

  console.log(`  (reading worksheet "${sheet.name}")`)
  return sheet.rows
}

/** Reads a .csv into an array-of-arrays, via the same shape as readXlsx. */
async function readCsv(path) {
  const text = await readFile(path, 'utf8')
  const rows = []

  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else {
        field += c
      }
      continue
    }

    if (c === '"') { inQuotes = true; continue }
    if (c === ',') { row.push(field); field = ''; continue }
    if (c === '\r') continue
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue }
    field += c
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

const ext = extname(filePath).toLowerCase()
console.log(`Reading ${basename(filePath)}`)

let rows
if (ext === '.xlsx' || ext === '.xlsm') {
  rows = await readXlsx(filePath)
} else if (ext === '.csv' || ext === '.txt') {
  rows = await readCsv(filePath)
} else {
  console.error(`Unsupported file type "${ext}". Save the file as .xlsx or .csv.`)
  process.exit(1)
}

// Microsoft Forms puts a "Timestamp" column first; keep it, since it is a
// useful tie-breaker when the same person submitted twice.
const nonEmpty = rows.filter((r) => r.some((c) => cellToString(c) !== ''))

if (nonEmpty.length < 2) {
  console.error('That file has no data rows. Expected a header row plus at least one member.')
  process.exit(1)
}

const headers = nonEmpty[0].map((h) => cellToString(h))
const dataRows = nonEmpty.slice(1)

/**
 * Finds a column by any of several possible header names.
 *
 * Only columns that actually contain data are candidates. Without that guard a
 * sheet holding both an empty "Name" column and a populated "Full Name" column
 * maps to the empty one, and every row is silently dropped with "no name".
 * Form exports routinely carry such empty duplicates, so this matters.
 *
 * Among the candidates: an exact normalised header wins, then a header that
 * merely *contains* one of the names, because Forms appends qualifiers like
 * "Birthday (day and month)".
 */
function findColumn(names, rows, headerIdx) {
  const wanted = names.map(normaliseHeader)
  const headers = rows[headerIdx]

  // Which columns have at least one non-empty cell below the header?
  const populated = new Set()
  for (let r = headerIdx + 1; r < rows.length; r++) {
    for (let c = 0; c < headers.length; c++) {
      const v = rows[r][c]
      if (v !== null && v !== undefined && cellToString(v) !== '') populated.add(c)
    }
  }

  // Prefer a populated exact match. Fall back to an unpopulated exact match
  // only if nothing populated matches at all, so a genuinely blank source
  // column still reports its header rather than looking absent.
  const exact = headers.findIndex((h, i) => populated.has(i) && wanted.includes(normaliseHeader(h)))
  if (exact !== -1) return exact

  const fuzzy = headers.findIndex((h, i) => {
    if (!populated.has(i)) return false
    const n = normaliseHeader(h)
    return wanted.some((w) => w.length >= 4 && n.includes(w))
  })
  if (fuzzy !== -1) return fuzzy

  return headers.findIndex((h) => wanted.includes(normaliseHeader(h)))
}

function normaliseHeader(h) {
  return cellToString(h).toLowerCase().replace(/[^a-z0-9]/g, '')
}

// The option lists the signup form and schema.sql enforce. An import value that
// isn't one of these is dropped to null rather than failing the whole batch on
// a database check constraint.
const GENDER_OPTIONS = ['Male', 'Female']
const CATEGORY_OPTIONS = ['Children', 'Teenager', 'Youth', 'Adult']
const MARITAL_OPTIONS = ['Married', 'Single', 'Widowed', 'Divorced', 'Separated']

function canonicalEnum(value, allowed) {
  const s = cellToString(value).toLowerCase()
  if (!s) return null
  return allowed.find((a) => a.toLowerCase() === s) ?? null
}

const nameIdx = findColumn(
  ['name', 'fullname', 'member', 'membername', 'yourname', 'nameofmember', 'firstname'],
  nonEmpty, 0,
)
const phoneIdx = findColumn(
  ['phone', 'phonenumber', 'whatsappphonenumber', 'telephone', 'mobile', 'contact', 'contactnumber'],
  nonEmpty, 0,
)
const birthIdx = findColumn(
  ['birthday', 'birthdate', 'dateofbirth', 'dob', 'birth', 'birthdaydayandmonth'],
  nonEmpty, 0,
)
const annivIdx = findColumn(
  ['anniversary', 'anniversarydate', 'wedding', 'weddingdate', 'weddinganniversarydate', 'marriage'],
  nonEmpty, 0,
)
const consentIdx = findColumn(
  ['consent', 'consenttodisplay', 'display', 'show', 'optin', 'agree', 'permission'],
  nonEmpty, 0,
)
const genderIdx = findColumn(['gender', 'sex'], nonEmpty, 0)
const emailIdx = findColumn(['email', 'emailaddress'], nonEmpty, 0)
const addressIdx = findColumn(
  ['residentialaddress', 'address', 'homeaddress', 'residence'],
  nonEmpty, 0,
)
const categoryIdx = findColumn(
  ['membershipcategory', 'category', 'membership'],
  nonEmpty, 0,
)
const maritalIdx = findColumn(['maritalstatus', 'marital'], nonEmpty, 0)
const occupationIdx = findColumn(
  ['occupation', 'job', 'work', 'profession'],
  nonEmpty, 0,
)
const departmentIdx = findColumn(
  ['churchdepartmentunit', 'churchdepartment', 'departmentunit', 'department', 'unit'],
  nonEmpty, 0,
)

console.log(`\nColumn mapping:`)
console.log(`  name:       ${nameIdx >= 0 ? headers[nameIdx] : '*** NOT FOUND ***'}`)
console.log(`  gender:     ${genderIdx >= 0 ? headers[genderIdx] : '(none)'}`)
console.log(`  phone:      ${phoneIdx >= 0 ? headers[phoneIdx] : '(none — will be blank)'}`)
console.log(`  email:      ${emailIdx >= 0 ? headers[emailIdx] : '(none)'}`)
console.log(`  address:    ${addressIdx >= 0 ? headers[addressIdx] : '(none)'}`)
console.log(`  category:   ${categoryIdx >= 0 ? headers[categoryIdx] : '(none)'}`)
console.log(`  birthday:   ${birthIdx >= 0 ? headers[birthIdx] : '*** NOT FOUND ***'}`)
console.log(`  marital:    ${maritalIdx >= 0 ? headers[maritalIdx] : '(none)'}`)
console.log(`  anniversary:${annivIdx >= 0 ? ' ' + headers[annivIdx] : ' (none)'}`)
console.log(`  occupation: ${occupationIdx >= 0 ? headers[occupationIdx] : '(none)'}`)
console.log(`  department: ${departmentIdx >= 0 ? headers[departmentIdx] : '(none)'}`)
console.log(`  consent:    ${consentIdx >= 0 ? headers[consentIdx] : '(none — all imported as hidden)'}`)

if (nameIdx === -1 || birthIdx === -1) {
  console.error('\nCould not find the required columns.')
  console.error(`  Headers in the file: ${headers.filter(Boolean).join(' | ')}`)
  console.error('\nThis does not modify anything. To fix it, either:')
  console.error('  a) rename those two columns in Excel to "Name" and "Birthday", or')
  console.error('  b) add the column numbers to the findColumn([...]) list near the top of')
  console.error('     this script, then re-run.')
  process.exit(1)
}

console.log(`\nReading ${dataRows.length} data rows.`)

const members = []
const skipped = []
const ambiguous = []

for (const [i, row] of dataRows.entries()) {
  const lineNo = i + 2
  const name = cellToString(row[nameIdx])
  const birth = parseDate(row[birthIdx])

  if (!name) { skipped.push({ lineNo, why: 'no name' }); continue }
  if (!birth) {
    skipped.push({ lineNo, why: `could not read birthday "${cellToString(row[birthIdx])}"`, name })
    continue
  }

  const anniversary = annivIdx >= 0 ? parseDate(row[annivIdx]) : null

  // Flag dates that are fragile under the chosen day/month reading. Two
  // distinct problems, both of which silently corrupt the spreadsheet:
  //   * valid now, but meaning a different date under the other reading
  //   * invalid now, but valid under the other reading — a strong signal the
  //     whole file is in the opposite format
  // A scrambled spreadsheet is worth catching before 40 birthdays are wrong.
  for (const [label, value, parsed] of [
    ['birthday', row[birthIdx], birth],
    ['anniversary', annivIdx >= 0 ? row[annivIdx] : null, anniversary],
  ]) {
    if (value === null || value === undefined) continue
    const raw = cellToString(value)
    const m = raw.match(/^(\d{1,2})[./-](\d{1,2})(?:[./-]\d{2,4})?$/)
    if (!m) continue

    const a = Number(m[1])
    const b = Number(m[2])
    const here = dateOrder === 'md' ? validate(b, a) : validate(a, b)
    const other = dateOrder === 'md' ? validate(a, b) : validate(b, a)

    if (!here && other) {
      ambiguous.push({
        name, label, raw, severity: 'order',
        detail: `invalid as day/month, valid as ${other.day}/${other.month} month/day`,
      })
    } else if (here && other && (here.day !== other.day || here.month !== other.month)) {
      ambiguous.push({
        name, label, raw, severity: 'both',
        detail: `read as ${here.day}/${here.month}, but could be ${other.day}/${other.month}`,
      })
    }
  }

  // Consent defaults to false, which keeps someone off the public page until
  // the admin confirms. Safer than guessing yes.
  let consent = false
  if (consentIdx >= 0) {
    const v = cellToString(row[consentIdx]).toLowerCase()
    consent = v === 'yes' || v === 'y' || v === 'true' || v === '1' || v === 'x'
  }

  members.push({
    full_name: name.slice(0, 120),
    gender: genderIdx >= 0 ? canonicalEnum(row[genderIdx], GENDER_OPTIONS) : null,
    phone: phoneIdx >= 0 ? cellToString(row[phoneIdx]).slice(0, 40) || null : null,
    email: emailIdx >= 0 ? cellToString(row[emailIdx]).slice(0, 254) || null : null,
    residential_address: addressIdx >= 0
      ? cellToString(row[addressIdx]).slice(0, 300) || null
      : null,
    membership_category: categoryIdx >= 0
      ? canonicalEnum(row[categoryIdx], CATEGORY_OPTIONS)
      : null,
    marital_status: maritalIdx >= 0
      ? canonicalEnum(row[maritalIdx], MARITAL_OPTIONS)
      : null,
    occupation: occupationIdx >= 0
      ? cellToString(row[occupationIdx]).slice(0, 120) || null
      : null,
    church_department: departmentIdx >= 0
      ? cellToString(row[departmentIdx]).slice(0, 120) || null
      : null,
    birth_day: birth.day,
    birth_month: birth.month,
    anniversary_day: anniversary?.day ?? null,
    anniversary_month: anniversary?.month ?? null,
    consent_to_display: consent,
  })
}

if (skipped.length > 0) {
  console.log(`\nSkipping ${skipped.length} row(s):`)
  for (const s of skipped) {
    console.log(`  line ${s.lineNo}${s.name ? ` (${s.name})` : ''}: ${s.why}`)
  }
}

if (ambiguous.length > 0) {
  const orderClues = ambiguous.filter((a) => a.severity === 'order')
  console.log(`\nWARNING: ${ambiguous.length} ambiguous date(s) — read as ${dateOrder === 'md' ? 'month/day' : 'day/month'}.`)
  for (const a of ambiguous.slice(0, 12)) {
    console.log(`  ${a.name} — ${a.label} "${a.raw}": ${a.detail}`)
  }
  if (ambiguous.length > 12) console.log(`  ... and ${ambiguous.length - 12} more`)
  if (orderClues.length > 0) {
    console.log(`\n  ${orderClues.length} of these are only valid in month/day order.`)
    console.log('  That usually means the whole sheet is US format. Cancel and re-run with:')
    console.log('    --date-order=md')
  }
}

if (members.length === 0) {
  console.error('\nNothing importable. Check the birthday column format.')
  process.exit(1)
}

const withConsent = members.filter((m) => m.consent_to_display).length
console.log(`\nReady to import ${members.length} member(s), ${withConsent} with consent.`)
console.log('This ADDS rows. Existing members are not touched or merged.')

if (dryRun) {
  console.log('\n--- DRY RUN, nothing written. First 10 rows that would be created: ---')
  const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  for (const m of members.slice(0, 10)) {
    const b = `${m.birth_day} ${MONTHS[m.birth_month]}`
    const a = m.anniversary_day ? `${m.anniversary_day} ${MONTHS[m.anniversary_month]}` : '-'
    console.log(
      `  ${m.full_name.padEnd(24).slice(0, 24)} b: ${b.padEnd(8)} a: ${a.padEnd(8)} ` +
      `phone: ${(m.phone ?? '-').padEnd(14).slice(0, 14)} consent: ${m.consent_to_display}`,
    )
  }
  if (members.length > 10) {
    console.log(`  ... and ${members.length - 10} more`)
  }
  console.log('\nRe-run without --dry-run to write these rows.')
  process.exit(0)
}

if (!assumeYes) {
  const readline = await import('node:readline/promises')
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question('Proceed? (y/N) ')
  rl.close()
  if (!/^y(es)?$/i.test(answer.trim())) {
    console.log('Cancelled. Nothing was written.')
    process.exit(0)
  }
}

const { error } = await supabase.from('members').insert(members)

if (error) {
  console.error('\nImport failed:', error.message)
  process.exit(1)
}

console.log(`\nImported ${members.length} member(s).`)
console.log('Open /admin in the browser to review them and toggle consent.')
