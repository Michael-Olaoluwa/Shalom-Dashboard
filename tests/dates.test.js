// Run with: node --test tests/dates.test.js
//
// The recurring day/month maths is the part most likely to be subtly wrong,
// and the failures are invisible by eye (an off-by-one day just makes the
// dashboard quietly wrong on one date a year). So it gets tested.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildCelebrations,
  buildCelebrationsForYear,
  daysUntil,
  formatToday,
  groupByMonth,
  isToday,
  nextOccurrence,
  partition,
  relativeDays,
} from '../src/lib/dates.js'

const d = (iso) => new Date(`${iso}T12:00:00`)

test('nextOccurrence returns a date in the current year when it has not passed', () => {
  const result = nextOccurrence(25, 12, d('2026-03-15'))
  assert.equal(result.getFullYear(), 2026)
  assert.equal(result.getMonth(), 11)
  assert.equal(result.getDate(), 25)
})

test('nextOccurrence rolls into next year once the date has passed', () => {
  const result = nextOccurrence(1, 2, d('2026-03-15'))
  assert.equal(result.getFullYear(), 2027)
  assert.equal(result.getMonth(), 1)
  assert.equal(result.getDate(), 1)
})

test('nextOccurrence on the exact day returns today, not next year', () => {
  const result = nextOccurrence(15, 3, d('2026-03-15'))
  assert.equal(result.getFullYear(), 2026)
  assert.equal(result.getMonth(), 2)
  assert.equal(result.getDate(), 15)
})

test('29 February resolves to today in a leap year', () => {
  const result = nextOccurrence(29, 2, d('2024-02-29'))
  assert.equal(result.getMonth(), 1)
  assert.equal(result.getDate(), 29)
})

test('29 February clamps to 28 February in a non-leap year rather than skipping', () => {
  // 2026 is not a leap year. The birthday must still happen, a day early,
  // instead of vanishing for the whole year.
  const result = nextOccurrence(29, 2, d('2026-01-01'))
  assert.equal(result.getFullYear(), 2026)
  assert.equal(result.getMonth(), 1)
  assert.equal(result.getDate(), 28)
})

test('29 February rolls to next year when 28 February has already passed', () => {
  // From 1 March 2026, the next 29 Feb is in 2028 — but it must land on the
  // 28th, because 2028's 29th is 13 months away and 2027's doesn't exist.
  const result = nextOccurrence(29, 2, d('2026-03-01'))
  assert.equal(result.getFullYear(), 2027)
  assert.equal(result.getMonth(), 1)
  assert.equal(result.getDate(), 28)
})

test('impossible dates return null', () => {
  assert.equal(nextOccurrence(31, 4, d('2026-01-01')), null)
  assert.equal(nextOccurrence(31, 2, d('2026-01-01')), null)
  assert.equal(nextOccurrence(30, 2, d('2026-01-01')), null)
})

test('31-day months are valid', () => {
  for (const month of [1, 3, 5, 7, 8, 10, 12]) {
    assert.notEqual(nextOccurrence(31, month, d('2026-01-01')), null)
  }
})

test('daysUntil counts 0 today and 1 tomorrow', () => {
  assert.equal(daysUntil(15, 3, d('2026-03-15')), 0)
  assert.equal(daysUntil(16, 3, d('2026-03-15')), 1)
  assert.equal(daysUntil(14, 4, d('2026-03-15')), 30)
})

test('daysUntil crosses the year boundary correctly', () => {
  assert.equal(daysUntil(1, 1, d('2026-12-31')), 1)
  assert.equal(daysUntil(31, 12, d('2026-12-30')), 1)
})

test('daysUntil survives a DST transition', () => {
  // Clocks move forward in late March and back in early November. Counting
  // raw milliseconds makes the span 23 or 25 hours instead of 24, so these
  // only pass if the rounding is correct in both directions.
  assert.equal(daysUntil(30, 3, d('2026-03-28')), 2) // springs forward
  assert.equal(daysUntil(1, 11, d('2026-10-30')), 2) // falls back
  assert.equal(daysUntil(29, 3, d('2026-03-28')), 1) // the boundary day itself
})

test('isToday matches only the exact day and month', () => {
  assert.equal(isToday(15, 3, d('2026-03-15')), true)
  assert.equal(isToday(16, 3, d('2026-03-15')), false)
  assert.equal(isToday(15, 4, d('2026-03-15')), false)
})

test('relativeDays reads naturally', () => {
  assert.equal(relativeDays(0), 'today')
  assert.equal(relativeDays(1), 'tomorrow')
  assert.equal(relativeDays(5), 'in 5 days')
})

test('formatToday includes the weekday', () => {
  assert.match(formatToday(d('2026-03-15')), /Sunday/)
})

test('buildCelebrations skips members with no date for that kind', () => {
  const people = [
    { id: '1', full_name: 'Ada', birth_day: 15, birth_month: 3, anniversary_day: null, anniversary_month: null },
    { id: '2', full_name: 'Grace', birth_day: null, birth_month: null, anniversary_day: 20, anniversary_month: 6 },
  ]
  assert.equal(buildCelebrations(people, 'birthday', d('2026-01-01')).length, 1)
  assert.equal(buildCelebrations(people, 'anniversary', d('2026-01-01')).length, 1)
  assert.equal(buildCelebrations(people, 'anniversary', d('2026-01-01'))[0].name, 'Grace')
})

test('buildCelebrations sorts by soonest first', () => {
  const people = [
    { id: '1', full_name: 'Late', birth_day: 30, birth_month: 3 },
    { id: '2', full_name: 'Soon', birth_day: 16, birth_month: 3 },
    { id: '3', full_name: 'Today', birth_day: 15, birth_month: 3 },
  ]
  const result = buildCelebrations(people, 'birthday', d('2026-03-15'))
  assert.deepEqual(result.map((e) => e.name), ['Today', 'Soon', 'Late'])
})

test('buildCelebrations breaks ties by name', () => {
  const people = [
    { id: '1', full_name: 'Zoe', birth_day: 16, birth_month: 3 },
    { id: '2', full_name: 'Adam', birth_day: 16, birth_month: 3 },
  ]
  const result = buildCelebrations(people, 'birthday', d('2026-03-15'))
  assert.deepEqual(result.map((e) => e.name), ['Adam', 'Zoe'])
})

test('partition splits today from upcoming and caps upcoming at 10', () => {
  const people = Array.from({ length: 14 }, (_, i) => ({
    id: String(i),
    full_name: `Person ${i}`,
    birth_day: 15 + i,
    birth_month: 3,
  }))
  // Person 0 is today (15 Mar); the rest walk forward into April.
  const { today, upcoming } = partition(buildCelebrations(people, 'birthday', d('2026-03-15')))
  assert.equal(today.length, 1)
  assert.equal(today[0].name, 'Person 0')
  assert.equal(upcoming.length, 10)
  assert.ok(upcoming.every((e) => e.daysAway > 0))
})

test('partition does not repeat today inside upcoming', () => {
  const people = [{ id: '1', full_name: 'Ada', birth_day: 15, birth_month: 3 }]
  const { today, upcoming } = partition(buildCelebrations(people, 'birthday', d('2026-03-15')))
  assert.equal(today.length, 1)
  assert.equal(upcoming.length, 0)
})

test('buildCelebrationsForYear places every member inside the requested year', () => {
  const people = [
    { id: '1', full_name: 'Ada', birth_day: 25, birth_month: 12 },
    { id: '2', full_name: 'Bob', birth_day: 1, birth_month: 1 },
  ]
  const result = buildCelebrationsForYear(people, 'birthday', 2027)
  assert.deepEqual(
    result.map((e) => [e.name, e.date.getFullYear(), e.date.getMonth() + 1, e.date.getDate()]),
    [
      ['Bob', 2027, 1, 1],
      ['Ada', 2027, 12, 25],
    ],
  )
})

test('buildCelebrationsForYear clamps 29 February in a non-leap year', () => {
  const people = [{ id: '1', full_name: 'Leap', birth_day: 29, birth_month: 2 }]
  const result = buildCelebrationsForYear(people, 'birthday', 2027)
  assert.equal(result.length, 1)
  assert.equal(result[0].date.getMonth(), 1)
  assert.equal(result[0].date.getDate(), 28)
})

test('buildCelebrationsForYear ignores impossible dates', () => {
  const people = [{ id: '1', full_name: 'Impossible', birth_day: 31, birth_month: 4 }]
  assert.equal(buildCelebrationsForYear(people, 'birthday', 2027).length, 0)
})

test('groupByMonth buckets events by their month', () => {
  const events = [
    { id: '1', name: 'Jan', kind: 'birthday', date: d('2026-01-05') },
    { id: '2', name: 'Dec', kind: 'anniversary', date: d('2026-12-25') },
    { id: '3', name: 'Jan2', kind: 'birthday', date: d('2026-01-20') },
  ]
  const months = groupByMonth(events)
  assert.equal(months.length, 12)
  assert.deepEqual(months[0].map((e) => e.name), ['Jan', 'Jan2'])
  assert.deepEqual(months[11].map((e) => e.name), ['Dec'])
  assert.equal(months[5].length, 0)
})
