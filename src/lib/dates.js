// Date maths for celebrations.
//
// The database stores only a day and a month — no year — so every calculation
// here works in the "recurring annual date" sense rather than real dates.

import { addYears, format, isSameDay, startOfDay } from 'date-fns'

/**
 * The next date on or after `from` that falls on the given day/month.
 *
 * 29 February is the one genuinely awkward case. In a non-leap year it is
 * clamped to 28 February rather than skipped, because missing someone's
 * birthday once every four years would be worse than being a day early.
 * Returns null for impossible dates such as 31 April.
 */
export function nextOccurrence(day, month, from = new Date()) {
  const base = startOfDay(from)
  const currentYear = base.getFullYear()

  for (let year = currentYear; year <= currentYear + 1; year++) {
    const lastDay = new Date(year, month, 0).getDate()
    const clampedDay = day > lastDay ? (month === 2 && day === 29 ? 28 : null) : day
    if (clampedDay === null) continue

    const candidate = new Date(year, month - 1, clampedDay)
    if (!isSameDay(candidate, base) && candidate < base) continue
    if (candidate >= base) return candidate
  }

  return null
}

/** Whole days from today until the next occurrence. 0 means today. */
export function daysUntil(day, month, from = new Date()) {
  const next = nextOccurrence(day, month, from)
  if (!next) return null
  return Math.round((next.getTime() - startOfDay(from).getTime()) / 86_400_000)
}

export const isToday = (day, month, from = new Date()) => {
  const base = startOfDay(from)
  return day === base.getDate() && month === base.getMonth() + 1
}

export const formatToday = (from = new Date()) =>
  format(from, 'EEEE, d MMMM yyyy')

export const formatOccurrence = (date) => format(date, 'EEEE, d MMMM')

export const formatShort = (date) => format(date, 'd MMMM')

/** "in 3 days" / "tomorrow" / "today" */
export function relativeDays(days) {
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days} days`
}

/**
 * Builds the today + upcoming lists the public page renders.
 * `kind` is 'birthday' or 'anniversary'; rows without that date are skipped.
 */
export function buildCelebrations(people, kind, today = new Date()) {
  const dayKey = kind === 'birthday' ? 'birth_day' : 'anniversary_day'
  const monthKey = kind === 'birthday' ? 'birth_month' : 'anniversary_month'

  const out = []
  for (const person of people) {
    const day = person[dayKey]
    const month = person[monthKey]
    if (!day || !month) continue

    const date = nextOccurrence(day, month, today)
    if (!date) continue

    out.push({
      id: person.id,
      name: person.full_name,
      kind,
      date,
      daysAway: daysUntil(day, month, today),
    })
  }

  return out.sort((a, b) => a.daysAway - b.daysAway || a.name.localeCompare(b.name))
}

/** Splits a sorted list into what's happening today and what's ahead. */
export function partition(list) {
  return {
    today: list.filter((e) => e.daysAway === 0),
    upcoming: list.filter((e) => e.daysAway > 0).slice(0, 10),
  }
}

/** Turns a year-less day/month into a real Date, for the form's <select>s. */
export function yearForNextOccurrence(day, month, from = new Date()) {
  const next = nextOccurrence(day, month, from)
  return next ? next.getFullYear() : addYears(from, 1).getFullYear()
}

/**
 * Every member's celebration falling inside a specific calendar year, sorted
 * by date. Reuses nextOccurrence from 1 January, so 29 February clamps to
 * 28 February and impossible dates are skipped, exactly like everything else.
 */
export function buildCelebrationsForYear(people, kind, year) {
  const from = new Date(year, 0, 1)
  const dayKey = kind === 'birthday' ? 'birth_day' : 'anniversary_day'
  const monthKey = kind === 'birthday' ? 'birth_month' : 'anniversary_month'

  const out = []
  for (const person of people) {
    const day = person[dayKey]
    const month = person[monthKey]
    if (!day || !month) continue

    const date = nextOccurrence(day, month, from)
    if (!date || date.getFullYear() !== year) continue

    out.push({
      id: person.id,
      name: person.full_name,
      kind,
      date,
    })
  }

  return out.sort((a, b) => a.date - b.date || a.name.localeCompare(b.name))
}

/** Buckets a year's events into 12 month lists (index 0 = January). */
export function groupByMonth(events) {
  const months = Array.from({ length: 12 }, () => [])
  for (const event of events) months[event.date.getMonth()].push(event)
  return months
}
